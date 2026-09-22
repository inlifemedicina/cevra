use crate::protocol::{
    DesktopCommandError, HostRequest, HostResponse, JsonLineFramer, PendingRequests,
    MAX_MESSAGE_BYTES, PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{mpsc, oneshot, watch, Mutex as AsyncMutex};

#[derive(Clone, Copy)]
struct SupervisorTimeouts {
    hello: Duration,
    control: Duration,
    mutation: Duration,
    reconciliation: Duration,
    shutdown: Duration,
}

impl Default for SupervisorTimeouts {
    fn default() -> Self {
        Self {
            hello: Duration::from_secs(30),
            control: Duration::from_secs(30),
            mutation: Duration::from_secs(6 * 60 * 60),
            reconciliation: Duration::from_secs(30),
            shutdown: Duration::from_secs(5),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Lifecycle {
    Stopped,
    Starting,
    Ready,
    Stopping,
    Recoverable,
    Failed,
}

trait ProcessControl: Send + Sync {
    fn write(&self, bytes: &[u8]) -> Result<(), DesktopCommandError>;
    fn kill(&self);
}

struct TauriProcessControl {
    child: Mutex<Option<CommandChild>>,
}

impl ProcessControl for TauriProcessControl {
    fn write(&self, bytes: &[u8]) -> Result<(), DesktopCommandError> {
        self.child
            .lock()
            .map_err(lock_error)?
            .as_mut()
            .ok_or_else(|| {
                DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host is unavailable.")
            })?
            .write(bytes)
            .map_err(|_| {
                DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host stdin is unavailable.")
            })
    }

    fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
        }
    }
}

enum HostEvent {
    Stdout(Vec<u8>),
    Stderr(Vec<u8>),
    Terminated,
    Error,
}

struct LaunchedHost {
    control: Arc<dyn ProcessControl>,
    events: mpsc::Receiver<HostEvent>,
}

struct SupervisorCore {
    process: Mutex<Option<Arc<dyn ProcessControl>>>,
    pending: Mutex<PendingRequests>,
    lifecycle: watch::Sender<Lifecycle>,
    next_id: AtomicU64,
    restart_count: AtomicU64,
    timeouts: SupervisorTimeouts,
}

impl SupervisorCore {
    fn new(timeouts: SupervisorTimeouts) -> Self {
        let (lifecycle, _) = watch::channel(Lifecycle::Stopped);
        Self {
            process: Mutex::new(None),
            pending: Mutex::new(PendingRequests::default()),
            lifecycle,
            next_id: AtomicU64::new(1),
            restart_count: AtomicU64::new(0),
            timeouts,
        }
    }

    fn state(&self) -> Lifecycle {
        *self.lifecycle.borrow()
    }
    fn set_state(&self, state: Lifecycle) {
        self.lifecycle.send_replace(state);
    }

    fn install(&self, control: Arc<dyn ProcessControl>) -> Result<(), DesktopCommandError> {
        *self.process.lock().map_err(lock_error)? = Some(control);
        Ok(())
    }

    fn mark_ready(&self) -> Result<(), DesktopCommandError> {
        if self.state() != Lifecycle::Starting {
            return Err(DesktopCommandError::new(
                "HOST_SUPERVISOR_FAILED",
                "Desktop host lifecycle is invalid.",
            ));
        }
        self.set_state(Lifecycle::Ready);
        Ok(())
    }

    async fn request_control(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value, DesktopCommandError> {
        self.request_timed(method, params, self.timeouts.control, false)
            .await
    }

    async fn request_internal(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, DesktopCommandError> {
        self.request_timed(method, params, timeout, true).await
    }

    async fn request_immediate_mutation(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value, DesktopCommandError> {
        let (id, mut receiver) = self.begin_request(method, params, false)?;
        match tokio::time::timeout(self.timeouts.control, &mut receiver).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host response channel closed.",
            )),
            Err(_) => {
                self.pending.lock().map_err(lock_error)?.remove(&id);
                let error = DesktopCommandError::new("HOST_UNAVAILABLE", "A canonical desktop mutation timed out; the session was stopped to prevent an invisible late mutation.");
                self.fail(error.clone());
                Err(error)
            }
        }
    }

    async fn request_mutating(
        &self,
        method: &str,
        params: Value,
        operation_id: &str,
    ) -> Result<Value, DesktopCommandError> {
        let (id, mut receiver) = self.begin_request(method, params, false)?;
        match tokio::time::timeout(self.timeouts.mutation, &mut receiver).await {
            Ok(Ok(outcome)) => return outcome,
            Ok(Err(_)) => {
                return Err(DesktopCommandError::new(
                    "HOST_UNAVAILABLE",
                    "Desktop host response channel closed.",
                ))
            }
            Err(_) => {}
        }

        let _ = self
            .request_internal(
                "operation.cancel",
                json!({ "operationId": operation_id }),
                self.timeouts.control,
            )
            .await;
        match tokio::time::timeout(self.timeouts.reconciliation, &mut receiver).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(_))) => {
                let state = match self
                    .request_internal("project.snapshot", json!({}), self.timeouts.control)
                    .await
                {
                    Ok(state) => state,
                    Err(_) => {
                        let error = DesktopCommandError::new(
                            "HOST_UNAVAILABLE",
                            "The timed-out operation settled, but canonical state reconciliation failed; the session was stopped.",
                        );
                        self.fail(error.clone());
                        return Err(error);
                    }
                };
                Err(DesktopCommandError::new(
                    "OPERATION_TIMEOUT",
                    "The desktop operation timed out, was cancelled, and the project state was reconciled.",
                ).with_details(json!({ "state": state })))
            }
            Ok(Err(_)) => Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host response channel closed.",
            )),
            Err(_) => {
                self.pending.lock().map_err(lock_error)?.remove(&id);
                let error = DesktopCommandError::new("HOST_UNAVAILABLE", "The timed-out operation did not settle after cancellation; the session was stopped.");
                self.fail(error.clone());
                Err(error)
            }
        }
    }

    async fn request_timed(
        &self,
        method: &str,
        params: Value,
        duration: Duration,
        internal: bool,
    ) -> Result<Value, DesktopCommandError> {
        let (id, receiver) = self.begin_request(method, params, internal)?;
        match tokio::time::timeout(duration, receiver).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host response channel closed.",
            )),
            Err(_) => {
                self.pending.lock().map_err(lock_error)?.remove(&id);
                Err(DesktopCommandError::new(
                    "HOST_TIMEOUT",
                    "Desktop host request timed out.",
                ))
            }
        }
    }

    fn begin_request(
        &self,
        method: &str,
        params: Value,
        internal: bool,
    ) -> Result<
        (
            String,
            oneshot::Receiver<Result<Value, DesktopCommandError>>,
        ),
        DesktopCommandError,
    > {
        let state = self.state();
        let permitted = state == Lifecycle::Ready
            || (internal && matches!(state, Lifecycle::Starting | Lifecycle::Stopping));
        if !permitted {
            return Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host is not ready.",
            ));
        }
        let id = format!("desktop-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let encoded = serde_json::to_vec(&HostRequest {
            protocol_version: PROTOCOL_VERSION,
            id: &id,
            method,
            params,
        })
        .map_err(|_| {
            DesktopCommandError::new(
                "HOST_INVALID_REQUEST",
                "Desktop request could not be encoded.",
            )
        })?;
        if encoded.len() > MAX_MESSAGE_BYTES {
            return Err(DesktopCommandError::new(
                "HOST_MESSAGE_TOO_LARGE",
                "Desktop request exceeded the protocol limit.",
            ));
        }
        let (sender, receiver) = oneshot::channel();
        self.pending
            .lock()
            .map_err(lock_error)?
            .insert(id.clone(), sender)?;
        let process = self
            .process
            .lock()
            .map_err(lock_error)?
            .clone()
            .ok_or_else(|| {
                DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host is unavailable.")
            })?;
        if let Err(error) = process.write(&[encoded.as_slice(), b"\n"].concat()) {
            self.pending.lock().map_err(lock_error)?.remove(&id);
            self.fail(error.clone());
            return Err(error);
        }
        Ok((id, receiver))
    }

    fn accept_stdout(
        &self,
        framer: &mut JsonLineFramer,
        bytes: &[u8],
    ) -> Result<(), DesktopCommandError> {
        for line in framer.push(bytes)? {
            let response = serde_json::from_slice::<HostResponse>(&line).map_err(|_| {
                DesktopCommandError::new(
                    "HOST_MALFORMED_RESPONSE",
                    "Desktop host returned malformed protocol data.",
                )
            })?;
            if response.protocol_version() != PROTOCOL_VERSION {
                return Err(DesktopCommandError::new(
                    "HOST_PROTOCOL_MISMATCH",
                    "Desktop host protocol mismatch.",
                ));
            }
            self.pending.lock().map_err(lock_error)?.resolve(response);
        }
        Ok(())
    }

    fn terminated(&self, framing: Result<(), DesktopCommandError>) {
        if let Err(error) = framing {
            self.fail(error);
            return;
        }
        if self.state() == Lifecycle::Stopping {
            self.process.lock().ok().map(|mut process| process.take());
            self.pending.lock().ok().map(|mut pending| {
                pending.reject_all(DesktopCommandError::new(
                    "HOST_UNAVAILABLE",
                    "Desktop host stopped.",
                ))
            });
            self.set_state(Lifecycle::Stopped);
        } else if self.state() == Lifecycle::Ready
            && self.restart_count.load(Ordering::Relaxed) == 0
        {
            self.process.lock().ok().map(|mut process| process.take());
            self.set_state(Lifecycle::Recoverable);
            self.pending.lock().ok().map(|mut pending| {
                pending.reject_all(DesktopCommandError::new(
                    "HOST_PROCESS_EXITED",
                    "Desktop host exited unexpectedly; durable recovery is available.",
                ))
            });
        } else if self.state() != Lifecycle::Failed {
            self.fail(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host recovery is unavailable.",
            ));
        }
    }

    fn fail(&self, error: DesktopCommandError) {
        self.set_state(Lifecycle::Failed);
        if let Ok(mut pending) = self.pending.lock() {
            pending.reject_all(error);
        }
        if let Ok(mut process) = self.process.lock() {
            if let Some(process) = process.take() {
                process.kill();
            }
        }
    }

    fn force_stop(&self) {
        if let Ok(mut process) = self.process.lock() {
            if let Some(process) = process.take() {
                process.kill();
            }
        }
        if let Ok(mut pending) = self.pending.lock() {
            pending.reject_all(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host stopped.",
            ));
        }
        self.set_state(Lifecycle::Stopped);
    }
}

pub struct DesktopHostSupervisor {
    core: Arc<SupervisorCore>,
    start_guard: AsyncMutex<()>,
}

impl DesktopHostSupervisor {
    pub fn new() -> Self {
        Self::with_timeouts(SupervisorTimeouts::default())
    }
    fn with_timeouts(timeouts: SupervisorTimeouts) -> Self {
        Self {
            core: Arc::new(SupervisorCore::new(timeouts)),
            start_guard: AsyncMutex::new(()),
        }
    }

    pub async fn ensure_started(&self, app: &AppHandle) -> Result<(), DesktopCommandError> {
        self.ensure_started_with_mode(|recovering| launch_tauri_host(app, recovering))
            .await
    }

    #[cfg(test)]
    async fn ensure_started_with<F>(&self, launch: F) -> Result<(), DesktopCommandError>
    where
        F: FnOnce() -> Result<LaunchedHost, DesktopCommandError>,
    {
        self.ensure_started_with_mode(|_| launch()).await
    }

    async fn ensure_started_with_mode<F>(&self, launch: F) -> Result<(), DesktopCommandError>
    where
        F: FnOnce(bool) -> Result<LaunchedHost, DesktopCommandError>,
    {
        if self.core.state() == Lifecycle::Ready {
            return Ok(());
        }
        if self.core.state() == Lifecycle::Failed {
            return Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host session failed closed.",
            ));
        }
        let _guard = self.start_guard.lock().await;
        if self.core.state() == Lifecycle::Ready {
            return Ok(());
        }
        if self.core.state() == Lifecycle::Failed {
            return Err(DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host session failed closed.",
            ));
        }
        let recovering = self.core.state() == Lifecycle::Recoverable;
        if recovering && self.core.restart_count.fetch_add(1, Ordering::Relaxed) > 0 {
            let error = DesktopCommandError::new(
                "HOST_UNAVAILABLE",
                "Desktop host recovery limit was reached.",
            );
            self.core.fail(error.clone());
            return Err(error);
        }
        self.core.set_state(Lifecycle::Starting);
        let launched = launch(recovering).map_err(|error| {
            self.core.fail(error.clone());
            error
        })?;
        self.core.install(launched.control).map_err(|error| {
            self.core.fail(error.clone());
            error
        })?;
        spawn_event_loop(Arc::clone(&self.core), launched.events);
        let hello = match self
            .core
            .request_internal("host.hello", json!({}), self.core.timeouts.hello)
            .await
        {
            Ok(value) => value,
            Err(error) => {
                self.core.fail(error.clone());
                return Err(error);
            }
        };
        if hello.get("identity").and_then(Value::as_str) != Some("cevra.desktop-host")
            || hello.get("version").and_then(Value::as_str) != Some("0.1.0")
            || hello.get("protocolVersion").and_then(Value::as_u64) != Some(PROTOCOL_VERSION.into())
        {
            let error = DesktopCommandError::new(
                "HOST_PROTOCOL_MISMATCH",
                "Desktop host identity or protocol mismatch.",
            );
            self.core.fail(error.clone());
            return Err(error);
        }
        self.core.mark_ready()
    }

    pub async fn request_control(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value, DesktopCommandError> {
        self.core.request_control(method, params).await
    }
    pub async fn request_immediate_mutation(
        &self,
        method: &str,
        params: Value,
    ) -> Result<Value, DesktopCommandError> {
        self.core.request_immediate_mutation(method, params).await
    }
    pub async fn request_mutating(
        &self,
        method: &str,
        params: Value,
        operation_id: &str,
    ) -> Result<Value, DesktopCommandError> {
        self.core
            .request_mutating(method, params, operation_id)
            .await
    }

    pub async fn recover_state_after_process_loss(
        &self,
        app: &AppHandle,
        error: DesktopCommandError,
    ) -> Result<Value, DesktopCommandError> {
        if error.code != "HOST_PROCESS_EXITED" {
            return Err(error);
        }
        self.ensure_started(app).await?;
        self.core
            .request_control("project.snapshot", json!({}))
            .await
    }

    pub async fn shutdown(&self) {
        if self.core.state() == Lifecycle::Stopped {
            return;
        }
        if self.core.state() != Lifecycle::Ready {
            self.core.force_stop();
            return;
        }
        let mut lifecycle = self.core.lifecycle.subscribe();
        self.core.set_state(Lifecycle::Stopping);
        let _ = self
            .core
            .request_internal("host.shutdown", json!({}), self.core.timeouts.shutdown)
            .await;
        let wait_for_stop = async {
            while *lifecycle.borrow() != Lifecycle::Stopped {
                lifecycle.changed().await.map_err(|_| ())?;
            }
            Ok::<(), ()>(())
        };
        if tokio::time::timeout(self.core.timeouts.shutdown, wait_for_stop)
            .await
            .is_err()
        {
            self.core.force_stop();
        }
    }
}

fn launch_tauri_host(
    app: &AppHandle,
    recovering: bool,
) -> Result<LaunchedHost, DesktopCommandError> {
    let script = app
        .path()
        .resolve(
            "desktop-host/desktop-host.cjs",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|_| {
            DesktopCommandError::new("HOST_START_FAILED", "Desktop host resource is unavailable.")
        })?;
    let command = app
        .shell()
        .sidecar("cevra-node")
        .map_err(|_| {
            DesktopCommandError::new("HOST_START_FAILED", "Private Node runtime is unavailable.")
        })?
        .arg(script)
        .env_clear()
        .env("LANG", "C.UTF-8")
        .env("LC_ALL", "C.UTF-8")
        .envs(trusted_runtime_environment(app, recovering)?);
    let (mut receiver, child) = command.set_raw_out(true).spawn().map_err(|_| {
        DesktopCommandError::new("HOST_START_FAILED", "Desktop host could not be started.")
    })?;
    let (events_tx, events_rx) = mpsc::channel(64);
    tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
            let event = match event {
                CommandEvent::Stdout(bytes) => HostEvent::Stdout(bytes),
                CommandEvent::Stderr(bytes) => HostEvent::Stderr(bytes),
                CommandEvent::Terminated(_) => HostEvent::Terminated,
                CommandEvent::Error(_) => HostEvent::Error,
                _ => continue,
            };
            if events_tx.send(event).await.is_err() {
                break;
            }
        }
    });
    Ok(LaunchedHost {
        control: Arc::new(TauriProcessControl {
            child: Mutex::new(Some(child)),
        }),
        events: events_rx,
    })
}

fn spawn_event_loop(core: Arc<SupervisorCore>, mut receiver: mpsc::Receiver<HostEvent>) {
    tauri::async_runtime::spawn(async move {
        let mut framer = JsonLineFramer::new();
        while let Some(event) = receiver.recv().await {
            match event {
                HostEvent::Stdout(bytes) => {
                    if let Err(error) = core.accept_stdout(&mut framer, &bytes) {
                        core.fail(error);
                        return;
                    }
                }
                HostEvent::Stderr(bytes) => eprintln!(
                    "[cevra-desktop-host] {}",
                    String::from_utf8_lossy(&bytes).trim_end()
                ),
                HostEvent::Terminated => {
                    core.terminated(framer.finish());
                    return;
                }
                HostEvent::Error => {
                    core.fail(DesktopCommandError::new(
                        "HOST_UNAVAILABLE",
                        "Desktop host process failed.",
                    ));
                    return;
                }
            }
        }
        core.terminated(framer.finish());
    });
}

fn trusted_runtime_environment(
    app: &AppHandle,
    recovering: bool,
) -> Result<BTreeMap<String, String>, DesktopCommandError> {
    let mut allowed = BTreeMap::new();
    let persistence_root = app
        .path()
        .app_data_dir()
        .map_err(|_| {
            DesktopCommandError::new(
                "PROJECT_PERSISTENCE_UNAVAILABLE",
                "Trusted application data is unavailable.",
            )
        })?
        .join("projects")
        .join("active-v1");
    let persistence_root = persistence_root.to_str().ok_or_else(|| {
        DesktopCommandError::new(
            "PROJECT_PERSISTENCE_UNAVAILABLE",
            "Trusted application data path is invalid.",
        )
    })?;
    allowed.insert(
        "CEVRA_PROJECT_PERSISTENCE_ROOT".into(),
        persistence_root.to_owned(),
    );
    if recovering {
        allowed.insert("CEVRA_HOST_RECOVERY".into(), "1".into());
    }
    if !cfg!(debug_assertions) {
        if let Ok(resources) = app.path().resource_dir() {
            let media = resources.join("media-runtime");
            if media.join("manifest.json").is_file() {
                allowed.insert(
                    "CEVRA_MEDIA_RUNTIME_ROOT".into(),
                    media.to_string_lossy().into_owned(),
                );
                allowed.insert("CEVRA_MEDIA_RUNTIME_MODE".into(), "release".into());
            }
            let private_python = resources.join("python-runtime");
            let transcription = resources.join("transcription-runtime");
            let model_cache = resources.join("models");
            let python = transcription.join(venv_python_relative_path(cfg!(windows)));
            if private_python.is_dir()
                && transcription.is_dir()
                && model_cache.is_dir()
                && python.is_file()
            {
                allowed.insert("CEVRA_TRANSCRIPTION_MODE".into(), "managed".into());
                allowed.insert(
                    "CEVRA_TRANSCRIPTION_PYTHON".into(),
                    python.to_string_lossy().into_owned(),
                );
                allowed.insert(
                    "CEVRA_TRANSCRIPTION_ENV_ROOT".into(),
                    transcription.to_string_lossy().into_owned(),
                );
                allowed.insert(
                    "CEVRA_PRIVATE_PYTHON_ROOT".into(),
                    private_python.to_string_lossy().into_owned(),
                );
                allowed.insert(
                    "CEVRA_TRANSCRIPTION_MODEL_CACHE".into(),
                    model_cache.to_string_lossy().into_owned(),
                );
            }
        }
        return Ok(allowed);
    }
    for name in [
        "CEVRA_MEDIA_RUNTIME_ROOT",
        "CEVRA_MEDIA_RUNTIME_MODE",
        "CEVRA_TRANSCRIPTION_MODE",
        "CEVRA_TRANSCRIPTION_PYTHON",
        "CEVRA_TRANSCRIPTION_ENV_ROOT",
        "CEVRA_TRANSCRIPTION_WORKER",
        "CEVRA_PRIVATE_PYTHON_ROOT",
        "CEVRA_TRANSCRIPTION_MODEL_CACHE",
        "CEVRA_TRANSCRIPTION_MODEL_ID",
        "CEVRA_TRANSCRIPTION_DEVICE",
        "CEVRA_TRANSCRIPTION_COMPUTE_TYPE",
    ] {
        if let Ok(value) = std::env::var(name) {
            allowed.insert(name.to_string(), value);
        }
    }
    Ok(allowed)
}

fn venv_python_relative_path(windows: bool) -> &'static str {
    if windows {
        "Scripts/python.exe"
    } else {
        "bin/python3"
    }
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> DesktopCommandError {
    DesktopCommandError::new(
        "HOST_SUPERVISOR_FAILED",
        "Desktop host supervisor state is unavailable.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn private_engine_venv_layout_is_platform_specific() {
        assert_eq!(venv_python_relative_path(false), "bin/python3");
        assert_eq!(venv_python_relative_path(true), "Scripts/python.exe");
    }

    #[derive(Clone, Copy)]
    enum HelloMode {
        Valid,
        Mismatch,
        Manual,
    }

    struct FakeControl {
        events: mpsc::Sender<HostEvent>,
        writes: Mutex<Vec<Value>>,
        kills: AtomicUsize,
        hello: HelloMode,
        shutdown_responds: bool,
        cancel_original: bool,
        snapshot_revision: u64,
    }

    impl FakeControl {
        fn send_result(&self, id: &str, result: Value) {
            let line = format!(
                "{}\n",
                json!({ "protocolVersion": 1, "id": id, "result": result })
            );
            self.events
                .try_send(HostEvent::Stdout(line.into_bytes()))
                .unwrap();
        }

        fn send_error(&self, id: &str, code: &str) {
            let line = format!(
                "{}\n",
                json!({ "protocolVersion": 1, "id": id, "error": { "code": code, "message": "safe" } })
            );
            self.events
                .try_send(HostEvent::Stdout(line.into_bytes()))
                .unwrap();
        }

        fn request(&self, method: &str) -> Value {
            self.writes
                .lock()
                .unwrap()
                .iter()
                .find(|request| request["method"] == method)
                .cloned()
                .expect("request not written")
        }
    }

    impl ProcessControl for FakeControl {
        fn write(&self, bytes: &[u8]) -> Result<(), DesktopCommandError> {
            let request: Value =
                serde_json::from_slice(bytes.strip_suffix(b"\n").unwrap_or(bytes)).unwrap();
            self.writes.lock().unwrap().push(request.clone());
            let id = request["id"].as_str().unwrap();
            match request["method"].as_str().unwrap() {
                "host.hello" => match self.hello {
                    HelloMode::Valid => self.send_result(id, json!({ "identity": "cevra.desktop-host", "version": "0.1.0", "protocolVersion": 1 })),
                    HelloMode::Mismatch => self.send_result(id, json!({ "identity": "wrong", "version": "0.1.0", "protocolVersion": 1 })),
                    HelloMode::Manual => {}
                },
                "project.snapshot" | "host.status" => self.send_result(id, json!({ "project": { "history": { "revision": self.snapshot_revision } } })),
                "operation.cancel" => {
                    self.send_result(id, json!({ "operationId": request["params"]["operationId"], "cancelled": true }));
                    if self.cancel_original {
                        let original = self.writes.lock().unwrap().iter().find(|value| {
                            matches!(value["method"].as_str(), Some("media.ingestLocal" | "transcription.transcribeSource"))
                        }).cloned();
                        if let Some(original) = original { self.send_error(original["id"].as_str().unwrap(), "OPERATION_CANCELLED"); }
                    }
                }
                "host.shutdown" if self.shutdown_responds => {
                    self.send_result(id, json!({ "shuttingDown": true }));
                    self.events.try_send(HostEvent::Terminated).unwrap();
                }
                _ => {}
            }
            Ok(())
        }

        fn kill(&self) {
            self.kills.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn timeouts() -> SupervisorTimeouts {
        SupervisorTimeouts {
            hello: Duration::from_millis(100),
            control: Duration::from_millis(100),
            mutation: Duration::from_millis(10),
            reconciliation: Duration::from_millis(100),
            shutdown: Duration::from_millis(20),
        }
    }

    fn fake_launch(
        hello: HelloMode,
        shutdown_responds: bool,
        cancel_original: bool,
    ) -> (LaunchedHost, Arc<FakeControl>) {
        fake_launch_with_revision(hello, shutdown_responds, cancel_original, 0)
    }

    fn fake_launch_with_revision(
        hello: HelloMode,
        shutdown_responds: bool,
        cancel_original: bool,
        snapshot_revision: u64,
    ) -> (LaunchedHost, Arc<FakeControl>) {
        let (events, receiver) = mpsc::channel(64);
        let control = Arc::new(FakeControl {
            events,
            writes: Mutex::new(Vec::new()),
            kills: AtomicUsize::new(0),
            hello,
            shutdown_responds,
            cancel_original,
            snapshot_revision,
        });
        (
            LaunchedHost {
                control: control.clone(),
                events: receiver,
            },
            control,
        )
    }

    async fn wait_for_write(control: &FakeControl, method: &str) -> Value {
        tokio::time::timeout(Duration::from_millis(200), async {
            loop {
                if let Some(value) = control
                    .writes
                    .lock()
                    .unwrap()
                    .iter()
                    .find(|value| value["method"] == method)
                    .cloned()
                {
                    return value;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("request write timed out")
    }

    #[tokio::test]
    async fn successful_startup_completes_hello_before_ready() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, _) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        assert_eq!(supervisor.core.state(), Lifecycle::Ready);
    }

    #[tokio::test]
    async fn identity_mismatch_fails_permanently() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, control) = fake_launch(HelloMode::Mismatch, true, false);
        assert_eq!(
            supervisor
                .ensure_started_with(|| Ok(launched))
                .await
                .unwrap_err()
                .code,
            "HOST_PROTOCOL_MISMATCH"
        );
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
        assert_eq!(control.kills.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn concurrent_start_callers_launch_one_host() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let launches = Arc::new(AtomicUsize::new(0));
        let first = {
            let supervisor = supervisor.clone();
            let launches = launches.clone();
            async move {
                supervisor
                    .ensure_started_with(|| {
                        launches.fetch_add(1, Ordering::Relaxed);
                        Ok(fake_launch(HelloMode::Valid, true, false).0)
                    })
                    .await
            }
        };
        let second = {
            let supervisor = supervisor.clone();
            let launches = launches.clone();
            async move {
                supervisor
                    .ensure_started_with(|| {
                        launches.fetch_add(1, Ordering::Relaxed);
                        Ok(fake_launch(HelloMode::Valid, true, false).0)
                    })
                    .await
            }
        };
        let (first, second) = tokio::join!(first, second);
        first.unwrap();
        second.unwrap();
        assert_eq!(launches.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn public_requests_are_rejected_until_hello_marks_ready() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Manual, true, false);
        let starting = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move { supervisor.ensure_started_with(|| Ok(launched)).await })
        };
        let hello = wait_for_write(&control, "host.hello").await;
        assert_eq!(
            supervisor
                .request_control("project.snapshot", json!({}))
                .await
                .unwrap_err()
                .code,
            "HOST_UNAVAILABLE"
        );
        control.send_result(
            hello["id"].as_str().unwrap(),
            json!({ "identity": "cevra.desktop-host", "version": "0.1.0", "protocolVersion": 1 }),
        );
        starting.await.unwrap().unwrap();
        assert_eq!(supervisor.core.state(), Lifecycle::Ready);
    }

    #[tokio::test]
    async fn concurrent_requests_route_out_of_order_responses() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        let first = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move { supervisor.request_control("first", json!({})).await })
        };
        let second = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move { supervisor.request_control("second", json!({})).await })
        };
        let first_request = wait_for_write(&control, "first").await;
        let second_request = wait_for_write(&control, "second").await;
        control.send_result(second_request["id"].as_str().unwrap(), json!("second"));
        control.send_result(first_request["id"].as_str().unwrap(), json!("first"));
        assert_eq!(first.await.unwrap().unwrap(), json!("first"));
        assert_eq!(second.await.unwrap().unwrap(), json!("second"));
    }

    #[tokio::test]
    async fn mutating_timeout_cancels_settles_and_reconciles_state() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, control) = fake_launch(HelloMode::Valid, true, true);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        let error = supervisor
            .request_mutating(
                "transcription.transcribeSource",
                json!({ "operationId": "op-1" }),
                "op-1",
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, "OPERATION_TIMEOUT");
        assert_eq!(
            error.details.unwrap()["state"]["project"]["history"]["revision"],
            0
        );
        assert_eq!(
            control.request("operation.cancel")["params"]["operationId"],
            "op-1"
        );
        assert_eq!(
            control.request("project.snapshot")["method"],
            "project.snapshot"
        );
        let original = control.request("transcription.transcribeSource");
        control.send_result(original["id"].as_str().unwrap(), json!({ "late": true }));
        assert_eq!(
            supervisor
                .request_control("host.status", json!({}))
                .await
                .unwrap()["project"]["history"]["revision"],
            0
        );
    }

    #[tokio::test]
    async fn mutating_timeout_returns_a_late_canonical_success_without_cross_routing() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();

        let operation = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move {
                supervisor
                    .request_mutating(
                        "media.ingestLocal",
                        json!({ "operationId": "op-late-success" }),
                        "op-late-success",
                    )
                    .await
            })
        };
        let original = wait_for_write(&control, "media.ingestLocal").await;
        wait_for_write(&control, "operation.cancel").await;
        let canonical = json!({ "project": { "history": { "revision": 1 } } });
        control.send_result(original["id"].as_str().unwrap(), canonical.clone());
        assert_eq!(operation.await.unwrap().unwrap(), canonical);
        assert_eq!(supervisor.core.state(), Lifecycle::Ready);
        assert_eq!(supervisor.core.pending.lock().unwrap().len(), 0);

        let next = {
            let supervisor = supervisor.clone();
            tokio::spawn(
                async move { supervisor.request_control("after-success", json!({})).await },
            )
        };
        let next_request = wait_for_write(&control, "after-success").await;
        control.send_result(original["id"].as_str().unwrap(), json!("stale-duplicate"));
        control.send_result(next_request["id"].as_str().unwrap(), json!("next-result"));
        assert_eq!(next.await.unwrap().unwrap(), json!("next-result"));
        assert_eq!(supervisor.core.state(), Lifecycle::Ready);
    }

    #[tokio::test]
    async fn immediate_mutation_timeout_terminally_fails_and_cannot_restart_session() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();

        let error = supervisor
            .request_immediate_mutation("history.undo", json!({}))
            .await
            .unwrap_err();
        assert_eq!(error.code, "HOST_UNAVAILABLE");
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
        assert_eq!(supervisor.core.pending.lock().unwrap().len(), 0);
        assert_eq!(control.kills.load(Ordering::Relaxed), 1);

        let original = control.request("history.undo");
        control.send_result(original["id"].as_str().unwrap(), json!({ "late": true }));
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
        assert_eq!(
            supervisor
                .request_control("project.snapshot", json!({}))
                .await
                .unwrap_err()
                .code,
            "HOST_UNAVAILABLE"
        );
        let launches = AtomicUsize::new(0);
        assert_eq!(
            supervisor
                .ensure_started_with(|| {
                    launches.fetch_add(1, Ordering::Relaxed);
                    Ok(fake_launch(HelloMode::Valid, true, false).0)
                })
                .await
                .unwrap_err()
                .code,
            "HOST_UNAVAILABLE"
        );
        assert_eq!(launches.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn malformed_stdout_fails_session_and_rejects_pending() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        let pending = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move { supervisor.request_control("pending", json!({})).await })
        };
        wait_for_write(&control, "pending").await;
        control
            .events
            .send(HostEvent::Stdout(b"not-json\n".to_vec()))
            .await
            .unwrap();
        assert_eq!(
            pending.await.unwrap().unwrap_err().code,
            "HOST_MALFORMED_RESPONSE"
        );
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
    }

    #[tokio::test]
    async fn response_protocol_mismatch_fails_the_ready_session() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        let pending = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move { supervisor.request_control("pending", json!({})).await })
        };
        let request = wait_for_write(&control, "pending").await;
        let line = format!(
            "{}\n",
            json!({ "protocolVersion": 2, "id": request["id"], "result": null })
        );
        control
            .events
            .send(HostEvent::Stdout(line.into_bytes()))
            .await
            .unwrap();
        assert_eq!(
            pending.await.unwrap().unwrap_err().code,
            "HOST_PROTOCOL_MISMATCH"
        );
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
    }

    #[tokio::test]
    async fn unexpected_termination_allows_one_bounded_durable_restart_without_replay() {
        let supervisor = Arc::new(DesktopHostSupervisor::with_timeouts(timeouts()));
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        let pending = {
            let supervisor = supervisor.clone();
            tokio::spawn(async move {
                supervisor
                    .request_mutating(
                        "media.ingestLocal",
                        json!({ "operationId": "interrupted-import" }),
                        "interrupted-import",
                    )
                    .await
            })
        };
        wait_for_write(&control, "media.ingestLocal").await;
        control.events.send(HostEvent::Terminated).await.unwrap();
        assert_eq!(
            pending.await.unwrap().unwrap_err().code,
            "HOST_PROCESS_EXITED"
        );
        assert_eq!(supervisor.core.state(), Lifecycle::Recoverable);
        let launches = AtomicUsize::new(0);
        let (recovered, recovered_control) =
            fake_launch_with_revision(HelloMode::Valid, true, false, 7);
        supervisor
            .ensure_started_with_mode(|recovering| {
                assert!(recovering);
                launches.fetch_add(1, Ordering::Relaxed);
                Ok(recovered)
            })
            .await
            .unwrap();
        assert_eq!(supervisor.core.state(), Lifecycle::Ready);
        assert_eq!(launches.load(Ordering::Relaxed), 1);
        let restored = supervisor
            .request_control("project.snapshot", json!({}))
            .await
            .unwrap();
        assert_eq!(restored["project"]["history"]["revision"], 7);
        assert_eq!(
            recovered_control
                .writes
                .lock()
                .unwrap()
                .iter()
                .filter(|request| request["method"] == "media.ingestLocal")
                .count(),
            0
        );

        recovered_control
            .events
            .send(HostEvent::Terminated)
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_millis(100), async {
            while supervisor.core.state() == Lifecycle::Ready {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(supervisor.core.state(), Lifecycle::Failed);
        let later_launches = AtomicUsize::new(0);
        assert_eq!(
            supervisor
                .ensure_started_with(|| {
                    later_launches.fetch_add(1, Ordering::Relaxed);
                    Ok(fake_launch(HelloMode::Valid, true, false).0)
                })
                .await
                .unwrap_err()
                .code,
            "HOST_UNAVAILABLE"
        );
        assert_eq!(later_launches.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn graceful_shutdown_waits_for_termination_without_force_kill() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, control) = fake_launch(HelloMode::Valid, true, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        supervisor.shutdown().await;
        assert_eq!(supervisor.core.state(), Lifecycle::Stopped);
        assert_eq!(control.kills.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn nonresponsive_shutdown_is_force_killed_after_bound() {
        let supervisor = DesktopHostSupervisor::with_timeouts(timeouts());
        let (launched, control) = fake_launch(HelloMode::Valid, false, false);
        supervisor
            .ensure_started_with(|| Ok(launched))
            .await
            .unwrap();
        supervisor.shutdown().await;
        assert_eq!(supervisor.core.state(), Lifecycle::Stopped);
        assert_eq!(control.kills.load(Ordering::Relaxed), 1);
    }
}

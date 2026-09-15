use crate::protocol::{
    DesktopCommandError, HostRequest, HostResponse, JsonLineFramer, PendingRequests,
    MAX_MESSAGE_BYTES, PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex as AsyncMutex};

const HELLO_TIMEOUT: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(6 * 60 * 60);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct DesktopHostSupervisor {
    child: Arc<Mutex<Option<CommandChild>>>,
    pending: Arc<Mutex<PendingRequests>>,
    available: Arc<AtomicBool>,
    permanently_failed: Arc<AtomicBool>,
    next_id: AtomicU64,
    start_guard: AsyncMutex<()>,
}

impl DesktopHostSupervisor {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(PendingRequests::default())),
            available: Arc::new(AtomicBool::new(false)),
            permanently_failed: Arc::new(AtomicBool::new(false)),
            next_id: AtomicU64::new(1),
            start_guard: AsyncMutex::new(()),
        }
    }

    pub async fn ensure_started(&self, app: &AppHandle) -> Result<(), DesktopCommandError> {
        if self.available.load(Ordering::Acquire) { return Ok(()); }
        if self.permanently_failed.load(Ordering::Acquire) {
            return Err(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host session cannot be recovered without persistence."));
        }
        let _guard = self.start_guard.lock().await;
        if self.available.load(Ordering::Acquire) { return Ok(()); }
        if self.child.lock().map_err(lock_error)?.is_some() {
            return Err(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host is unavailable."));
        }

        let script = app.path().resolve("desktop-host/desktop-host.cjs", tauri::path::BaseDirectory::Resource)
            .map_err(|_| DesktopCommandError::new("HOST_START_FAILED", "Desktop host resource is unavailable."))?;
        let command = app.shell().sidecar("cevra-node")
            .map_err(|_| DesktopCommandError::new("HOST_START_FAILED", "Private Node runtime is unavailable."))?
            .arg(script)
            .env_clear()
            .env("LANG", "C.UTF-8")
            .env("LC_ALL", "C.UTF-8")
            .envs(trusted_runtime_environment(app));
        let (receiver, child) = command.set_raw_out(true).spawn()
            .map_err(|_| DesktopCommandError::new("HOST_START_FAILED", "Desktop host could not be started."))?;
        *self.child.lock().map_err(lock_error)? = Some(child);
        self.available.store(true, Ordering::Release);
        self.spawn_event_loop(receiver);

        let hello = match self.request_with_timeout("host.hello", json!({}), HELLO_TIMEOUT).await {
            Ok(value) => value,
            Err(error) => {
                self.fail(error.clone());
                return Err(error);
            }
        };
        if hello.get("identity").and_then(Value::as_str) != Some("cevra.desktop-host")
            || hello.get("version").and_then(Value::as_str) != Some("0.1.0")
            || hello.get("protocolVersion").and_then(Value::as_u64) != Some(PROTOCOL_VERSION.into())
        {
            self.fail(DesktopCommandError::new("HOST_PROTOCOL_MISMATCH", "Desktop host identity or protocol mismatch."));
            return Err(DesktopCommandError::new("HOST_PROTOCOL_MISMATCH", "Desktop host identity or protocol mismatch."));
        }
        Ok(())
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, DesktopCommandError> {
        self.request_with_timeout(method, params, REQUEST_TIMEOUT).await
    }

    pub async fn shutdown(&self) {
        if self.available.load(Ordering::Acquire) {
            let _ = self.request_with_timeout("host.shutdown", json!({}), SHUTDOWN_TIMEOUT).await;
        }
        self.available.store(false, Ordering::Release);
        let child = self.child.lock().ok().and_then(|mut child| child.take());
        if let Some(child) = child { let _ = child.kill(); }
        self.pending.lock().ok().map(|mut pending| pending.reject_all(
            DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host stopped.")
        ));
    }

    fn spawn_event_loop(&self, mut receiver: tokio::sync::mpsc::Receiver<CommandEvent>) {
        let pending = Arc::clone(&self.pending);
        let available = Arc::clone(&self.available);
        let permanently_failed = Arc::clone(&self.permanently_failed);
        let child = Arc::clone(&self.child);
        tauri::async_runtime::spawn(async move {
            let mut framer = JsonLineFramer::new();
            while let Some(event) = receiver.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => match framer.push(&bytes) {
                        Ok(lines) => for line in lines {
                            match serde_json::from_slice::<HostResponse>(&line) {
                                Ok(response) => if let Ok(mut pending) = pending.lock() { pending.resolve(response); },
                                Err(_) => {
                                    fail_shared(&available, &permanently_failed, &pending, &child, DesktopCommandError::new("HOST_MALFORMED_RESPONSE", "Desktop host returned malformed protocol data."));
                                    return;
                                }
                            }
                        },
                        Err(error) => {
                            fail_shared(&available, &permanently_failed, &pending, &child, error);
                            return;
                        }
                    },
                    CommandEvent::Stderr(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        eprintln!("[cevra-desktop-host] {}", text.trim_end());
                    }
                    CommandEvent::Error(_) | CommandEvent::Terminated(_) => {
                        fail_shared(&available, &permanently_failed, &pending, &child, DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host exited unexpectedly."));
                        return;
                    }
                    _ => {}
                }
            }
            fail_shared(&available, &permanently_failed, &pending, &child, DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host event stream ended."));
        });
    }

    async fn request_with_timeout(&self, method: &str, params: Value, duration: Duration) -> Result<Value, DesktopCommandError> {
        if !self.available.load(Ordering::Acquire) {
            return Err(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host is unavailable."));
        }
        let id = format!("desktop-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let encoded = serde_json::to_vec(&HostRequest { protocol_version: PROTOCOL_VERSION, id: &id, method, params })
            .map_err(|_| DesktopCommandError::new("HOST_INVALID_REQUEST", "Desktop request could not be encoded."))?;
        if encoded.len() > MAX_MESSAGE_BYTES {
            return Err(DesktopCommandError::new("HOST_MESSAGE_TOO_LARGE", "Desktop request exceeded the protocol limit."));
        }
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().map_err(lock_error)?.insert(id.clone(), sender)?;
        let write_result = self.child.lock().map_err(lock_error)?
            .as_mut()
            .ok_or_else(|| DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host is unavailable."))?
            .write(&[encoded.as_slice(), b"\n"].concat());
        if write_result.is_err() {
            self.pending.lock().map_err(lock_error)?.remove(&id);
            self.fail(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host stdin is unavailable."));
            return Err(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host stdin is unavailable."));
        }
        match tokio::time::timeout(duration, receiver).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_)) => Err(DesktopCommandError::new("HOST_UNAVAILABLE", "Desktop host response channel closed.")),
            Err(_) => {
                self.pending.lock().map_err(lock_error)?.remove(&id);
                Err(DesktopCommandError::new("HOST_TIMEOUT", "Desktop host request timed out."))
            }
        }
    }

    fn fail(&self, error: DesktopCommandError) {
        fail_shared(&self.available, &self.permanently_failed, &self.pending, &self.child, error);
    }
}

fn fail_shared(
    available: &AtomicBool,
    permanently_failed: &AtomicBool,
    pending: &Mutex<PendingRequests>,
    child: &Mutex<Option<CommandChild>>,
    error: DesktopCommandError,
) {
    available.store(false, Ordering::Release);
    permanently_failed.store(true, Ordering::Release);
    if let Ok(mut pending) = pending.lock() { pending.reject_all(error); }
    if let Ok(mut child) = child.lock() {
        if let Some(child) = child.take() { let _ = child.kill(); }
    }
}

fn trusted_runtime_environment(app: &AppHandle) -> BTreeMap<String, String> {
    let mut allowed = BTreeMap::new();
    if !cfg!(debug_assertions) {
        if let Ok(resources) = app.path().resource_dir() {
            let media = resources.join("media-runtime");
            if media.join("manifest.json").is_file() {
                allowed.insert("CEVRA_MEDIA_RUNTIME_ROOT".into(), media.to_string_lossy().into_owned());
                allowed.insert("CEVRA_MEDIA_RUNTIME_MODE".into(), "release".into());
            }
            let private_python = resources.join("python-runtime");
            let transcription = resources.join("transcription-runtime");
            let model_cache = resources.join("models");
            let python = transcription.join("bin/python3");
            if private_python.is_dir() && transcription.is_dir() && model_cache.is_dir() && python.is_file() {
                allowed.insert("CEVRA_TRANSCRIPTION_MODE".into(), "managed".into());
                allowed.insert("CEVRA_TRANSCRIPTION_PYTHON".into(), python.to_string_lossy().into_owned());
                allowed.insert("CEVRA_TRANSCRIPTION_ENV_ROOT".into(), transcription.to_string_lossy().into_owned());
                allowed.insert("CEVRA_PRIVATE_PYTHON_ROOT".into(), private_python.to_string_lossy().into_owned());
                allowed.insert("CEVRA_TRANSCRIPTION_MODEL_CACHE".into(), model_cache.to_string_lossy().into_owned());
            }
        }
        return allowed;
    }
    for name in [
        "CEVRA_MEDIA_RUNTIME_ROOT", "CEVRA_MEDIA_RUNTIME_MODE",
        "CEVRA_TRANSCRIPTION_MODE", "CEVRA_TRANSCRIPTION_PYTHON",
        "CEVRA_TRANSCRIPTION_ENV_ROOT", "CEVRA_TRANSCRIPTION_WORKER",
        "CEVRA_PRIVATE_PYTHON_ROOT", "CEVRA_TRANSCRIPTION_MODEL_CACHE",
        "CEVRA_TRANSCRIPTION_MODEL_ID", "CEVRA_TRANSCRIPTION_DEVICE",
        "CEVRA_TRANSCRIPTION_COMPUTE_TYPE",
    ] {
        if let Ok(value) = std::env::var(name) { allowed.insert(name.to_string(), value); }
    }
    allowed
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> DesktopCommandError {
    DesktopCommandError::new("HOST_SUPERVISOR_FAILED", "Desktop host supervisor state is unavailable.")
}

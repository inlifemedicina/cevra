use crate::protocol::DesktopCommandError;
use crate::supervisor::DesktopHostSupervisor;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn desktop_get_close_state(supervisor: State<'_, Arc<DesktopHostSupervisor>>) -> Result<crate::supervisor::NativeCloseState, DesktopCommandError> {
    // Constant-size native lifecycle metadata only; no Host launch, mutation or filesystem access.
    supervisor.native_close_state()
}

static OPERATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckpointArgs {
    expected_token: String,
}

#[tauri::command]
pub async fn desktop_retry_checkpoint(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: CheckpointArgs,
) -> Result<Value, DesktopCommandError> {
    let hash = args.expected_token.strip_prefix("checkpoint-v1:").unwrap_or("");
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) {
        return Err(DesktopCommandError::new("HOST_INVALID_PARAMS", "Checkpoint token is invalid."));
    }
    supervisor.ensure_started(&app).await?;
    // Save retry never kills the only unsaved canonical history on timeout.
    // The host mutation gate remains held until I/O settles; the UI reconciles snapshots.
    supervisor.request_control("project.checkpoint", json!({ "expectedToken": args.expected_token })).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocaleArgs {
    locale: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranscriptionArgs {
    source_id: String,
    operation_id: String,
    locale: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelArgs {
    operation_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoPreviewArgs {
    source_id: String,
    expected_snapshot_id: String,
    clip_id: Option<String>,
    operation_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualExportPreparationArgs {
    version: u8,
    expected_snapshot_id: String,
    operation_id: String,
    locale: String,
}

fn validate_export_preparation(args: &ManualExportPreparationArgs) -> Result<(), DesktopCommandError> {
    validate_id(&args.expected_snapshot_id, "expectedSnapshotId")?;
    validate_locale(&args.locale)?;
    let operation = args.operation_id.as_bytes();
    if args.version != 1 || operation.is_empty() || operation.len() > 128
        || !operation[0].is_ascii_alphanumeric()
        || !operation.iter().all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(byte)) {
        return Err(DesktopCommandError::new("MANUAL_EXPORT_INVALID_REQUEST", "Export preparation arguments are invalid."));
    }
    Ok(())
}

#[tauri::command]
pub async fn desktop_prepare_manual_export(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: ManualExportPreparationArgs,
) -> Result<Value, DesktopCommandError> {
    validate_export_preparation(&args)?;
    supervisor.ensure_started(&app).await?;
    let lease = supervisor.begin_preparation_picker(&args.operation_id)?;
    // Modal system picker owns its cancellation; the WebView has no path permission.
    let picked = app.dialog().file().set_title("CEVRA Vids")
        .set_file_name("CEVRA.mp4").add_filter("MP4", &["mp4"]).blocking_save_file();
    let Some(picked) = picked else { return Ok(json!({ "outcome": "cancelled" })); };
    let path = picked.into_path().map_err(|_| DesktopCommandError::new("MANUAL_EXPORT_DESTINATION_INVALID", "The destination is invalid."))?;
    let path_text = path.to_str().filter(|_| path.is_absolute())
        .ok_or_else(|| DesktopCommandError::new("MANUAL_EXPORT_DESTINATION_INVALID", "The destination is invalid."))?;
    let result = supervisor.request_picked_preparation(&lease, "video.prepareManualExport", json!({
        "version": args.version, "expectedSnapshotId": args.expected_snapshot_id,
        "operationId": args.operation_id, "locale": args.locale, "destinationUri": path_text
    })).await.map_err(|error| match error.code.as_str() {
        "MANUAL_VIDEO_PREVIEW_TIMEOUT" => DesktopCommandError::new("MANUAL_EXPORT_PREPARATION_TIMEOUT", "The preparation timed out and settled."),
        "MANUAL_VIDEO_PREVIEW_SETTLING" => DesktopCommandError::new("MANUAL_EXPORT_PREPARATION_SETTLING", "The preparation has not settled; keep the project open."),
        _ => error
    })?;
    Ok(json!({ "outcome": "prepared", "preparation": result }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualVideoClipArgs {
    source_id: String,
    expected_snapshot_id: String,
    source_start_ms: u64,
    source_end_ms: u64,
}

#[tauri::command]
pub async fn desktop_preview_local_video(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: VideoPreviewArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.source_id, "sourceId")?;
    validate_id(&args.expected_snapshot_id, "expectedSnapshotId")?;
    let mut params = json!({ "sourceId": args.source_id, "expectedSnapshotId": args.expected_snapshot_id });
    if let Some(operation) = &args.operation_id {
        validate_id(operation, "operationId")?;
        params["operationId"] = json!(operation);
    }
    if let Some(clip) = &args.clip_id {
        validate_id(clip, "clipId")?;
        if args.operation_id.is_none() {
            return Err(DesktopCommandError::new("MANUAL_VIDEO_INVALID_REQUEST", "A clip requires an operation identifier."));
        }
        params["clipId"] = json!(clip);
    }
    supervisor.ensure_started(&app).await?;
    if let Some(operation) = args.operation_id {
        supervisor.request_preparation("video.previewLocal", params, &operation).await
    } else {
        supervisor.request_control("video.previewLocal", params).await
    }
}

#[tauri::command]
pub async fn desktop_create_manual_video_clip(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: ManualVideoClipArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.source_id, "sourceId")?;
    validate_id(&args.expected_snapshot_id, "expectedSnapshotId")?;
    if args.source_start_ms >= args.source_end_ms || args.source_end_ms > 9_007_199_254_740_991 {
        return Err(DesktopCommandError::new("MANUAL_VIDEO_INVALID_RANGE", "The manual video range is invalid."));
    }
    supervisor.ensure_started(&app).await?;
    match supervisor.request_immediate_mutation("video.createManualClip", json!({
        "sourceId": args.source_id, "expectedSnapshotId": args.expected_snapshot_id,
        "sourceStartMs": args.source_start_ms, "sourceEndMs": args.source_end_ms
    })).await {
        Ok(result) => Ok(result),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualVideoTrimArgs {
    clip_id: String,
    expected_snapshot_id: String,
    source_start_ms: u64,
    source_end_ms: u64,
}

#[tauri::command]
pub async fn desktop_trim_manual_video_clip(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: ManualVideoTrimArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.clip_id, "clipId")?;
    validate_id(&args.expected_snapshot_id, "expectedSnapshotId")?;
    if args.source_start_ms >= args.source_end_ms || args.source_end_ms > 9_007_199_254_740_991 {
        return Err(DesktopCommandError::new("MANUAL_VIDEO_INVALID_RANGE", "The manual video range is invalid."));
    }
    supervisor.ensure_started(&app).await?;
    match supervisor.request_immediate_mutation("video.trimManualClip", json!({
        "clipId": args.clip_id, "expectedSnapshotId": args.expected_snapshot_id,
        "sourceStartMs": args.source_start_ms, "sourceEndMs": args.source_end_ms
    })).await {
        Ok(result) => Ok(result),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorialBlockEdit {
    block_id: String,
    title: Option<String>,
    user_note: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManualVideoSequenceArgs {
    version: u8,
    expected_snapshot_id: String,
    action: ManualVideoSequenceAction,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ManualVideoSequenceAction {
    Append { source_id: String, source_start_ms: u64, source_end_ms: u64 },
    Insert { before_clip_id: String, source_id: String, source_start_ms: u64, source_end_ms: u64 },
    Duplicate { clip_id: String },
    Remove { clip_id: String },
    Trim { clip_id: String, source_start_ms: u64, source_end_ms: u64 },
    Split { clip_id: String, timeline_at_ms: u64 },
    Reorder { clip_ids: Vec<String> },
}

fn manual_sequence_params(args: ManualVideoSequenceArgs) -> Result<Value, DesktopCommandError> {
    validate_id(&args.expected_snapshot_id, "expectedSnapshotId")?;
    if args.version != 1 {
        return Err(DesktopCommandError::new("MANUAL_SEQUENCE_INVALID_REQUEST", "Manual sequence version is invalid."));
    }
    let mut params = serde_json::to_value(args.action)
        .map_err(|_| DesktopCommandError::new("MANUAL_SEQUENCE_INVALID_REQUEST", "Manual sequence action is invalid."))?;
    for (key, value) in params.as_object().expect("typed action serializes as an object") {
        if key.ends_with("Id") { validate_id(value.as_str().expect("typed ID"), key)?; }
        if key == "clipIds" {
            for id in value.as_array().expect("typed IDs") { validate_id(id.as_str().expect("typed ID"), "clipId")?; }
        }
        if key.ends_with("Ms") && value.as_u64().expect("typed time") > 9_007_199_254_740_991 {
            return Err(DesktopCommandError::new("MANUAL_SEQUENCE_INVALID_REQUEST", "Manual sequence time is invalid."));
        }
    }
    params["version"] = json!(args.version);
    params["expectedSnapshotId"] = json!(args.expected_snapshot_id);
    Ok(params)
}

#[tauri::command]
pub async fn desktop_edit_manual_video_sequence(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: ManualVideoSequenceArgs,
) -> Result<Value, DesktopCommandError> {
    let params = manual_sequence_params(args)?;
    supervisor.ensure_started(&app).await?;
    match supervisor.request_immediate_mutation("video.editManualSequence", params).await {
        Ok(result) => Ok(result),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorialRevisionArgs {
    expected_revision: u64,
    title: Option<String>,
    block_order: Option<Vec<String>>,
    block_edits: Option<Vec<EditorialBlockEdit>>,
}

#[tauri::command]
pub async fn desktop_get_editorial_draft(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    supervisor.request_control("editorial.snapshot", json!({})).await
}

#[tauri::command]
pub async fn desktop_revise_editorial_draft(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: EditorialRevisionArgs,
) -> Result<Value, DesktopCommandError> {
    let mut params = json!({ "expectedRevision": args.expected_revision });
    if let Some(title) = args.title { params["title"] = json!(title); }
    if let Some(order) = args.block_order { params["blockOrder"] = json!(order); }
    if let Some(edits) = args.block_edits {
        params["blockEdits"] = Value::Array(edits.into_iter().map(|edit| {
            let mut value = json!({ "blockId": edit.block_id });
            if let Some(title) = edit.title { value["title"] = json!(title); }
            if let Some(note) = edit.user_note { value["userNote"] = json!(note); }
            value
        }).collect());
    }
    supervisor.ensure_started(&app).await?;
    // Proposal-only revision: no canonical edit, provider or persistent admission.
    supervisor.request_immediate_mutation("editorial.revise", params).await
}

#[tauri::command]
pub async fn desktop_get_state(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    match supervisor
        .request_control("project.snapshot", json!({}))
        .await
    {
        Ok(state) => Ok(state),
        Err(error) => {
            supervisor
                .recover_state_after_process_loss(&app, error)
                .await
        }
    }
}

#[tauri::command]
pub async fn desktop_pick_and_ingest_media(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: LocaleArgs,
) -> Result<Value, DesktopCommandError> {
    validate_locale(&args.locale)?;
    supervisor.ensure_started(&app).await?;
    let picked = app
        .dialog()
        .file()
        .set_title("CEVRA Vids")
        .add_filter(
            "Media",
            &[
                "mp4", "mov", "mkv", "m4v", "webm", "wav", "m4a", "mp3", "aac", "flac", "ogg",
            ],
        )
        .blocking_pick_file();
    let Some(picked) = picked else {
        return Ok(json!({ "outcome": "cancelled" }));
    };
    let path = picked.into_path().map_err(|_| {
        DesktopCommandError::new(
            "PICKER_INVALID_SELECTION",
            "The selected media path is invalid.",
        )
    })?;
    if !path.is_absolute() {
        return Err(DesktopCommandError::new(
            "PICKER_INVALID_SELECTION",
            "The selected media path is not absolute.",
        ));
    }
    let path_text = path
        .to_str()
        .ok_or_else(|| {
            DesktopCommandError::new(
                "PICKER_INVALID_SELECTION",
                "The selected media path is not valid UTF-8.",
            )
        })?
        .to_owned();
    let display_name = file_name(&path)?;
    let operation_id = format!(
        "native-import-{}",
        OPERATION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let result = match supervisor
        .request_mutating(
            "media.ingestLocal",
            json!({
                "uri": path_text,
                "displayName": display_name,
                "operationId": operation_id,
                "locale": args.locale,
            }),
            &operation_id,
        )
        .await
    {
        Ok(result) => result,
        Err(error) => return Err(recover_mutation(&app, &supervisor, error).await),
    };
    Ok(json!({ "outcome": "imported", "result": result }))
}

#[tauri::command]
pub async fn desktop_transcribe_source(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: TranscriptionArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.source_id, "sourceId")?;
    validate_id(&args.operation_id, "operationId")?;
    validate_locale(&args.locale)?;
    supervisor.ensure_started(&app).await?;
    match supervisor
        .request_mutating(
            "transcription.transcribeSource",
            json!({
                "sourceId": args.source_id,
                "operationId": args.operation_id,
                "locale": args.locale,
            }),
            &args.operation_id,
        )
        .await
    {
        Ok(state) => Ok(state),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[tauri::command]
pub async fn desktop_undo(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    match supervisor
        .request_immediate_mutation("history.undo", json!({}))
        .await
    {
        Ok(state) => Ok(state),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[tauri::command]
pub async fn desktop_redo(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    match supervisor
        .request_immediate_mutation("history.redo", json!({}))
        .await
    {
        Ok(state) => Ok(state),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

#[tauri::command]
pub async fn desktop_cancel_operation(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: CancelArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.operation_id, "operationId")?;
    supervisor.ensure_started(&app).await?;
    match supervisor
        .cancel_operation(&args.operation_id)
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Err(recover_mutation(&app, &supervisor, error).await),
    }
}

async fn recover_mutation(
    app: &AppHandle,
    supervisor: &DesktopHostSupervisor,
    error: DesktopCommandError,
) -> DesktopCommandError {
    if error.code != "HOST_PROCESS_EXITED" {
        return error;
    }
    match supervisor.recover_state_after_process_loss(app, error).await {
        Ok(state) => DesktopCommandError::new(
            "HOST_RECOVERED",
            "The desktop host restarted from the durable project checkpoint; the interrupted operation was not replayed.",
        )
        .with_details(json!({ "state": state })),
        Err(recovery_error) => recovery_error,
    }
}

fn validate_locale(locale: &str) -> Result<(), DesktopCommandError> {
    if locale == "pt-BR" || locale == "en-US" {
        Ok(())
    } else {
        Err(DesktopCommandError::new(
            "INVALID_LOCALE",
            "Desktop locale is unsupported.",
        ))
    }
}

fn validate_id(value: &str, field: &str) -> Result<(), DesktopCommandError> {
    if !value.is_empty() && value.len() <= 128 && !value.chars().any(char::is_control) {
        Ok(())
    } else {
        Err(DesktopCommandError::new(
            "INVALID_ARGUMENT",
            format!("{field} is invalid."),
        ))
    }
}

fn file_name(path: &Path) -> Result<String, DesktopCommandError> {
    path.file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            DesktopCommandError::new(
                "PICKER_INVALID_SELECTION",
                "The selected media file name is invalid.",
            )
        })
}

#[cfg(test)]
mod video_boundary_tests {
    use super::*;

    #[test]
    fn export_preparation_boundary_rejects_paths_render_overrides_and_invalid_operation_ids() {
        let valid = json!({ "version": 1, "expectedSnapshotId": "snapshot", "operationId": "prepare-1", "locale": "pt-BR" });
        assert!(validate_export_preparation(&serde_json::from_value::<ManualExportPreparationArgs>(valid.clone()).unwrap()).is_ok());
        for extra in ["uri", "destinationUri", "path", "commands", "fps", "renderAvailable"] {
            let mut injected = valid.clone(); injected[extra] = json!("injected");
            assert!(serde_json::from_value::<ManualExportPreparationArgs>(injected).is_err());
        }
        for operation in ["", "../foreign", "/tmp/path", "bad\nidentifier"] {
            let mut injected = valid.clone(); injected["operationId"] = json!(operation);
            assert!(validate_export_preparation(&serde_json::from_value::<ManualExportPreparationArgs>(injected).unwrap()).is_err());
        }
    }

    #[test]
    fn local_video_args_reject_paths_commands_and_duration_overrides() {
        for extra in ["uri", "path", "durationMs", "commands"] {
            let mut preview = json!({ "sourceId": "source", "expectedSnapshotId": "snapshot" });
            preview[extra] = json!("injected");
            assert!(serde_json::from_value::<VideoPreviewArgs>(preview.clone()).is_err());
            preview["sourceStartMs"] = json!(0);
            preview["sourceEndMs"] = json!(1000);
            assert!(serde_json::from_value::<ManualVideoClipArgs>(preview).is_err());
        }
        for start in [json!(-1), json!(0.5)] {
            assert!(serde_json::from_value::<ManualVideoClipArgs>(json!({
                "sourceId": "source", "expectedSnapshotId": "snapshot", "sourceStartMs": start, "sourceEndMs": 1000
            })).is_err());
        }
    }
    #[test]
    fn manual_sequence_boundary_accepts_only_closed_intents_and_safe_bindings() {
        for action in [
            json!({"type":"append","sourceId":"source","sourceStartMs":0,"sourceEndMs":700}),
            json!({"type":"insert","beforeClipId":"clip","sourceId":"source","sourceStartMs":0,"sourceEndMs":700}),
            json!({"type":"duplicate","clipId":"clip"}),
            json!({"type":"remove","clipId":"clip"}),
            json!({"type":"trim","clipId":"clip","sourceStartMs":0,"sourceEndMs":700}),
            json!({"type":"split","clipId":"clip","timelineAtMs":350}),
            json!({"type":"reorder","clipIds":["clip","other"]}),
        ] {
            let request = json!({"version":1,"expectedSnapshotId":"snapshot","action":action});
            let params = manual_sequence_params(serde_json::from_value(request.clone()).unwrap()).unwrap();
            assert_eq!(params["type"], action["type"]);
            assert_eq!(params["expectedSnapshotId"], "snapshot");
            for extra in ["path", "commands", "edits", "outputUri"] {
                let mut bad = request.clone(); bad["action"][extra] = json!("injected");
                assert!(serde_json::from_value::<ManualVideoSequenceArgs>(bad).is_err());
            }
            let mut bad = request.clone(); bad["version"] = json!(2);
            assert!(manual_sequence_params(serde_json::from_value(bad).unwrap()).is_err());
            let mut bad = request; bad["expectedSnapshotId"] = json!("x".repeat(129));
            assert!(manual_sequence_params(serde_json::from_value(bad).unwrap()).is_err());
        }
        for invalid in [json!(-1), json!(0.5), json!(9_007_199_254_740_992_u64)] {
            let request = json!({"version":1,"expectedSnapshotId":"snapshot","action":{"type":"split","clipId":"clip","timelineAtMs":invalid}});
            match serde_json::from_value::<ManualVideoSequenceArgs>(request) {
                Err(_) => {},
                Ok(args) => assert!(manual_sequence_params(args).is_err()),
            }
        }
    }

    #[test]
    fn manual_trim_args_accept_only_clip_binding_and_integer_source_range() {
        let valid = json!({ "clipId": "clip", "expectedSnapshotId": "snapshot", "sourceStartMs": 1000, "sourceEndMs": 4000 });
        assert!(serde_json::from_value::<ManualVideoTrimArgs>(valid.clone()).is_ok());
        for extra in ["uri", "path", "sourceId", "durationMs", "commands", "timelineEndMs", "speed"] {
            let mut injected = valid.clone(); injected[extra] = json!("injected");
            assert!(serde_json::from_value::<ManualVideoTrimArgs>(injected).is_err());
        }
        for invalid in [json!(-1), json!(0.5), json!("1000")] {
            let mut injected = valid.clone(); injected["sourceStartMs"] = invalid;
            assert!(serde_json::from_value::<ManualVideoTrimArgs>(injected).is_err());
        }
    }

}

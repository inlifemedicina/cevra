use crate::protocol::DesktopCommandError;
use crate::supervisor::DesktopHostSupervisor;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

static OPERATION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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
    supervisor.ensure_started(&app).await?;
    supervisor.request_control("video.previewLocal", json!({ "sourceId": args.source_id, "expectedSnapshotId": args.expected_snapshot_id })).await
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
        .request_control(
            "operation.cancel",
            json!({ "operationId": args.operation_id }),
        )
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

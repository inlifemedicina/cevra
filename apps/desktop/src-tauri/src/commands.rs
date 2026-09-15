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

#[tauri::command]
pub async fn desktop_get_state(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    supervisor
        .request_control("project.snapshot", json!({}))
        .await
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
    let result = supervisor
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
        .await?;
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
    supervisor
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
}

#[tauri::command]
pub async fn desktop_undo(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    supervisor
        .request_immediate_mutation("history.undo", json!({}))
        .await
}

#[tauri::command]
pub async fn desktop_redo(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
) -> Result<Value, DesktopCommandError> {
    supervisor.ensure_started(&app).await?;
    supervisor
        .request_immediate_mutation("history.redo", json!({}))
        .await
}

#[tauri::command]
pub async fn desktop_cancel_operation(
    app: AppHandle,
    supervisor: State<'_, Arc<DesktopHostSupervisor>>,
    args: CancelArgs,
) -> Result<Value, DesktopCommandError> {
    validate_id(&args.operation_id, "operationId")?;
    supervisor.ensure_started(&app).await?;
    supervisor
        .request_control(
            "operation.cancel",
            json!({ "operationId": args.operation_id }),
        )
        .await
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

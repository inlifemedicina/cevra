#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_manifest;
mod commands;
mod fa02_review;
mod protocol;
mod supervisor;

use commands::{
    desktop_edit_manual_video_sequence,
    desktop_get_close_state,
    desktop_retry_checkpoint,
    desktop_cancel_operation, desktop_get_state, desktop_pick_and_ingest_media, desktop_redo,
    desktop_transcribe_source, desktop_undo,
    desktop_get_editorial_draft, desktop_revise_editorial_draft,
    desktop_thumbnail_local_video, desktop_preview_local_video, desktop_prepare_manual_export, desktop_export_manual_sequence, desktop_preview_manual_sequence_conform,
    desktop_create_manual_video_clip, desktop_trim_manual_video_clip,
};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use supervisor::DesktopHostSupervisor;

fn main() {
    let supervisor = Arc::new(DesktopHostSupervisor::new());
    let shutdown_supervisor = Arc::clone(&supervisor);
    let close_in_flight = Arc::new(AtomicBool::new(false));
    let exit_granted = Arc::new(AtomicBool::new(false));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(supervisor)
        .invoke_handler(tauri::generate_handler![
            desktop_edit_manual_video_sequence,
            desktop_get_close_state,
            desktop_retry_checkpoint,
            desktop_get_state,
            desktop_pick_and_ingest_media,
            desktop_transcribe_source,
            desktop_undo,
            desktop_redo,
            desktop_cancel_operation,
            desktop_get_editorial_draft,
            desktop_revise_editorial_draft,
            desktop_thumbnail_local_video,
            desktop_preview_local_video,
            desktop_prepare_manual_export,
            desktop_export_manual_sequence,
            desktop_preview_manual_sequence_conform,
            desktop_create_manual_video_clip,
            desktop_trim_manual_video_clip,
        ])
        .build(tauri::generate_context!())
        .expect("CEVRA Vids desktop runtime failed to build");
    app.run(move |app_handle, event| {
        if exit_granted.load(Ordering::Acquire) { return; }
        let request_close = match event {
            tauri::RunEvent::ExitRequested { api, .. } => { api.prevent_exit(); true },
            tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::CloseRequested { api, .. }, .. } => { api.prevent_close(); true },
            _ => false,
        };
        if !request_close || close_in_flight.swap(true, Ordering::AcqRel) { return; }
        let supervisor = Arc::clone(&shutdown_supervisor);
        let pending = Arc::clone(&close_in_flight);
        let granted = Arc::clone(&exit_granted);
        let app_handle = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            if supervisor.shutdown().await.is_ok() {
                granted.store(true, Ordering::Release);
                app_handle.exit(0);
            }
            pending.store(false, Ordering::Release);
        });
    });
}

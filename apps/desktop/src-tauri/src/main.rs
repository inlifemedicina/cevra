#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod command_manifest;
mod commands;
mod protocol;
mod supervisor;

use commands::{
    desktop_cancel_operation, desktop_get_state, desktop_pick_and_ingest_media, desktop_redo,
    desktop_transcribe_source, desktop_undo,
};
use std::sync::Arc;
use supervisor::DesktopHostSupervisor;

fn main() {
    let supervisor = Arc::new(DesktopHostSupervisor::new());
    let shutdown_supervisor = Arc::clone(&supervisor);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(supervisor)
        .invoke_handler(tauri::generate_handler![
            desktop_get_state,
            desktop_pick_and_ingest_media,
            desktop_transcribe_source,
            desktop_undo,
            desktop_redo,
            desktop_cancel_operation,
        ])
        .build(tauri::generate_context!())
        .expect("CEVRA Vids desktop runtime failed to build");
    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            tauri::async_runtime::block_on(shutdown_supervisor.shutdown());
        }
    });
}

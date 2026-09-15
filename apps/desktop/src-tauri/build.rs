mod command_manifest {
    include!("src/command_manifest.rs");
}

fn main() {
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(command_manifest::APPLICATION_COMMANDS),
    );
    tauri_build::try_build(attributes).expect("CEVRA Tauri ACL manifest generation failed");
}

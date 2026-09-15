#[allow(dead_code)]
pub const APPLICATION_COMMANDS: &[&str] = &[
    "desktop_get_state",
    "desktop_pick_and_ingest_media",
    "desktop_transcribe_source",
    "desktop_undo",
    "desktop_redo",
    "desktop_cancel_operation",
];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::collections::BTreeSet;

    #[test]
    fn invoke_handler_manifest_and_capability_are_exactly_aligned() {
        let main_source = include_str!("main.rs");
        let handler = main_source
            .split("tauri::generate_handler![")
            .nth(1)
            .and_then(|value| value.split(']').next())
            .expect("invoke handler must remain statically declared");
        let registered = handler
            .split(|character: char| !(character.is_ascii_alphanumeric() || character == '_'))
            .filter(|value| value.starts_with("desktop_"))
            .collect::<BTreeSet<_>>();
        let approved = APPLICATION_COMMANDS
            .iter()
            .copied()
            .collect::<BTreeSet<_>>();
        assert_eq!(
            registered, approved,
            "invoke_handler commands require explicit ACL review"
        );

        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/main-window.json"))
                .expect("main-window capability must be valid JSON");
        let permissions = capability["permissions"]
            .as_array()
            .expect("permissions must be an array");
        let actual = permissions
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .expect("permission must be a string")
                    .to_owned()
            })
            .collect::<BTreeSet<_>>();
        let expected = APPLICATION_COMMANDS
            .iter()
            .map(|command| format!("allow-{}", command.replace('_', "-")))
            .collect::<BTreeSet<_>>();
        assert_eq!(
            actual, expected,
            "main window may invoke only the approved application commands"
        );
        assert!(actual
            .iter()
            .all(|permission| !["shell", "dialog", "fs", "http", "process"]
                .iter()
                .any(|name| permission.contains(name))));
    }
}

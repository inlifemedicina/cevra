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

    fn registered_commands(source: &str) -> BTreeSet<&str> {
        source
            .split("tauri::generate_handler![")
            .nth(1)
            .and_then(|value| value.split(']').next())
            .expect("invoke handler must remain statically declared")
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                assert!(
                    value
                        .chars()
                        .all(|character| character.is_ascii_alphanumeric()
                            || character == '_'
                            || character == ':'),
                    "invoke handler commands must be plain identifiers"
                );
                value.rsplit("::").next().expect("command identifier")
            })
            .collect()
    }

    #[test]
    fn invoke_handler_extraction_does_not_depend_on_command_prefixes() {
        let registered = registered_commands(
            "tauri::generate_handler![desktop_get_state, future_application_command]",
        );
        assert_eq!(
            registered,
            BTreeSet::from(["desktop_get_state", "future_application_command"])
        );
    }

    #[test]
    fn invoke_handler_manifest_and_capability_are_exactly_aligned() {
        let main_source = include_str!("main.rs");
        let registered = registered_commands(main_source);
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

        let commands = include_str!("commands.rs");
        assert!(!commands.contains("persistence_path"));
        assert!(!commands.contains("persistencePath"));
        let supervisor = include_str!("supervisor.rs");
        assert!(supervisor.contains("app_data_dir()"));
        assert!(supervisor.contains("CEVRA_PROJECT_PERSISTENCE_ROOT"));
        assert!(supervisor.contains("CEVRA_TRANSCRIPT_CACHE_ROOT"));
        assert!(supervisor.contains("app_cache_dir()"));
    }
}

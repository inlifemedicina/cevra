use crate::protocol::DesktopCommandError;
use std::{collections::BTreeMap, ffi::OsString, path::Path};

const FLAG: &str = "--cevra-fa02-review";

/// Native startup only. No WebView command, file picker, ambient credentials,
/// project-store path, media runtime or automatic restart is passed through.
pub fn review_environment(
    args: &[OsString],
    recovering: bool,
) -> Result<Option<BTreeMap<String, String>>, DesktopCommandError> {
    if !args.iter().any(|arg| arg.to_string_lossy().starts_with(FLAG)) {
        return Ok(None);
    }
    let invalid = || DesktopCommandError::new(
        "EDITORIAL_REVIEW_UNAVAILABLE", "Restart the designated offline review explicitly.",
    );
    if recovering || args.len() != 4 || args[0] != FLAG { return Err(invalid()); }
    let values = args[1..].iter().map(|arg| arg.to_str().ok_or_else(invalid)).collect::<Result<Vec<_>, _>>()?;
    if !Path::new(values[0]).is_absolute() || values[0].len() > 2048 || values[0].chars().any(char::is_control) ||
        values[1..].iter().any(|value| value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))) {
        return Err(invalid());
    }
    Ok(Some([
        ("CEVRA_FA02_REVIEW_ROOT".to_owned(), values[0].to_owned()),
        ("CEVRA_FA02_RESULT_SHA256".to_owned(), values[1].to_owned()),
        ("CEVRA_FA02_HISTORY_SHA256".to_owned(), values[2].to_owned()),
    ].into_iter().collect()))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<OsString> { values.iter().map(OsString::from).collect() }
    #[test]
    fn explicit_pair_has_only_three_host_values() {
        let digest = "a".repeat(64);
        let root = if cfg!(windows) { "C:\\review" } else { "/review" };
        let map = review_environment(&args(&[FLAG, root, &digest, &digest]), false).unwrap().unwrap();
        assert_eq!(map.len(), 3);
        assert_eq!(map.get("CEVRA_FA02_REVIEW_ROOT").unwrap(), root);
        assert!(!map.contains_key("CEVRA_PROJECT_PERSISTENCE_ROOT"));
        assert!(review_environment(&args(&[FLAG, root, &digest, &digest]), true).is_err());
    }
    #[test]
    fn ordinary_startup_is_unchanged_and_partial_or_extra_arguments_fail_closed() {
        assert!(review_environment(&args(&[]), false).unwrap().is_none());
        assert!(review_environment(&args(&[FLAG]), false).is_err());
        assert!(review_environment(&args(&[FLAG, "relative", "bad", "bad"]), false).is_err());
        assert!(review_environment(&args(&["--cevra-fa02-review-other"]), false).is_err());
        let digest = "a".repeat(64);
        assert!(review_environment(&args(&[FLAG, "/review", &digest, &digest, "extra"]), false).is_err());
    }
}

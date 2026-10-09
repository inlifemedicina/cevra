use crate::protocol::DesktopCommandError;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const MAX_DROP_FILES: usize = 32;
const RECEIPT_LIFETIME: Duration = Duration::from_secs(120);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaDropState {
    pub sequence: u64,
    pub hovering: bool,
    pub receipt_id: Option<String>,
    pub file_count: usize,
    pub error_code: Option<String>,
}
struct Receipt { id: String, paths: Vec<PathBuf>, issued: Instant }
#[derive(Default)]
struct Inner { state: MediaDropState, pending: Option<Receipt> }

/// Native-issued main-window gestures only; no caller-selected filesystem paths.
#[derive(Default)]
pub struct MediaDropRegistry { inner: Mutex<Inner> }

impl MediaDropRegistry {
    pub fn set_hovering(&self, value: bool) {
        if let Ok(mut inner) = self.inner.lock() { inner.state.hovering = value; }
    }

    pub fn record(&self, paths: Vec<PathBuf>) {
        let Ok(mut inner) = self.inner.lock() else { return };
        inner.state.sequence = inner.state.sequence.saturating_add(1);
        inner.state.hovering = false;
        inner.state.receipt_id = None; inner.state.file_count = 0;
        inner.state.error_code = None; inner.pending = None;
        if paths.is_empty() || paths.len() > MAX_DROP_FILES
            || paths.iter().any(|path| !path.is_absolute()
                || path.to_str().map_or(true, |value| value.len() > 4096)) {
            inner.state.error_code = Some("LOCAL_SOURCE_INVALID_REQUEST".into()); return;
        }
        let id = format!("native-media-drop-{}", inner.state.sequence);
        inner.state.receipt_id = Some(id.clone()); inner.state.file_count = paths.len();
        inner.pending = Some(Receipt { id, paths, issued: Instant::now() });
    }

    pub fn state(&self) -> Result<MediaDropState, DesktopCommandError> {
        let mut inner = self.inner.lock().map_err(|_| unavailable())?;
        if inner.pending.as_ref().is_some_and(|receipt| receipt.issued.elapsed() >= RECEIPT_LIFETIME) {
            inner.pending = None; inner.state.receipt_id = None; inner.state.file_count = 0;
            inner.state.sequence = inner.state.sequence.saturating_add(1);
            inner.state.error_code = Some("MEDIA_DROP_EXPIRED".into());
        }
        Ok(inner.state.clone())
    }

    pub fn consume(&self, id: &str) -> Result<Vec<PathBuf>, DesktopCommandError> {
        let mut inner = self.inner.lock().map_err(|_| unavailable())?;
        let receipt = inner.pending.as_ref().filter(|receipt| receipt.id == id)
            .ok_or_else(|| DesktopCommandError::new("MEDIA_DROP_STALE", "The file-drop gesture is no longer current."))?;
        if receipt.issued.elapsed() >= RECEIPT_LIFETIME {
            inner.pending = None; inner.state.receipt_id = None; inner.state.file_count = 0;
            return Err(DesktopCommandError::new("MEDIA_DROP_EXPIRED", "The file-drop gesture expired."));
        }
        let receipt = inner.pending.take().expect("validated pending receipt");
        inner.state.receipt_id = None; inner.state.file_count = 0;
        Ok(receipt.paths)
    }
}
fn unavailable() -> DesktopCommandError {
    DesktopCommandError::new("MEDIA_DROP_UNAVAILABLE", "File-drop admission is unavailable.")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_receipt_is_detached_single_use_and_wrong_id_cannot_consume_it() {
        let registry = MediaDropRegistry::default();
        registry.record(vec![PathBuf::from("/tmp/source.mp4")]);
        let mut view = registry.state().unwrap();
        assert_eq!(registry.consume("caller-chosen").unwrap_err().code, "MEDIA_DROP_STALE");
        let id = view.receipt_id.take().unwrap();
        assert_eq!(registry.state().unwrap().receipt_id.as_deref(), Some(id.as_str()));
        assert_eq!(registry.consume(&id).unwrap(), vec![PathBuf::from("/tmp/source.mp4")]);
        assert_eq!(registry.consume(&id).unwrap_err().code, "MEDIA_DROP_STALE");
    }
    #[test]
    fn a_new_drop_replaces_the_unclaimed_receipt_and_invalid_drop_cannot_grant_a_path() {
        let registry = MediaDropRegistry::default();
        registry.record(vec![PathBuf::from("/tmp/a.mp4")]);
        let old = registry.state().unwrap().receipt_id.unwrap();
        registry.record(vec![PathBuf::from("/tmp/b.mp4")]);
        assert_eq!(registry.consume(&old).unwrap_err().code, "MEDIA_DROP_STALE");
        let id = registry.state().unwrap().receipt_id.unwrap();
        assert_eq!(registry.consume(&id).unwrap()[0], PathBuf::from("/tmp/b.mp4"));
        for paths in [vec![], vec![PathBuf::from("relative.mp4")],
            vec![PathBuf::from("/tmp/a.mp4"); MAX_DROP_FILES + 1]] {
            registry.record(paths);
            let state = registry.state().unwrap();
            assert!(state.receipt_id.is_none()); assert_eq!(state.file_count, 0);
            assert_eq!(state.error_code.as_deref(), Some("LOCAL_SOURCE_INVALID_REQUEST"));
        }
    }
    #[test]
    fn expired_receipt_is_not_imported_or_replayed() {
        let registry = MediaDropRegistry::default();
        registry.record(vec![PathBuf::from("/tmp/a.mp4")]);
        let id = registry.state().unwrap().receipt_id.unwrap();
        registry.inner.lock().unwrap().pending.as_mut().unwrap().issued -= RECEIPT_LIFETIME;
        assert_eq!(registry.consume(&id).unwrap_err().code, "MEDIA_DROP_EXPIRED");
        assert!(registry.state().unwrap().receipt_id.is_none());
    }
}

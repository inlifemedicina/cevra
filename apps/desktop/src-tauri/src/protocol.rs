use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::oneshot;

pub const PROTOCOL_VERSION: u8 = 1;
pub const MAX_MESSAGE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRequest<'a> {
    pub protocol_version: u8,
    pub id: &'a str,
    pub method: &'a str,
    pub params: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostResponse {
    pub protocol_version: u8,
    pub id: String,
    pub result: Option<Value>,
    pub error: Option<HostProtocolError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct HostProtocolError {
    pub code: String,
    pub message: String,
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DesktopCommandError {
    pub code: String,
    pub message: String,
}

impl DesktopCommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into() }
    }
}

impl From<HostProtocolError> for DesktopCommandError {
    fn from(error: HostProtocolError) -> Self {
        Self::new(error.code, error.message)
    }
}

pub struct JsonLineFramer {
    buffer: Vec<u8>,
    maximum_bytes: usize,
}

impl JsonLineFramer {
    pub fn new() -> Self { Self::with_limit(MAX_MESSAGE_BYTES) }

    pub fn with_limit(maximum_bytes: usize) -> Self {
        assert!(maximum_bytes > 0);
        Self { buffer: Vec::new(), maximum_bytes }
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Vec<u8>>, DesktopCommandError> {
        let mut lines = Vec::new();
        for byte in bytes {
            if *byte == b'\n' {
                if !self.buffer.is_empty() {
                    lines.push(std::mem::take(&mut self.buffer));
                }
                continue;
            }
            if self.buffer.len() >= self.maximum_bytes {
                self.buffer.clear();
                return Err(DesktopCommandError::new("HOST_MESSAGE_TOO_LARGE", "Desktop host response exceeded the protocol limit."));
            }
            self.buffer.push(*byte);
        }
        Ok(lines)
    }
}

type PendingSender = oneshot::Sender<Result<Value, DesktopCommandError>>;

#[derive(Default)]
pub struct PendingRequests {
    entries: HashMap<String, PendingSender>,
}

impl PendingRequests {
    pub fn insert(&mut self, id: String, sender: PendingSender) -> Result<(), DesktopCommandError> {
        if self.entries.insert(id, sender).is_some() {
            return Err(DesktopCommandError::new("HOST_DUPLICATE_REQUEST", "Duplicate desktop host request ID."));
        }
        Ok(())
    }

    pub fn remove(&mut self, id: &str) -> Option<PendingSender> { self.entries.remove(id) }

    pub fn resolve(&mut self, response: HostResponse) {
        let Some(sender) = self.remove(&response.id) else { return; };
        let outcome = if response.protocol_version != PROTOCOL_VERSION {
            Err(DesktopCommandError::new("HOST_PROTOCOL_MISMATCH", "Desktop host protocol mismatch."))
        } else if let Some(error) = response.error {
            Err(error.into())
        } else if let Some(result) = response.result {
            Ok(result)
        } else {
            Err(DesktopCommandError::new("HOST_MALFORMED_RESPONSE", "Desktop host response is malformed."))
        };
        let _ = sender.send(outcome);
    }

    pub fn reject_all(&mut self, error: DesktopCommandError) {
        for (_, sender) in self.entries.drain() {
            let _ = sender.send(Err(error.clone()));
        }
    }

    #[cfg(test)]
    pub fn len(&self) -> usize { self.entries.len() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framing_handles_partial_and_multiple_messages() {
        let mut framer = JsonLineFramer::new();
        assert!(framer.push(br#"{"id":"a""#).unwrap().is_empty());
        let lines = framer.push(b"}\n{\"id\":\"b\"}\n").unwrap();
        assert_eq!(lines, vec![br#"{"id":"a"}"#.to_vec(), br#"{"id":"b"}"#.to_vec()]);
    }

    #[test]
    fn framing_enforces_message_boundary() {
        let mut framer = JsonLineFramer::with_limit(4);
        assert!(framer.push(b"1234").unwrap().is_empty());
        assert_eq!(framer.push(b"5").unwrap_err().code, "HOST_MESSAGE_TOO_LARGE");
    }

    #[tokio::test]
    async fn pending_requests_route_concurrent_responses_by_id() {
        let mut pending = PendingRequests::default();
        let (first_tx, first_rx) = oneshot::channel();
        let (second_tx, second_rx) = oneshot::channel();
        pending.insert("a".into(), first_tx).unwrap();
        pending.insert("b".into(), second_tx).unwrap();
        pending.resolve(HostResponse { protocol_version: 1, id: "b".into(), result: Some(Value::String("second".into())), error: None });
        pending.resolve(HostResponse { protocol_version: 1, id: "a".into(), result: Some(Value::String("first".into())), error: None });
        assert_eq!(first_rx.await.unwrap().unwrap(), Value::String("first".into()));
        assert_eq!(second_rx.await.unwrap().unwrap(), Value::String("second".into()));
        assert_eq!(pending.len(), 0);
    }

    #[tokio::test]
    async fn host_exit_rejects_every_pending_request() {
        let mut pending = PendingRequests::default();
        let (first_tx, first_rx) = oneshot::channel();
        let (second_tx, second_rx) = oneshot::channel();
        pending.insert("a".into(), first_tx).unwrap();
        pending.insert("b".into(), second_tx).unwrap();
        pending.reject_all(DesktopCommandError::new("HOST_UNAVAILABLE", "Host exited."));
        assert_eq!(first_rx.await.unwrap().unwrap_err().code, "HOST_UNAVAILABLE");
        assert_eq!(second_rx.await.unwrap().unwrap_err().code, "HOST_UNAVAILABLE");
    }

    #[tokio::test]
    async fn protocol_mismatch_rejects_only_matching_request() {
        let mut pending = PendingRequests::default();
        let (sender, receiver) = oneshot::channel();
        pending.insert("mismatch".into(), sender).unwrap();
        pending.resolve(HostResponse { protocol_version: 2, id: "mismatch".into(), result: Some(Value::Null), error: None });
        assert_eq!(receiver.await.unwrap().unwrap_err().code, "HOST_PROTOCOL_MISMATCH");
    }
}

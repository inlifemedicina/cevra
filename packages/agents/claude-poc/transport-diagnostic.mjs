// Non-content failure evidence only. This module grants no execution authority
// and does not participate in transport acceptance or containment decisions.
const codes = new Set([
  'CONTAINMENT', 'CANCELLED', 'TIMEOUT', 'STDOUT_LIMIT', 'LINE_LIMIT', 'EMPTY_EVENT',
  'EVENT_LIMIT', 'INVALID_EVENT', 'LATE_EVENT', 'CORRELATION', 'DUPLICATE_INIT',
  'MISSING_INIT', 'PROTOCOL_EVENT_UNSUPPORTED', 'PROVIDER_MODEL_REFUSAL',
  'PROTOCOL_EVENT_INVALID', 'PROVIDER_RETRY_NOT_ALLOWED', 'EXTRA_USAGE',
  'PROVIDER_AUTH_ERROR', 'PROVIDER_BILLING_ERROR', 'PROVIDER_RATE_LIMIT',
  'PROVIDER_INVALID_REQUEST', 'PROVIDER_SERVER_ERROR', 'PROVIDER_MODEL_ERROR',
  'PROVIDER_ERROR_UNKNOWN', 'PARTIAL_ASSISTANT', 'PARTIAL_RESULT', 'TURN_LIMIT',
  'MODEL_UNPROVEN', 'RESPONSE_LIMIT', 'MODEL_UNAVAILABLE', 'MODEL_DRIFT',
  'PARTIAL_EOF', 'MISSING_RESULT', 'STDERR_LIMIT', 'PROCESS_ERROR', 'STDIN_ERROR',
  'PROCESS_EXIT', 'MISSING_CLOSE', 'VERSION_DRIFT', 'BINARY_PATH',
  'FIRST_FA_BINDING_STALE', 'FIRST_FA_INVOCATION_LIMIT'
]);
const reasons = new Set([
  ...['TOOLS', 'MCP', 'PLUGINS'].flatMap(field =>
    ['MISSING', 'WRONG_TYPE', 'NONEMPTY'].map(kind => `INIT_${field}_${kind}`)),
  'INIT_SKILLS_WRONG_TYPE', 'INIT_SKILLS_NONEMPTY', 'INIT_PERMISSION_BYPASS',
  'INIT_MODEL_INVALID', 'ASSISTANT_SYNTHETIC_UNPROVEN', 'MODEL_INVALID',
  'EXPECTED_MODEL_MISMATCH', 'INIT_MODEL_DRIFT', 'MODEL_MISMATCH',
  'UNSUPPORTED_SYSTEM_EVENT', 'REFUSAL_FALLBACK_NOT_ALLOWED', 'REFUSAL_NO_FALLBACK',
  'API_RETRY_SHAPE', 'STATUS_COMPACTING', 'STATUS_PERMISSION_BYPASS', 'STATUS_SHAPE',
  'SESSION_REQUIRES_ACTION', 'SESSION_STATE_SHAPE', 'THINKING_TOKENS_SHAPE',
  'FORBIDDEN_SYSTEM_EVENT', 'UNKNOWN_SYSTEM_SUBTYPE', 'RATE_LIMIT_SHAPE',
  'AUTH_STATUS_SHAPE', 'AUTH_STATUS_DURING_TURN', 'MESSAGE_ID_SHAPE', 'TEXT_BLOCK_SHAPE',
  'FORBIDDEN_EVENT_TYPE', 'UNKNOWN_TYPE', 'RESULT_STOP_REASON', 'NO_GENERATED_TEXT',
  'MODEL_USAGE_SHAPE', 'MODEL_USAGE_EMPTY', 'MODEL_USAGE_MULTIPLE',
  'MODEL_USAGE_VALUE', 'MODEL_USAGE_TOKENS',
  'PROVIDER_AUTH_ERROR', 'PROVIDER_BILLING_ERROR', 'PROVIDER_RATE_LIMIT',
  'PROVIDER_INVALID_REQUEST', 'PROVIDER_SERVER_ERROR', 'PROVIDER_MODEL_ERROR',
  'PROVIDER_ERROR_UNKNOWN'
]);
const types = ['system', 'assistant', 'result', 'rate_limit_event', 'other'];
const subtypes = ['init', 'status', 'session_state_changed', 'api_retry', 'thinking_tokens',
  'success', 'informational', 'notification', 'model_refusal_fallback',
  'model_refusal_no_fallback', 'elicitation_complete', 'error_during_execution',
  'error_max_turns', 'error_max_budget_usd', 'error_max_structured_output_retries', 'other'];
const fields = ['tools', 'mcp_servers', 'plugins', 'skills'];
const kinds = ['missing', 'array', 'null', 'object', 'string', 'number', 'boolean'];
const invalid = () => { throw Object.assign(new Error('TRANSPORT_DIAGNOSTIC_INVALID'), { code: 'TRANSPORT_DIAGNOSTIC_INVALID' }); };
function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|') ||
      keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) invalid();
}
export function validateTransportDiagnostic(value) {
  closed(value, ['transportCode', 'reason', 'event']);
  if (value.transportCode !== null && !codes.has(value.transportCode) ||
      value.reason !== null && !reasons.has(value.reason)) invalid();
  if (value.event === null) return value;
  const event = value.event;
  closed(event, ['type', 'subtype', ...fields, 'permissionsBypassed']);
  if (!types.includes(event.type) || !subtypes.includes(event.subtype) ||
      typeof event.permissionsBypassed !== 'boolean') invalid();
  for (const field of fields) {
    const shape = event[field];
    closed(shape, ['present', 'kind', 'count']);
    if (typeof shape.present !== 'boolean' || !kinds.includes(shape.kind) ||
        shape.present !== (shape.kind !== 'missing') ||
        (shape.kind === 'array' ? !Number.isSafeInteger(shape.count) || shape.count < 0 || shape.count > 1_000_000 : shape.count !== null)) invalid();
  }
  return value;
}
const freeze = value => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
};
export function captureTransportDiagnostic(error) {
  // Unknown values are unproven, never an arbitrary string fallback. Project
  // only the pre-sanitized reader summary; raw events/payloads are not inputs.
  const value = { transportCode: null, reason: null, event: null };
  try {
    const code = error?.code, reason = error?.reason;
    value.transportCode = codes.has(code) ? code : null;
    value.reason = reasons.has(reason) ? reason : null;
    const summary = error?.metrics?.lastEventSummary;
    if (summary) {
      const event = { type: summary.type, subtype: summary.subtype };
      for (const field of fields) {
        const shape = summary[field];
        event[field] = { present: shape?.present, kind: shape?.kind, count: shape?.count };
      }
      event.permissionsBypassed = summary.permissionsBypassed;
      validateTransportDiagnostic({ ...value, event });
      value.event = event;
    }
  } catch { /* Malformed diagnostic evidence cannot replace the primary error. */ }
  return freeze(value);
}

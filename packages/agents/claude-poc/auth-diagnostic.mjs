// Closed, non-content auth diagnostics. Error text is interpreted in memory,
// never copied into normal metrics or the operator receipt.
const AUTH_CODES=new Set(['authentication_failed','oauth_org_not_allowed','cloud_credential_error']);

export function compareAuthStatus(reference,child){
  const valid=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
    typeof value.loggedIn==='boolean'&&typeof value.configDirectory==='string'&&value.configDirectory.length>0;
  if(!valid(reference)||!valid(child))return Object.freeze({status:'INVALID_STATUS'});
  return Object.freeze({status:reference.configDirectory===child.configDirectory?'SAME_CONFIG_DIRECTORY':'CONFIG_DIRECTORY_DRIFT',
    referenceLoggedIn:reference.loggedIn,childLoggedIn:child.loggedIn,
    sameAuthMethod:reference.authMethod===child.authMethod,
    sameApiProvider:reference.apiProvider===child.apiProvider});
}

export function classifyAuthExplanation({errorCode,status,text}){
  const explicitAuth=AUTH_CODES.has(errorCode)||status===401||status===403;
  const hasText=typeof text==='string'&&text.length>0;
  const sample=hasText?text.slice(0,4096).toLowerCase():'';
  let category='UNKNOWN';
  if(explicitAuth&&sample){
    if(/\b(login|session|token|credential)\b.{0,48}\b(expired|revoked)\b|\b(expired|revoked)\b.{0,48}\b(login|session|token|credential)\b/.test(sample))category='LOGIN_EXPIRED_OR_REVOKED';
    else if(/\b(keychain|credential store|keyring)\b.{0,64}\b(locked|denied|unavailable|access|read|error|fail)/.test(sample)||
      /\b(access|read)\b.{0,48}\b(keychain|credential store|keyring)\b/.test(sample))category='CREDENTIAL_STORE_ACCESS';
    else if(/\b(no credential|credentials? not found|not logged in|no login|please (log|sign) in)\b/.test(sample))category='NO_CREDENTIAL_AVAILABLE';
    else if(/\b(organization|org)\b.{0,80}\b(not allowed|denied|restricted|unauthorized|not authorized|access)\b|\b(not allowed|denied|restricted)\b.{0,80}\b(organization|org)\b/.test(sample))category='ORGANIZATION_ACCESS_RESTRICTION';
    else if(/\b(unsupported|not supported)\b.{0,64}\b(authentication|auth|login|credential)\b|\b(authentication|auth|login)\b.{0,64}\b(unsupported|not supported)\b/.test(sample))category='UNSUPPORTED_AUTH_ROUTE';
  }
  if(category==='UNKNOWN'&&explicitAuth)category='AUTH_REJECTED_UNSPECIFIED';
  return Object.freeze({category,textPresent:hasText,statusPresent:Number.isInteger(status)&&status>=100&&status<=599,
    evidence:category==='UNKNOWN'?'NO_CLASSIFIABLE_AUTH_EVIDENCE':category==='AUTH_REJECTED_UNSPECIFIED'?'EXPLICIT_AUTH_ERROR_ONLY':'ERROR_TEXT_PATTERN'});
}

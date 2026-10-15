//! Candidate-only bounded numeric receipts. Canvas/RAF opportunities are not physical paint.
use serde::{Deserialize, Serialize};
use std::{fs::File, io::Write, sync::Mutex};
use tauri::{AppHandle, Manager};
use crate::protocol::DesktopCommandError;

#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct HostTiming { host_total_ms:f64,base_prepare_ms:f64,graphic_prepare_ms:f64,graphic_cache_hit:bool,rust_host_ms:Option<f64>,tauri_round_trip_ms:Option<f64> }
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct PresentationReceipt {
    version:u8,kind:String,operation_id:String,snapshot_id:String,epoch:u64,frame:u32,
    request_to_canvas_ms:f64,ui_decode_ms:f64,animation_opportunity_ms:Option<f64>,superseded_before_opportunity:bool,
    host:Option<HostTiming>,physical_paint_ms:Option<f64>,endpoint:String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct BrowserCapabilities { resize_observer:bool, video_frame_callback:bool, image_bitmap:bool, web_crypto_digest:bool }
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct FallbackReceipt {
    version:u8,kind:String,operation_id:String,snapshot_id:String,epoch:u64,
    stage:String,reason:String,native_code:Option<String>,elapsed_ms:f64,
    capabilities:BrowserCapabilities,endpoint:String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct DecoderState {
    time_ms:Option<f64>,paused:bool,ended:bool,seeking:bool,ready_state:u8,network_state:u8,error_code:Option<u8>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct CallbackState { received:u32,scheduled:bool,last_media_time_ms:Option<f64>,last_age_ms:Option<f64> }
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct DrawState { submitted:u32,failed:u32,last_age_ms:Option<f64> }
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct PlaybackReceipt {
    version:u8,kind:String,reason:String,operation_id:String,snapshot_id:String,epoch:u64,elapsed_ms:f64,
    intent_to_play:bool,frame:Option<u32>,pending_seek:bool,decoder:DecoderState,callback:CallbackState,draw:DrawState,
    visibility:String,endpoint:String,
}
#[derive(Deserialize, Serialize)]
#[serde(untagged)]
pub enum DiagnosticReceipt { Presentation(PresentationReceipt), Fallback(FallbackReceipt), Playback(PlaybackReceipt) }
fn finite(v:f64)->bool{v.is_finite() && (0.0..=3_600_000.0).contains(&v)}
fn identifier(v:&str)->bool{!v.is_empty() && v.len()<=128 && v.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')}
fn media_time(v:f64)->bool{v.is_finite() && (0.0..=604_800_000.0).contains(&v)}
fn valid_playback(v:&PlaybackReceipt)->bool{
    v.version==1 && v.kind=="playback" && ["sample","draw-failure"].contains(&v.reason.as_str())
    && v.endpoint=="playback-observation" && v.epoch>0 && identifier(&v.operation_id) && identifier(&v.snapshot_id)
    && finite(v.elapsed_ms) && v.frame.map_or(true,|n|n<=18_144_000)
    && v.decoder.time_ms.map_or(true,media_time) && v.decoder.ready_state<=4 && v.decoder.network_state<=3
    && v.decoder.error_code.map_or(true,|n|(1..=4).contains(&n))
    && v.callback.received<=18_144_000 && v.callback.last_media_time_ms.map_or(true,media_time) && v.callback.last_age_ms.map_or(true,finite)
    && v.draw.submitted<=18_144_000 && v.draw.failed<=18_144_000 && v.draw.last_age_ms.map_or(true,finite)
    && ["visible","hidden","unknown"].contains(&v.visibility.as_str())
}
fn valid_fallback(v:&FallbackReceipt)->bool{
    v.version==1 && v.kind=="fallback" && v.endpoint=="encoded-fallback" && v.epoch>0
    && identifier(&v.operation_id) && identifier(&v.snapshot_id) && finite(v.elapsed_ms)
    && ["request","binding","base","graphic","decode","capability","play"].contains(&v.stage.as_str())
    && ["unsupported","binding","base-unavailable","base-identity","oversize","png-invalid","graphic-identity","graphic-collision","decode-error","decode-timeout","base-grid","frame","resize-observer-unavailable","video-frame-callback-unavailable","play-rejected","unexpected"].contains(&v.reason.as_str())
    && v.native_code.as_ref().map_or(true, |code| ["MANUAL_LAYER_UNAVAILABLE","MANUAL_VIDEO_UNAVAILABLE","MANUAL_VIDEO_UNSUPPORTED","MANUAL_VIDEO_SOURCE_CHANGED","MANUAL_VIDEO_STALE","MANUAL_VIDEO_PREVIEW_TIMEOUT","MANUAL_VIDEO_TITLE_COLOUR_UNSUPPORTED","OPERATION_CANCELLED","PROJECT_MUTATION_BUSY","HOST_INVALID_PARAMS","HOST_UNAVAILABLE","HOST_OPERATION_FAILED"].contains(&code.as_str()))
}
fn valid(v:&PresentationReceipt)->bool{
    v.version==1 && ["asset-update","seek"].contains(&v.kind.as_str()) && v.endpoint=="canvas-submit" && v.physical_paint_ms.is_none()
    && v.operation_id.len()<=128 && !v.operation_id.is_empty() && v.operation_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')
    && !v.snapshot_id.is_empty() && v.snapshot_id.len()<=128 && v.snapshot_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')
    && v.epoch>0 && v.frame<=18_144_000 && finite(v.request_to_canvas_ms)&&finite(v.ui_decode_ms)&&v.animation_opportunity_ms.map_or(true,finite)
    && v.host.as_ref().map_or(true,|h| finite(h.host_total_ms)&&finite(h.base_prepare_ms)&&finite(h.graphic_prepare_ms)&&h.rust_host_ms.map_or(true,finite)&&h.tauri_round_trip_ms.map_or(true,finite))
}
static RECEIPTS:Mutex<Option<(File,usize)>>=Mutex::new(None);
#[tauri::command]
pub fn desktop_record_layer_presentation(app:AppHandle,args:DiagnosticReceipt)->Result<(),DesktopCommandError>{
    if option_env!("CEVRA_EXPERIMENTAL_TITLE_LAYER")!=Some("1"){return Err(DesktopCommandError::new("MANUAL_LAYER_UNAVAILABLE","Experimental diagnostics disabled."))}
    if !match &args {DiagnosticReceipt::Presentation(v)=>valid(v),DiagnosticReceipt::Fallback(v)=>valid_fallback(v),DiagnosticReceipt::Playback(v)=>valid_playback(v)}{return Err(DesktopCommandError::new("HOST_INVALID_PARAMS","Invalid presentation receipt."))}
    let result=(||->std::io::Result<()>{
        let mut state=RECEIPTS.lock().map_err(|_|std::io::Error::other("receipt unavailable"))?;
        if state.is_none(){
            let root=app.path().app_local_data_dir().map_err(|_|std::io::Error::other("receipt path unavailable"))?;
            std::fs::create_dir_all(&root)?;let mut options=std::fs::OpenOptions::new();options.create_new(true).write(true);
            #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
            *state=Some((options.open(root.join(format!("layer-preview-{}.jsonl",std::process::id())))?,0));
        }
        let (file,count)=state.as_mut().unwrap();if *count>=100{return Ok(())}
        let mut line=serde_json::to_vec(&args)?;line.push(b'\n');file.write_all(&line)?;file.flush()?;*count+=1;Ok(())
    })();result.map_err(|_|DesktopCommandError::new("HOST_UNAVAILABLE","Presentation receipt unavailable."))
}
#[cfg(test)] mod tests {
    use super::*;
    fn value()->serde_json::Value{serde_json::json!({"version":1,"kind":"seek","operationId":"seek-1","snapshotId":"snapshot-1","epoch":1,"frame":150,"requestToCanvasMs":8.0,"uiDecodeMs":5.0,"animationOpportunityMs":20.0,"supersededBeforeOpportunity":false,"host":null,"physicalPaintMs":null,"endpoint":"canvas-submit"})}
    #[test] fn accepts_only_bounded_numeric_presentation_evidence(){let v:PresentationReceipt=serde_json::from_value(value()).unwrap();assert!(valid(&v));for key in ["requestToCanvasMs","uiDecodeMs","animationOpportunityMs"]{let mut a=value();a[key]=serde_json::json!(-1);assert!(!valid(&serde_json::from_value(a).unwrap()))}}
    #[test] fn never_accepts_a_physical_paint_claim_or_arbitrary_fields(){let mut a=value();a["physicalPaintMs"]=serde_json::json!(1);assert!(!valid(&serde_json::from_value(a).unwrap()));let mut b=value();b["path"]=serde_json::json!("/tmp/x");assert!(serde_json::from_value::<PresentationReceipt>(b).is_err())}
    fn fallback()->serde_json::Value{serde_json::json!({"version":1,"kind":"fallback","operationId":"layer-preview-1","snapshotId":"snapshot-1","epoch":1,"stage":"decode","reason":"base-grid","nativeCode":null,"elapsedMs":12.0,"capabilities":{"resizeObserver":true,"videoFrameCallback":true,"imageBitmap":true,"webCryptoDigest":true},"endpoint":"encoded-fallback"})}
    #[test] fn accepts_closed_fallback_without_claiming_canvas_or_paint(){
        let v=fallback();let parsed:FallbackReceipt=serde_json::from_value(v.clone()).unwrap();assert!(valid_fallback(&parsed));
        assert!(matches!(serde_json::from_value::<DiagnosticReceipt>(v).unwrap(),DiagnosticReceipt::Fallback(_)));
        assert!(matches!(serde_json::from_value::<DiagnosticReceipt>(value()).unwrap(),DiagnosticReceipt::Presentation(_)));
    }
    #[test] fn refuses_private_text_unknown_codes_and_invalid_fallback_bounds(){
        for key in ["reason","stage","nativeCode"]{let mut v=fallback();v[key]=serde_json::json!("private title or path");assert!(!valid_fallback(&serde_json::from_value(v).unwrap()))}
        for key in ["path","message","title","physicalPaintMs"]{let mut v=fallback();v[key]=serde_json::json!("private");assert!(serde_json::from_value::<DiagnosticReceipt>(v).is_err())}
        for key in ["operationId","snapshotId"]{let mut v=fallback();v[key]=serde_json::json!("/private/path");assert!(!valid_fallback(&serde_json::from_value(v).unwrap()))}
        let mut v=fallback();v["elapsedMs"]=serde_json::json!(-1);assert!(!valid_fallback(&serde_json::from_value(v).unwrap()));
        let mut v=fallback();v["endpoint"]=serde_json::json!("canvas-submit");assert!(!valid_fallback(&serde_json::from_value(v).unwrap()));
    }
    fn playback()->serde_json::Value{serde_json::json!({"version":1,"kind":"playback","reason":"sample","operationId":"playback-1","snapshotId":"snapshot-1","epoch":2,"elapsedMs":1000.0,"intentToPlay":true,"frame":218,"pendingSeek":false,"decoder":{"timeMs":8500.0,"paused":false,"ended":false,"seeking":false,"readyState":2,"networkState":1,"errorCode":null},"callback":{"received":10,"scheduled":true,"lastMediaTimeMs":7266.666,"lastAgeMs":1000.0},"draw":{"submitted":11,"failed":0,"lastAgeMs":1000.0},"visibility":"visible","endpoint":"playback-observation"})}
    #[test] fn accepts_closed_playback_observation_with_unknown_event_times(){
        let mut v=playback();assert!(valid_playback(&serde_json::from_value(v.clone()).unwrap()));
        assert!(matches!(serde_json::from_value::<DiagnosticReceipt>(v.clone()).unwrap(),DiagnosticReceipt::Playback(_)));
        v["frame"]=serde_json::Value::Null;v["decoder"]["timeMs"]=serde_json::Value::Null;
        for k in ["lastMediaTimeMs","lastAgeMs"]{v["callback"][k]=serde_json::Value::Null;}
        v["draw"]["lastAgeMs"]=serde_json::Value::Null;v["reason"]=serde_json::json!("draw-failure");
        assert!(valid_playback(&serde_json::from_value(v).unwrap()));
    }
    #[test] fn refuses_playback_private_fields_and_open_strings_at_every_level(){
        for key in ["path","message","title","physicalPaintMs"]{
            let mut v=playback();v[key]=serde_json::json!("private");assert!(serde_json::from_value::<DiagnosticReceipt>(v).is_err());
            for nested in ["decoder","callback","draw"]{let mut v=playback();v[nested][key]=serde_json::json!("private");assert!(serde_json::from_value::<DiagnosticReceipt>(v).is_err());}
        }
        for key in ["reason","visibility","endpoint","operationId","snapshotId"]{let mut v=playback();v[key]=serde_json::json!("/private/path");assert!(!valid_playback(&serde_json::from_value(v).unwrap()));}
    }
    #[test] fn refuses_invalid_playback_numbers_states_and_error_codes(){
        for (path,n) in [("frame",18_144_001),("decoder/readyState",5),("decoder/networkState",4),("decoder/errorCode",0),("decoder/errorCode",5),("callback/received",18_144_001),("draw/submitted",18_144_001),("draw/failed",18_144_001)]{
            let mut v=playback();*v.pointer_mut(&format!("/{path}")).unwrap()=serde_json::json!(n);assert!(!valid_playback(&serde_json::from_value(v).unwrap()));
        }
        for path in ["elapsedMs","decoder/timeMs","callback/lastMediaTimeMs","callback/lastAgeMs","draw/lastAgeMs"]{
            let mut v=playback();*v.pointer_mut(&format!("/{path}")).unwrap()=serde_json::json!(-1.0);assert!(!valid_playback(&serde_json::from_value(v).unwrap()));
        }
        let mut v:PlaybackReceipt=serde_json::from_value(playback()).unwrap();v.decoder.time_ms=Some(f64::INFINITY);assert!(!valid_playback(&v));
        v.decoder.time_ms=Some(0.0);v.elapsed_ms=f64::NAN;assert!(!valid_playback(&v));
    }
}

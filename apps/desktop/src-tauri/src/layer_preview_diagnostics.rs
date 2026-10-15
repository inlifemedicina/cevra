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
fn finite(v:f64)->bool{v.is_finite() && (0.0..=3_600_000.0).contains(&v)}
fn valid(v:&PresentationReceipt)->bool{
    v.version==1 && ["asset-update","seek"].contains(&v.kind.as_str()) && v.endpoint=="canvas-submit" && v.physical_paint_ms.is_none()
    && v.operation_id.len()<=128 && !v.operation_id.is_empty() && v.operation_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')
    && !v.snapshot_id.is_empty() && v.snapshot_id.len()<=128 && v.snapshot_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')
    && v.epoch>0 && v.frame<=18_144_000 && finite(v.request_to_canvas_ms)&&finite(v.ui_decode_ms)&&v.animation_opportunity_ms.map_or(true,finite)
    && v.host.as_ref().map_or(true,|h| finite(h.host_total_ms)&&finite(h.base_prepare_ms)&&finite(h.graphic_prepare_ms)&&h.rust_host_ms.map_or(true,finite)&&h.tauri_round_trip_ms.map_or(true,finite))
}
static RECEIPTS:Mutex<Option<(File,usize)>>=Mutex::new(None);
#[tauri::command]
pub fn desktop_record_layer_presentation(app:AppHandle,args:PresentationReceipt)->Result<(),DesktopCommandError>{
    if option_env!("CEVRA_EXPERIMENTAL_TITLE_LAYER")!=Some("1"){return Err(DesktopCommandError::new("MANUAL_LAYER_UNAVAILABLE","Experimental diagnostics disabled."))}
    if !valid(&args){return Err(DesktopCommandError::new("HOST_INVALID_PARAMS","Invalid presentation receipt."))}
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
}

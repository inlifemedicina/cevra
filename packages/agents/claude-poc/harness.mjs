// Historical inspection only. This experiment cannot start another Claude process.
import {EXPERIMENT_POLICY,assertExperimentOpen,evidencePath,inspectExperiment} from './experiment-store.mjs';

const mode=process.argv[2];
// Reject all operational modes before filesystem setup, binary verification or auth status.
if(mode!=='status')assertExperimentOpen();
let inspection;
try{
  const state=await inspectExperiment(evidencePath(process.env.HOME));
  inspection={integrity:'consistent',historicalDebited:state.checkpoint.historicalDebited,
    originalReceipts:state.checkpoint.originalReceipts,recordedUsed:state.recordedUsed,
    unresolvedReservations:state.unresolvedReservations,
    reservations:state.reservations.map(r=>({number:r.number,purpose:r.purpose}))};
}catch(error){
  // File integrity/availability never determines permission to reopen the experiment.
  const known=new Set(['ENOENT','RECOVERY_CHECKPOINT_REQUIRED','RECOVERY_CHECKPOINT_INVALID',
    'EVIDENCE_DIRECTORY_UNSAFE','EVIDENCE_FILE_UNSAFE','EVIDENCE_HOME_INVALID',
    'RESERVATION_INVALID','RESERVATION_SEQUENCE_INVALID','RECEIPT_WITHOUT_RESERVATION',
    'RECEIPT_RESERVATION_MISMATCH']);
  inspection={integrity:'unverified',code:known.has(error.code)?error.code:'EVIDENCE_INSPECTION_FAILED'};
}
console.log(JSON.stringify({policy:EXPERIMENT_POLICY,inspection},null,2));

import {createEmptyProject,createSourceTranscript,ProjectHistory} from '@cevra/project-ir';
export const PHRASES={
 'pt-BR':[
  ['A entrega é sempre... não, vou explicar de novo.','O envio no mesmo dia vale para pedidos confirmados até meio-dia em dias úteis.','Dito de outro modo, confirmou antes das doze num dia útil, despachamos nesse dia.','Isso só vale se o pagamento foi aprovado e o item está em estoque. Não é promessa de chegada no mesmo dia.'],
  ['Você recebe um código de rastreamento depois que a transportadora coleta a caixa.','Não despachamos no mesmo dia quando o pedido é confirmado após meio-dia; nesse caso, fica para o próximo dia útil.','Olha isso: a diferença entre as duas embalagens fica evidente aqui.']
 ],
 'en-US':[
  ['Every order goes out... wait, let me start again.','Orders confirmed by noon on a business day qualify for same-day dispatch.','In other words, confirmation before twelve on a working day means we send it that day.','Only if payment has cleared and the item is in stock. Dispatch is not a promise of same-day arrival.'],
  ['A tracking code becomes available after the carrier picks up the parcel.','We do not dispatch that day if confirmation comes after noon; those orders wait until the next business day.','Look at this: the difference between these two packages is obvious here.']
 ]
};
const now='2026-09-29T00:00:00.000Z';
export function fixture(locale='pt-BR',extra={}){
 const project=createEmptyProject({id:'synthetic-poc-project',locale,now});
 const ids=['synthetic-a','synthetic-b'];
 ids.forEach((sourceId,i)=>{
  project.sources.push({id:sourceId,kind:'video',uri:`file:///synthetic-only/${sourceId}.mov`,displayName:'Synthetic metadata MUST NOT be disclosed',durationMs:1000000});
  const phrases=[...PHRASES[locale][i],...(extra[i]??[])];
  const segments=phrases.map((text,j)=>({id:`segment-${i}-${j}`,text,startMs:j*10000,endMs:j*10000+9000,wordIds:[]}));
  project.sourceTranscripts.push(createSourceTranscript({sourceId,wordTiming:'none',speakerState:'none',transcript:{language:locale,words:[],segments},provenance:{stages:[{kind:'transcription',executionId:'synthetic-transcription',engineId:'fixture',engineVersion:'1',engineApiVersion:'1',modelId:'fixture',createdAt:now}]}}));
 });
 let seq=0;const history=new ProjectHistory(project,{clock:()=>now,idGenerator:()=>`synthetic-history-${++seq}`});
 return{history,ids};
}

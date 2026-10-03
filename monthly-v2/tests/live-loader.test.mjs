import assert from 'node:assert/strict';
import {loadLiveBundle} from '../live-v1.js';
import {selectPayload} from '../core.js';
const source={meta:{generated_at:'2026-10-03T09:00:00Z'},sku:[{month:'2026-09-01',marketplace:'OZON',sku:'sku-1',sales:100,net_sales:100,sold_units:1,commission:-20}]};
const ok=()=>({ok:true,json:async()=>source});
const id=url=>new URL(url).searchParams.get('tenant');
const updates=[];
let releaseOrange;
const orangeGate=new Promise(resolve=>{releaseOrange=resolve;});
const pending=loadLiveBundle({fetcher:async url=>{
 if(id(url)==='ORANGE'){await orangeGate;return {ok:false,status:500};}
 return ok();
},onUpdate:b=>updates.push(structuredClone(b))});
await new Promise(resolve=>setImmediate(resolve));
const early=updates.at(-1);
assert.ok(selectPayload(early,'W','2026-09'));
assert.ok(selectPayload(early,'CPR','2026-09'));
assert.equal(early.tenant_status.ORANGE.status,'loading');
releaseOrange();
const partial=await pending;
assert.equal(partial.tenant_status.ORANGE.status,'error');
assert.equal(selectPayload(partial,'W','2026-09').financial_economics.net_sales,100);
assert.equal(selectPayload(partial,'CPR','2026-09').financial_economics.result_without_compensation,80);
assert.equal(selectPayload(partial,'ORANGE','2026-09'),null);
for(const failure of ['W','CPR','ORANGE']){
 const b=await loadLiveBundle({fetcher:async url=>{if(id(url)===failure)throw new Error('Network failure');return ok();}});
 assert.equal(b.tenant_status[failure].status,'error');
 for(const tenant of ['W','CPR','ORANGE'].filter(t=>t!==failure))assert.ok(selectPayload(b,tenant,'2026-09'));
}
const malformed=await loadLiveBundle({fetcher:async url=>id(url)==='ORANGE'?{ok:true,json:async()=>({error:'bad'})}:ok()});
assert.equal(malformed.tenant_status.ORANGE.status,'error');
assert.ok(selectPayload(malformed,'W','2026-09'));
const timed=await loadLiveBundle({timeoutMs:10,fetcher:async(url,{signal})=>id(url)==='ORANGE'?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Abort')),{once:true})):ok()});
assert.equal(timed.tenant_status.ORANGE.status,'error');
assert.match(timed.tenant_status.ORANGE.message,/время/);
assert.ok(selectPayload(timed,'CPR','2026-09'));
const allFailed=await loadLiveBundle({fetcher:async()=>({ok:false,status:500})});
assert.equal(allFailed.payloads.length,0);
assert.ok(Object.values(allFailed.tenant_status).every(s=>s.status==='error'));
console.log('PASS: independent incremental W/CPR/Orange loading, HTTP/network/invalid-response/timeout/all-failed isolation');

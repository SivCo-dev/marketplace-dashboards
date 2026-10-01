import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {createDecipheriv} from "node:crypto";
import {money,rate,selectPayload,filterRows,expenseOnly,validatePayload} from "../core.js";
const sourcePath=process.env.REVIEW_SOURCE;
if(!sourcePath)throw new Error("Set REVIEW_SOURCE to private authoritative contract export");
const bundle=JSON.parse(await readFile(sourcePath,"utf8"));
for(const p of bundle.payloads)validatePayload(p);
const controls={W:[6387302,2034525.91,1958207,76318.91],CPR:[7159659,2536482.50,1169100,1367382.50]};
for(const tenant of Object.keys(controls)){
 const p=selectPayload(bundle,tenant,"2026-09");assert.equal(p.metadata.source_layer,"CLOSED_IMMUTABLE");
 assert.deepEqual(["net_sales","result_without_compensation","cogs","result_after_cogs"].map(k=>p.financial_economics[k]),controls[tenant]);
 for(const key of ["sales","returns","net_sales","marketplace_expenses","result_without_compensation","cogs","result_after_cogs"]){
  assert.equal(p.sku_rows.reduce((sum,r)=>sum+Math.round(r[key]*100),0),Math.round(p.financial_economics[key]*100),tenant+" SKU reconciliation "+key);
 }
 const before=JSON.stringify(p.sku_rows);
 const all=filterRows(p.sku_rows),negative=filterRows(p.sku_rows,{focus:"negative"}),only=filterRows(p.sku_rows,{focus:"expense-only"});
 assert.equal(all.length,p.sku_rows.length);assert.equal(JSON.stringify(p.sku_rows),before);
 assert.ok(negative.every(r=>r.result_after_cogs<0));assert.ok(only.every(expenseOnly));assert.equal(only.length,p.sku_rows.filter(expenseOnly).length);
 assert.ok(all.every((r,i)=>!i||all[i-1].result_after_cogs>=r.result_after_cogs));
 assert.equal(selectPayload(bundle,tenant,"2026-09","WB"),null);
 assert.equal(selectPayload(bundle,tenant,"2026-09","YANDEX"),null);
 const live=selectPayload(bundle,tenant,"2026-10");
 assert.equal(live.metadata.source_layer,"SHADOW_CURRENT");assert.equal(live.metadata.marketplace_close_status,"LIVE");assert.equal(live.metadata.data_available,true);
 assert.ok(Object.values(live.financial_economics).every(v=>v===null));assert.equal(live.sku_rows.length,0);
}
assert.equal(money(null),"—");assert.equal(rate(null,1),null);assert.equal(rate(1,0),null);
assert.equal(money(2034525.91),"2 034 525,91 ₽");
const access=JSON.parse(await readFile(process.env.REVIEW_ACCESS || new URL("../../../../../phase5/review-access.private.json",import.meta.url),"utf8"));
const envelope=JSON.parse(await readFile(new URL("../review.enc.json",import.meta.url),"utf8"));
const encrypted=Buffer.from(envelope.ciphertext,"base64url"),key=Buffer.from(access.fragment.split("=")[1],"base64url");
function decrypt(k){const d=createDecipheriv("aes-256-gcm",k,Buffer.from(envelope.iv,"base64url"));d.setAuthTag(encrypted.subarray(-16));return Buffer.concat([d.update(encrypted.subarray(0,-16)),d.final()]);}
assert.deepEqual(JSON.parse(decrypt(key)),bundle);
assert.throws(()=>decrypt(Buffer.alloc(32)));
async function verifyPublicFiles(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=new URL(entry.name+(entry.isDirectory()?"/":""),directory);
  if(entry.isDirectory()){await verifyPublicFiles(path);continue;}
  assert.ok(!entry.name.includes(".private"),"Private artifact in public frontend");
  assert.ok(!(await readFile(path,"utf8")).includes(access.fragment.split("=")[1]),"Decryption key found in public frontend");
 }
}
await verifyPublicFiles(new URL("../",import.meta.url));
const app=await readFile(new URL("../app.js",import.meta.url),"utf8");
assert.doesNotMatch(app,/signInWithPassword|authForm|fixtures|monthly-data-v1|webhook|service.role/);
console.log("PASS: full W/CPR contract controls, SKU reconciliation, expense-only retention, null semantics, sort/filter, encryption and wrong-key rejection.");

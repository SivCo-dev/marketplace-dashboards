import assert from "node:assert/strict";
import {adaptScope,createScopeLoader} from "../live-v2.js";

const scope=(tenant="W",month="2026-09",marketplace="ALL")=>({
 contract_version:"monthly-scope-v2.2",
 metadata:{tenant_id:tenant,month:`${month}-01`,marketplace,revision:1},
 period_state:{status:"ACCEPTED_CLOSED",closed_at:"2026-10-03T17:18:58Z"},
 totals:{sales:120,returns:-20,net_sales:100,commission:-20,logistics:-5,storage:0,promotion:-5,other:0,compensation:2,result:72},
 business_economics:{cogs:30,cost_status:"COMPLETE",business_expenses:3,profit_after_business:39},
 account_coverage:[{marketplace:"OZON",sku_count:1}],
 sku:[{sku:"sku-1",article:"A",account_id:"ozon_w",marketplace:"OZON",sales:120,returns:-20,net_sales:100,sold_units:2,economic_units:2,commission:-20,logistics:-5,promotion:-5,final_without_compensation:70,final_with_compensation:72,net_compensation_amount:2,accepted_unit_cost:15,accepted_display_cogs:30,allocated_business_expenses:3,profit_after_business:39}]
});

const payload=adaptScope(scope());
assert.equal(payload.source_contract_version,"monthly-scope-v2.2");
assert.equal(payload.metadata.source_layer,"ACCEPTED_MONTH_SCOPE_V2_2");
assert.equal(payload.financial_economics.marketplace_expenses,-30);
assert.equal(payload.financial_economics.result_without_compensation,70);
assert.equal(payload.financial_economics.result_after_cogs,42);
assert.equal(payload.financial_economics.final_business_result,39);
assert.equal(payload.sku_rows[0].result_after_cogs,42);
assert.equal(payload.sku_rows[0].final_business_result,39);

const partial=scope();partial.business_economics.cost_status="PARTIAL";partial.business_economics.cogs=0;partial.sku[0].accepted_display_cogs=null;
const unknown=adaptScope(partial);
assert.equal(unknown.financial_economics.cogs,null);
assert.equal(unknown.financial_economics.result_after_cogs,null);
assert.equal(unknown.sku_rows[0].cogs,null);

const missing=scope("W","2026-10");missing.period_state.status="MISSING";missing.sku=[];
const unavailable=adaptScope(missing);
assert.equal(unavailable.metadata.data_available,false);
assert.equal(unavailable.financial_economics.sales,null);
assert.equal(unavailable.financial_economics.result_without_compensation,null);

const responses={W:scope("W"),CPR:scope("CPR"),ORANGE:null};
const updates=[];
const loader=createScopeLoader({onUpdate:value=>updates.push(structuredClone(value)),fetcher:async url=>{
 const tenant=new URL(url).searchParams.get("tenant");
 return responses[tenant]?{ok:true,json:async()=>({...responses[tenant],metadata:{...responses[tenant].metadata,month:new URL(url).searchParams.get("month")+"-01"}})}:{ok:false,status:500};
}});
await Promise.allSettled([loader.loadTenant("W"),loader.loadTenant("CPR"),loader.loadTenant("ORANGE")]);
assert.equal(loader.bundle.tenant_status.W.status,"ready");
assert.equal(loader.bundle.tenant_status.CPR.status,"ready");
assert.equal(loader.bundle.tenant_status.ORANGE.status,"error");
assert.equal(loader.bundle.payloads.filter(item=>item.metadata.tenant_id==="W").length,4);
assert.ok(updates.some(update=>update.tenant_status.W.status==="ready"&&update.tenant_status.ORANGE.status!=="ready"));
console.log("PASS: monthly-scope-v2.2 mapping, NULL cost semantics and tenant failure isolation");

// Same canonical SKU across cabinets/markets is one product; unknown COGS stays unknown.
const combined=scope();
combined.sku=[
 {...combined.sku[0],sku:'OP-70TUW+RAR',article:'OP-70TUW+RAR',sales:813776,sold_units:7,economic_units:7},
 {...combined.sku[0],sku:'OP-70TUW+RAR',article:'OP-70TUW+RAR',account_id:'yandex_orange_ipt',marketplace:'YANDEX',sales:494340,sold_units:6,economic_units:6,accepted_display_cogs:null},
 {...combined.sku[0],sku:'OP-70TUW+RAR',article:'OP-70TUW+RAR',account_id:'ozon_orange_psk',sales:68919,sold_units:1,economic_units:1},
 {...combined.sku[0],sku:'OTHER',article:'OP-70TUW+RAR',sales:1}
];
const grouped=adaptScope(combined).sku_rows;
assert.equal(grouped.length,2,'Different canonical SKU must not merge merely by displayed article');
const canonical=grouped.find(row=>row.canonical_sku==='OP-70TUW+RAR');
assert.equal(canonical.sales,1377035);
assert.equal(canonical.sale_units_display,14);
assert.equal(canonical.source_rows.length,3);
assert.equal(canonical.cogs,null);
assert.equal(canonical.result_after_cogs,null);
assert.equal(canonical.marketplace,'ALL');
const ozonOnly=adaptScope({...combined,sku:combined.sku.filter(row=>row.marketplace==='OZON')}).sku_rows.find(row=>row.canonical_sku==='OP-70TUW+RAR');
assert.equal(ozonOnly.sale_units_display,8);
assert.equal(ozonOnly.sales,882695);
assert.equal(ozonOnly.cogs,60);
assert.equal(ozonOnly.unit_cost,7.5);
console.log('PASS: canonical aggregation, marketplace scope, distinct identity and partial cost');

import {validatePayload} from "./core.js?v=20261002orange";
const BASE="https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/monthly-data-v1";
const TENANTS=["W","CPR","ORANGE"];
const MONTHS=["2026-07","2026-08","2026-09","2026-10"];
const MARKETS=["OZON","WB","YANDEX"];

const n=v=>Number(v||0);
const ym=v=>String(v||"").slice(0,7);

function costMap(d){
 const m=new Map();
 for(const x of d.unit_costs||[]) m.set(String(x.sku||x.canonical_sku||x.article||""),Number(x.unit_cost||x.cost||0)||null);
 return m;
}
function skuRow(x,costs){
 const commission=n(x.commission)+n(x.allocated_commission);
 const logistics=n(x.logistics)+n(x.allocated_logistics);
 const storage=n(x.storage)+n(x.allocated_storage);
 const promotion=n(x.promotion)+n(x.allocated_promotion);
 const other=n(x.other)+n(x.allocated_other);
 const expenses=commission+logistics+storage+promotion+other;
 const comp=n(x.net_compensation_amount??x.compensation_amount??x.compensation);
 const result=n(x.final_without_compensation ?? x.direct_net_received ?? (n(x.net_sales)+expenses));
 const netUnits=n(x.economic_units??x.sold_units);
 const unitCost=costs.get(String(x.sku||x.article||""))??null;
 const cogs=unitCost==null?null:Math.max(netUnits,0)*unitCost;
 return {
   product_id:x.product_id??null, canonical_sku:String(x.sku||x.article||""),
   article:x.article||x.sku||"", product_name:x.product_name||x.article||x.sku||"",
   category_id:x.master_category||null, category_name:x.master_category||null,
   sales:n(x.sales), returns:n(x.returns), net_sales:n(x.net_sales),
   financial_sale_units:n(x.sale_operations??x.sold_units), financial_return_units:n(x.return_operations??0),
   financial_net_units:netUnits, sale_units_display:n(x.sale_operations??x.sold_units),
   return_writeoff_units:n(x.return_operations??0)+n(x.disposal_units??0),
   physical_returned_units:n(x.return_operations??0), written_off_units:n(x.disposal_units??0),
   compensated_units:n(x.compensated_units??0),
   commission, logistics, storage, promotion, other,
   marketplace_expenses:expenses, result_without_compensation:result,
   compensation:comp, unit_cost:unitCost, cogs,
   result_after_cogs:cogs==null?null:result+comp-cogs,
   cost_status:cogs==null?"UNAVAILABLE":"COMPLETE",
   compensation_status:"COMPLETE",
   expense_structure:{
     direct:{commission:n(x.commission),logistics:n(x.logistics),storage:n(x.storage),promotion:n(x.promotion),other:n(x.other)},
     allocated_shared:{commission:n(x.allocated_commission),logistics:n(x.allocated_logistics),storage:n(x.allocated_storage),promotion:n(x.allocated_promotion),other:n(x.allocated_other)}
   }
 };
}
function payloadFor(d,tenant,month,market){
 const costs=costMap(d);
 const rows=(d.sku||[]).filter(x=>ym(x.month)===month && String(x.marketplace||"OZON").toUpperCase()===market).map(x=>skuRow(x,costs));
 if(!rows.length)return null;
 const sum=k=>rows.reduce((a,x)=>a+n(x[k]),0);
 const sales=sum("sales"), returns=sum("returns"), net_sales=sum("net_sales"), commission=sum("commission"), logistics=sum("logistics"), storage=sum("storage"), promotion=sum("promotion"), other=sum("other"), compensation=sum("compensation");
 const marketplace_expenses=commission+logistics+storage+promotion+other;
 const result_without_compensation=net_sales+marketplace_expenses;
 const cogs=rows.every(r=>r.cogs!=null)?sum("cogs"):null;
 return {
   contract_version:"monthly-api-v2.0",
   metadata:{tenant_id:tenant,account_id:null,marketplace:market,month,marketplace_close_status:month==="2026-10"?"LIVE":"CLOSED",base_close_revision:1,overall_readiness:month==="2026-10"?"LIVE":"BASE_CLOSED",compensation_status:"COMPLETE",cost_status:cogs==null?"UNAVAILABLE":"COMPLETE",business_expense_status:"NOT_APPLICABLE",data_available:true,source_layer:"MONTHLY_V1_LIVE",finance_data_status:month==="2026-10"?"LIVE":"CLOSED",refreshed_at:d.meta?.generated_at||new Date().toISOString()},
   financial_economics:{sales,returns,net_sales,commission,logistics,storage,promotion,other,marketplace_expenses,result_without_compensation,compensation,result_with_compensation:result_without_compensation+compensation,cogs,result_after_cogs:cogs==null?null:result_without_compensation+compensation-cogs,business_expenses:0,final_business_result:null},
   units:{financial_sale_units:rows.reduce((a,x)=>a+n(x.financial_sale_units),0),financial_return_units:rows.reduce((a,x)=>a+n(x.financial_return_units),0),financial_net_units:rows.reduce((a,x)=>a+n(x.financial_net_units),0),ordered_units:null,delivered_units:null,returned_units:null,written_off_units:rows.reduce((a,x)=>a+n(x.written_off_units),0),operational_metrics_status:"PARTIAL"},
   expense_structure:{total:{commission,logistics,storage,promotion,other},direct:{commission:rows.reduce((a,x)=>a+n(x.expense_structure.direct.commission),0),logistics:rows.reduce((a,x)=>a+n(x.expense_structure.direct.logistics),0),storage:rows.reduce((a,x)=>a+n(x.expense_structure.direct.storage),0),promotion:rows.reduce((a,x)=>a+n(x.expense_structure.direct.promotion),0),other:rows.reduce((a,x)=>a+n(x.expense_structure.direct.other),0)},allocated_shared:{commission:rows.reduce((a,x)=>a+n(x.expense_structure.allocated_shared.commission),0),logistics:rows.reduce((a,x)=>a+n(x.expense_structure.allocated_shared.logistics),0),storage:rows.reduce((a,x)=>a+n(x.expense_structure.allocated_shared.storage),0),promotion:rows.reduce((a,x)=>a+n(x.expense_structure.allocated_shared.promotion),0),other:rows.reduce((a,x)=>a+n(x.expense_structure.allocated_shared.other),0)}},
   sku_rows:rows,warnings:[]
 };
}
function mergeAll(parts,tenant,month){
 if(!parts.length)return null;
 const rows=new Map();
 for(const p of parts)for(const r of p.sku_rows){
   const k=String(r.canonical_sku); const x=rows.get(k);
   if(!x) rows.set(k,{...r});
   else for(const key of ["sales","returns","net_sales","financial_sale_units","financial_return_units","financial_net_units","return_writeoff_units","physical_returned_units","written_off_units","compensated_units","commission","logistics","storage","promotion","other","marketplace_expenses","result_without_compensation","compensation","cogs","result_after_cogs"]) {
     if(x[key]==null||r[key]==null){if(["cogs","result_after_cogs"].includes(key))x[key]=null; else x[key]=n(x[key])+n(r[key]);}
     else x[key]=n(x[key])+n(r[key]);
   }
 }
 const sku_rows=[...rows.values()];
 const sum=k=>parts.reduce((a,p)=>a+n(p.financial_economics[k]),0);
 const cogs=parts.every(p=>p.financial_economics.cogs!=null)?sum("cogs"):null;
 return {contract_version:"monthly-api-v2.0",metadata:{...parts[0].metadata,tenant_id:tenant,marketplace:"ALL",month,data_available:true,source_layer:"MONTHLY_V1_LIVE"},financial_economics:{sales:sum("sales"),returns:sum("returns"),net_sales:sum("net_sales"),commission:sum("commission"),logistics:sum("logistics"),storage:sum("storage"),promotion:sum("promotion"),other:sum("other"),marketplace_expenses:sum("marketplace_expenses"),result_without_compensation:sum("result_without_compensation"),compensation:sum("compensation"),result_with_compensation:sum("result_with_compensation"),cogs,result_after_cogs:cogs==null?null:sum("result_after_cogs"),business_expenses:0,final_business_result:null},units:{financial_sale_units:parts.reduce((a,p)=>a+n(p.units.financial_sale_units),0),financial_return_units:parts.reduce((a,p)=>a+n(p.units.financial_return_units),0),financial_net_units:parts.reduce((a,p)=>a+n(p.units.financial_net_units),0),ordered_units:null,delivered_units:null,returned_units:null,written_off_units:parts.reduce((a,p)=>a+n(p.units.written_off_units),0),operational_metrics_status:"PARTIAL"},expense_structure:{total:{commission:sum("commission"),logistics:sum("logistics"),storage:sum("storage"),promotion:sum("promotion"),other:sum("other")},direct:{commission:parts.reduce((a,p)=>a+n(p.expense_structure.direct.commission),0),logistics:parts.reduce((a,p)=>a+n(p.expense_structure.direct.logistics),0),storage:parts.reduce((a,p)=>a+n(p.expense_structure.direct.storage),0),promotion:parts.reduce((a,p)=>a+n(p.expense_structure.direct.promotion),0),other:parts.reduce((a,p)=>a+n(p.expense_structure.direct.other),0)},allocated_shared:{commission:parts.reduce((a,p)=>a+n(p.expense_structure.allocated_shared.commission),0),logistics:parts.reduce((a,p)=>a+n(p.expense_structure.allocated_shared.logistics),0),storage:parts.reduce((a,p)=>a+n(p.expense_structure.allocated_shared.storage),0),promotion:parts.reduce((a,p)=>a+n(p.expense_structure.allocated_shared.promotion),0),other:parts.reduce((a,p)=>a+n(p.expense_structure.allocated_shared.other),0)}},sku_rows,warnings:[]};
}
export async function loadLiveBundle({onUpdate=()=>{},fetcher=fetch,timeoutMs=45000}={}){
 const bundle={exported_at:null,payloads:[],tenant_status:Object.fromEntries(TENANTS.map(tenant=>[tenant,{status:"loading"}]))};
 onUpdate(bundle);
 await Promise.allSettled(TENANTS.map(async tenant=>{
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),timeoutMs);
   let payloads=[];
   let status;
   try{
     const r=await fetcher(BASE+"?tenant="+encodeURIComponent(tenant),{cache:"no-store",signal:controller.signal});
     if(!r.ok)throw new Error("Ошибка загрузки "+tenant+": "+r.status);
     const d=await r.json();
     if(!d||!Array.isArray(d.sku))throw new Error("Некорректный ответ "+tenant);
     for(const month of MONTHS){
       const parts=[];
       for(const market of MARKETS){const p=payloadFor(d,tenant,month,market);if(p){validatePayload(p);payloads.push(p);parts.push(p);}}
       const all=mergeAll(parts,tenant,month);if(all){validatePayload(all);payloads.push(all);}
     }
     status={status:"ready",refreshed_at:d.meta?.generated_at??new Date().toISOString()};
   }catch(error){
     payloads=[];
     status={status:"error",message:controller.signal.aborted?"Превышено время загрузки "+tenant:String(error.message??error)};
   }finally{
     clearTimeout(timer);
   }
   bundle.payloads.push(...payloads);
   bundle.tenant_status[tenant]=status;
   bundle.exported_at=new Date().toISOString();
   onUpdate(bundle);
 }));
 return bundle;
}

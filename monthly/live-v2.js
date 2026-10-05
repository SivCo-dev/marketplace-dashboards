import {validatePayload} from "./core.js?v=20261003scope1";

const BASE="https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/monthly-data-v2";
const TENANTS=["W","CPR","ORANGE"];
import {MONTHS} from "./config.js?v=20261004periods";
const MARKETS=["ALL","OZON","WB","YANDEX"];
const GROUPS=["commission","logistics","storage","promotion","other"];
const n=value=>Number(value||0);
const nullable=value=>value==null||value===""||!Number.isFinite(Number(value))?null:Number(value);
const scopeKey=(tenant,month,market)=>[tenant,month,market].join("|");

function sum(rows,key){return rows.reduce((total,row)=>total+n(row[key]),0);}
function latestTimestamp(rows,fallback){
 const timestamps=rows.map(row=>row.updated_at).filter(Boolean).sort();
 return timestamps.at(-1)||fallback||null;
}

function adaptRow(row,scope){
 const direct=Object.fromEntries(GROUPS.map(key=>[key,n(row[key])]));
 const allocated=Object.fromEntries(GROUPS.map(key=>[key,n(row[`allocated_${key}`])]));
 const marketplaceExpenses=GROUPS.reduce((total,key)=>total+direct[key]+allocated[key],0);
 const compensation=n(row.net_compensation_amount??row.compensation_amount);
 const resultWithCompensation=nullable(row.final_with_compensation);
 const resultWithoutCompensation=nullable(row.final_without_compensation)??(resultWithCompensation==null?null:resultWithCompensation-compensation);
 const cogs=nullable(row.accepted_display_cogs);
 const economicUnits=n(row.economic_units??row.sold_units);
 const costStatus=economicUnits===0?"NOT_APPLICABLE":cogs==null?"UNAVAILABLE":"COMPLETE";
 const importedReturns=n(row.import_fields?.returned_units??row.returned_units);
 const writeoffs=n(row.disposal_units);
 const operationalUnits=importedReturns+writeoffs;
 return {
  row_id:[row.account_id,row.marketplace,row.sku].join("|"),
  product_id:null,
  canonical_sku:String(row.sku??row.article??""),
  article:row.article??row.sku??"",
  product_name:row.product_name??row.article??row.sku??"",
  cabinet:row.cabinet??row.account_id??null,
  account_id:row.account_id??null,
  marketplace:String(row.marketplace??scope.metadata?.marketplace??"ALL").toUpperCase(),
  category_id:row.master_category??null,
  category_name:row.master_category??null,
  sales:n(row.sales),returns:n(row.returns),net_sales:n(row.net_sales),
  financial_sale_units:n(row.sale_operations??row.sold_units),
  financial_return_units:n(row.return_operations),
  financial_net_units:economicUnits,
  sale_units_display:n(row.sale_operations??row.sold_units)+operationalUnits,
  return_writeoff_units:n(row.return_operations)+operationalUnits,
  physical_returned_units:nullable(row.returned_units),
  written_off_units:n(row.disposal_units),
  compensated_units:n(row.compensated_units),
  ...Object.fromEntries(GROUPS.map(key=>[key,direct[key]+allocated[key]])),
  marketplace_expenses:marketplaceExpenses,
  result_without_compensation:resultWithoutCompensation,
  compensation,
  unit_cost:nullable(row.accepted_unit_cost),
  cogs,
  cost_units:economicUnits,
  result_after_cogs:cogs==null||resultWithCompensation==null?null:resultWithCompensation-cogs,
  business_expenses:n(row.allocated_business_expenses),
  final_business_result:nullable(row.profit_after_business),
  cost_status:costStatus,
  compensation_status:row.import_fields?.compensation_amount!=null?"COMPLETE":scope.period_state?.status==="ACCEPTED_CLOSED"?"COMPLETE":"PENDING",
  expense_structure:{direct,allocated_shared:allocated}
 };
}

// Aggregate only exact canonical identities after account-level economics are calculated.
export function aggregateCanonicalRows(rows){
 const groups=new Map();
 for(const row of rows){
  const key=row.canonical_sku||row.row_id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
 }
 const additive=['sales','returns','net_sales','financial_sale_units','financial_return_units','financial_net_units','sale_units_display','return_writeoff_units','physical_returned_units','written_off_units','compensated_units',...GROUPS,'marketplace_expenses','result_without_compensation','compensation','cogs','cost_units','result_after_cogs','business_expenses','final_business_result'];
 const total=(sources,key)=>sources.some(row=>row[key]==null)?null:sources.reduce((value,row)=>value+row[key],0);
 return [...groups.values()].map(sources=>{
  const row={...sources[0],row_id:sources[0].canonical_sku||sources[0].row_id,source_rows:sources};
  for(const key of additive)row[key]=total(sources,key);
  row.account_id=sources.every(item=>item.account_id===sources[0].account_id)?sources[0].account_id:null;
  row.marketplace=sources.every(item=>item.marketplace===sources[0].marketplace)?sources[0].marketplace:'ALL';
  row.unit_cost=row.cogs==null?null:row.cost_units>0?row.cogs/row.cost_units:sources.every(item=>item.unit_cost===sources[0].unit_cost)?sources[0].unit_cost:null;
  row.cost_status=sources.every(item=>item.cost_status==='NOT_APPLICABLE')?'NOT_APPLICABLE':sources.every(item=>item.cost_status==='COMPLETE'||item.cost_status==='NOT_APPLICABLE')?'COMPLETE':'UNAVAILABLE';
  row.expense_structure=Object.fromEntries(['direct','allocated_shared'].map(kind=>[kind,Object.fromEntries(GROUPS.map(key=>[key,sources.reduce((value,item)=>value+n(item.expense_structure[kind][key]),0)]))]));
  return row;
 });
}

export function adaptScope(scope){
 if(scope?.contract_version!=="monthly-scope-v2.2")throw new Error("Неподдерживаемый контракт monthly scope");
 const sourceRows=Array.isArray(scope.sku)?scope.sku:[];
 const rows=aggregateCanonicalRows(sourceRows.map(row=>adaptRow(row,scope)));
 const totals=scope.totals??{};
 const business=scope.business_economics??{};
 const status=scope.period_state?.status??"MISSING";
 const hasData=status!=="MISSING"&&sourceRows.length>0;
 const marketplace=String(scope.metadata?.marketplace??"ALL").toUpperCase();
 const completeCosts=business.cost_status==="COMPLETE";
 const cogs=completeCosts?nullable(business.cogs):null;
 const resultWithCompensation=nullable(totals.result);
 const compensation=n(totals.compensation);
 const resultWithoutCompensation=resultWithCompensation==null?null:resultWithCompensation-compensation;
 const availableMarkets=[...new Set((scope.account_coverage??scope.accounts??[]).filter(account=>n(account.sku_count)>0).map(account=>String(account.marketplace).toUpperCase()))];
 const totalByGroup=Object.fromEntries(GROUPS.map(key=>[key,n(totals[key])]));
 const direct=Object.fromEntries(GROUPS.map(key=>[key,rows.reduce((total,row)=>total+n(row.expense_structure.direct[key]),0)]));
 const allocated=Object.fromEntries(GROUPS.map(key=>[key,rows.reduce((total,row)=>total+n(row.expense_structure.allocated_shared[key]),0)]));
 const month=String(scope.metadata?.month??"").slice(0,7);
 const closeState=status==="ACCEPTED_CLOSED"?"CLOSED":status==="PRELIMINARY"?"LIVE":"MISSING";
 const payload={
  contract_version:"monthly-api-v2.0",
  source_contract_version:scope.contract_version,
  metadata:{
   tenant_id:String(scope.metadata?.tenant_id??"").toUpperCase(),
   account_id:scope.metadata?.account_id??null,
   marketplace,month,
   marketplace_close_status:closeState,
   base_close_revision:scope.metadata?.revision??null,
   overall_readiness:status,
   compensation_status:sourceRows.some(r=>r.import_fields?.compensation_amount!=null)?(sourceRows.every(r=>r.import_fields?.compensation_amount!=null||r.marketplace!=="OZON")?"COMPLETE":"PARTIAL"):status==="ACCEPTED_CLOSED"?"COMPLETE":status==="PRELIMINARY"?"PENDING":"UNAVAILABLE",
   cost_status:business.cost_status??"MISSING",
   business_expense_status:sourceRows.length?"COMPLETE":"UNAVAILABLE",
   data_available:hasData,
   source_layer:"ACCEPTED_MONTH_SCOPE_V2_2",
   finance_data_status:status,
   refreshed_at:latestTimestamp(sourceRows,scope.period_state?.closed_at),
   available_markets:availableMarkets,
   account_coverage:scope.account_coverage??scope.accounts??[]
  },
  financial_economics:{
   sales:hasData?n(totals.sales):null,returns:hasData?n(totals.returns):null,net_sales:hasData?n(totals.net_sales):null,
   ...Object.fromEntries(GROUPS.map(key=>[key,hasData?totalByGroup[key]:null])),
   marketplace_expenses:hasData?GROUPS.reduce((total,key)=>total+totalByGroup[key],0):null,
   result_without_compensation:hasData?resultWithoutCompensation:null,
   compensation:hasData?compensation:null,result_with_compensation:hasData?resultWithCompensation:null,
   cogs:hasData?cogs:null,
   result_after_cogs:hasData&&cogs!=null&&resultWithCompensation!=null?resultWithCompensation-cogs:null,
   business_expenses:hasData?nullable(business.business_expenses):null,
   final_business_result:hasData?nullable(business.profit_after_business):null
  },
  units:{
   financial_sale_units:hasData?(sum(sourceRows,"sale_operations")||sum(sourceRows,"sold_units")):null,
   financial_return_units:hasData?sum(sourceRows,"return_operations"):null,
   financial_net_units:hasData?sum(sourceRows,"economic_units"):null,
   ordered_units:null,delivered_units:null,returned_units:null,
   written_off_units:hasData?sum(sourceRows,"disposal_units"):null,
   operational_metrics_status:hasData?"PARTIAL":"UNAVAILABLE"
  },
  expense_structure:{total:totalByGroup,direct,allocated_shared:allocated},
  sku_rows:rows,
  warnings:status==="MISSING"?["MONTHLY_SCOPE_MISSING"]:[]
 };
 return validatePayload(payload);
}

export function createScopeLoader({onUpdate=()=>{},fetcher=fetch,timeoutMs=45000,tenantIds=TENANTS}={}){
 const allowedTenants=[...new Set(tenantIds.filter(id=>/^[A-Z0-9_-]{1,32}$/.test(id)))];
 const bundle={exported_at:null,payloads:[],tenant_status:Object.fromEntries(allowedTenants.map(tenant=>[tenant,{status:"idle"}])),scope_status:{}};
 const inflight=new Map();
 const publish=()=>{bundle.exported_at=new Date().toISOString();onUpdate(bundle);};
 const put=payload=>{bundle.payloads=bundle.payloads.filter(item=>scopeKey(item.metadata.tenant_id,item.metadata.month,item.metadata.marketplace)!==scopeKey(payload.metadata.tenant_id,payload.metadata.month,payload.metadata.marketplace));bundle.payloads.push(payload);};
 async function loadScope(tenant,month,market="ALL"){
  tenant=String(tenant).toUpperCase();market=String(market).toUpperCase();
  if(!allowedTenants.includes(tenant)||!MONTHS.includes(month)||!MARKETS.includes(market))throw new Error("Недопустимый monthly scope");
  const key=scopeKey(tenant,month,market);
  const existing=bundle.payloads.find(item=>scopeKey(item.metadata.tenant_id,item.metadata.month,item.metadata.marketplace)===key);
  if(existing&&!(existing.metadata.marketplace_close_status==="LIVE"&&Date.now()-(existing.metadata.loaded_at_ms||0)>300000))return existing;
  if(inflight.has(key))return inflight.get(key);
  const promise=(async()=>{
   bundle.scope_status[key]={status:"loading"};publish();
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
   try{
    const params=new URLSearchParams({tenant,month,marketplace:market});
    const response=await fetcher(`${BASE}?${params}`,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`Ошибка загрузки ${tenant}/${market}: ${response.status}`);
    const scope=await response.json();
    const payload=adaptScope(scope);payload.metadata.loaded_at_ms=Date.now();put(payload);
    bundle.scope_status[key]={status:"ready",refreshed_at:payload.metadata.refreshed_at};publish();return payload;
   }catch(error){
    const message=controller.signal.aborted?`Превышено время загрузки ${tenant}/${market}`:String(error?.message??error);
    bundle.scope_status[key]={status:"error",message};publish();throw error;
   }finally{clearTimeout(timer);inflight.delete(key);}
  })();
  inflight.set(key,promise);return promise;
 }
 async function loadTenant(tenant,months=MONTHS){
  tenant=String(tenant).toUpperCase();
  if(!allowedTenants.includes(tenant))throw new Error("Недопустимый tenant");
  months=[...new Set(months)].filter(month=>MONTHS.includes(month));
  if(!months.length)return bundle;
  const missing=months.filter(month=>!bundle.payloads.some(item=>scopeKey(item.metadata.tenant_id,item.metadata.month,item.metadata.marketplace)===scopeKey(tenant,month,"ALL")));
  if(!missing.length){await Promise.all(months.map(month=>loadScope(tenant,month,"ALL")));return bundle;}
  bundle.tenant_status[tenant]={status:"loading"};publish();
  const results=await Promise.allSettled(missing.map(month=>loadScope(tenant,month,"ALL")));
  const ready=results.filter(result=>result.status==="fulfilled").map(result=>result.value);
  const totalReady=months.filter(month=>bundle.payloads.some(item=>scopeKey(item.metadata.tenant_id,item.metadata.month,item.metadata.marketplace)===scopeKey(tenant,month,"ALL"))).length;
  if(!totalReady){
   bundle.tenant_status[tenant]={status:"error",message:`Данные ${tenant} временно недоступны`};
  }else{
   bundle.tenant_status[tenant]={status:"ready",refreshed_at:latestTimestamp(ready.map(payload=>({updated_at:payload.metadata.refreshed_at})),bundle.exported_at),partial:totalReady!==months.length};
  }
  publish();return bundle;
 }
 return {bundle,loadScope,loadTenant};
}

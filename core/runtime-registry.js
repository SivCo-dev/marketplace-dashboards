const ENDPOINT='https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev23';

export async function loadReportRegistry(fetcher=fetch){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetcher(ENDPOINT+'?view=registry',{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw new Error('Registry HTTP '+response.status);
  const registry=await response.json();
  if(!Array.isArray(registry?.tenants))throw new Error('Invalid report registry');
  return registry.tenants.filter(t=>/^[A-Z0-9_-]{1,32}$/.test(t.tenant_id));
 }finally{clearTimeout(timer)}
}

export function dailyConfigsFromRegistry(rows,fallback={}){
 const result={};
 for(const row of rows.filter(t=>t.daily_available)){
  const old=fallback[row.tenant_id]||{};
  result[row.tenant_id]={...old,tenant_id:row.tenant_id,slug:row.tenant_id.toLowerCase(),
   display_name:row.display_name,data_url:ENDPOINT+'?tenant='+encodeURIComponent(row.tenant_id),
   accounts:row.accounts||[],sku_aliases:old.sku_aliases||[],theme:old.theme||{accent:'#355846'}};
 }
 return result;
}

// Ambiguous rows never inherit an arbitrary first account from the marketplace.
export function resolveRowAccount(row,accounts=[]){
 const marketplace=String(row.marketplace||row.source_marketplace||'').toUpperCase();
 if(row.account_id){
  const exact=accounts.find(a=>a.account_id===row.account_id);
  if(exact&&(!marketplace||exact.marketplace===marketplace))return exact;
  return {};
 }
 let candidates=accounts.filter(a=>(!marketplace||a.marketplace===marketplace)&&(!row.cabinet||a.cabinet===row.cabinet));
 return candidates.length===1?candidates[0]:{};
}

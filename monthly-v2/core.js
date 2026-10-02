export const numberOrNull = v => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
export const escapeHtml = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
export const money = (v,currency=true) => numberOrNull(v) == null ? "—" : Number(v).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2}) + (currency ? " ₽" : "");
export const units = v => numberOrNull(v) == null ? "—" : Number(v).toLocaleString("ru-RU");
export const rate = (v,base) => numberOrNull(v) == null || numberOrNull(base) == null || Number(base) <= 0 ? null : Math.abs(Number(v))/Number(base)*100;
export const pct = v => numberOrNull(v) == null ? "—" : Number(v).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%";
export const monthLabel = v => new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(v+"-01T00:00:00Z"));
export const shortMonth = v => new Intl.DateTimeFormat("ru-RU",{month:"short",timeZone:"UTC"}).format(new Date(v+"-01T00:00:00Z"));
export function validatePayload(p) {
 if(p?.contract_version!=="monthly-api-v2.0"||!p.metadata||!p.financial_economics||!p.expense_structure||!p.units||!Array.isArray(p.sku_rows)) throw new Error("Неподдерживаемый контракт данных"); return p;
}
export function selectPayload(bundle,tenant,month,marketplace="ALL") {
 const exact=bundle?.payloads.find(p=>p.metadata.tenant_id===tenant&&p.metadata.month===month&&p.metadata.marketplace===marketplace);
 if(exact)return exact;
 if(marketplace==="ALL")return bundle?.payloads.find(p=>p.metadata.tenant_id===tenant&&p.metadata.month===month&&p.metadata.marketplace==="OZON")??null;
 return null;
}
export const expenseOnly = r => numberOrNull(r.sales)===0&&numberOrNull(r.returns)===0&&numberOrNull(r.marketplace_expenses)!=null&&Number(r.marketplace_expenses)!==0;
export function filterRows(rows,{search="",category="",focus="all",sort="result_desc"}={}) {
 const needle=search.trim().toLowerCase();
 const result=rows.filter(r=>(!needle||[r.article,r.canonical_sku,r.product_name].some(v=>String(v??"").toLowerCase().includes(needle)))&&(!category||String(r.category_id??r.category??"")===category)&&(focus!=="negative"||(numberOrNull(r.result_after_cogs)!=null&&Number(r.result_after_cogs)<0))&&(focus!=="expense-only"||expenseOnly(r)));
 const key=sort.startsWith("sales")?"sales":sort.startsWith("expenses")?"marketplace_expenses":"result_after_cogs",asc=sort.endsWith("asc");
 const resultValue=r=>numberOrNull(r.result_after_cogs)??(numberOrNull(r.result_without_compensation)==null?null:Number(r.result_without_compensation)+(numberOrNull(r.compensation)??0));
 return result.sort((a,b)=>{let av=key==="result_after_cogs"?resultValue(a):numberOrNull(a[key]),bv=key==="result_after_cogs"?resultValue(b):numberOrNull(b[key]);if(av==null)return bv==null?String(a.canonical_sku).localeCompare(String(b.canonical_sku)):1;if(bv==null)return -1;if(key==="marketplace_expenses"){av=Math.abs(av);bv=Math.abs(bv);}return (asc?av-bv:bv-av)||String(a.canonical_sku).localeCompare(String(b.canonical_sku));});
}
export const monthsBefore = month => {const[y,m]=month.split("-").map(Number);return Array.from({length:4},(_,i)=>new Date(Date.UTC(y,m-4+i,1)).toISOString().slice(0,7));};

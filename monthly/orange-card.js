import {escapeHtml as e,numberOrNull as num} from "./core.js?v=20261002orange";

// Orange product card (monthly). Pure functions: model building and HTML rendering.
// Rule: no COGS for Orange. "Получаем / шт" = result after all marketplace expenses incl. compensations / net units.
const GROUPS=[["commission","Комиссия"],["logistics","Логистика"],["promotion","Реклама"],["storage","Хранение"],["other","Прочие"]];
const SUMMED=["sales","returns","net_sales","financial_net_units","result_without_compensation","compensation","compensation_in","decompensation_in","compensated_units"];
const MP={OZON:"Ozon",YANDEX:"Яндекс Маркет",WB:"Wildberries"};
const MP_SHORT={OZON:"Ozon",YANDEX:"Яндекс",WB:"WB"};
const n0=v=>num(v)??0;
const fmt=v=>Math.round(Math.abs(v)).toLocaleString("ru-RU");
export const rub=v=>num(v)==null?"—":(Number(v)<-0.5?"−":"")+fmt(Number(v));
const rubS=v=>num(v)==null?"—":(Number(v)>0.5?"+":Number(v)<-0.5?"−":"")+fmt(Number(v));
const pcs=v=>num(v)==null?"—":Math.round(Number(v)).toLocaleString("ru-RU");
const p1=v=>num(v)==null?"—":Number(v).toLocaleString("ru-RU",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
const sum=(rows,fn)=>rows.reduce((t,r)=>t+n0(fn(r)),0);
const MONTH_FULL=["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"];
const MONTH_SHORT=["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
const mLong=m=>{const[y,k]=m.split("-").map(Number);return MONTH_FULL[k-1][0].toUpperCase()+MONTH_FULL[k-1].slice(1)+" "+y;};
const mShort=m=>MONTH_SHORT[Number(m.slice(5,7))-1];

export function aggregate(sources){
 if(!sources?.length)return null;
 const a={count:sources.length};
 for(const k of SUMMED)a[k]=sum(sources,r=>r[k]);
 a.direct={};a.shared={};a.cost={};
 for(const[g]of GROUPS){a.direct[g]=-sum(sources,r=>r.expense_structure?.direct?.[g]);a.shared[g]=-sum(sources,r=>r.expense_structure?.allocated_shared?.[g]);a.cost[g]=a.direct[g]+a.shared[g];}
 a.direct_total=GROUPS.reduce((t,[g])=>t+a.direct[g],0);a.shared_total=GROUPS.reduce((t,[g])=>t+a.shared[g],0);
 a.cost_total=a.direct_total+a.shared_total;
 a.units=a.financial_net_units;
 a.result=a.result_without_compensation+a.compensation;
 a.after_direct=a.net_sales-a.direct_total;
 return a;
}
const per=(v,u)=>u>0?v/u:null;

export function buildModel({sku,month,compareMonth,months,getPayload,extras,market,cabinet}){
 const slice=m=>{
  const payload=getPayload(m);
  const row=payload?.sku_rows?.find(r=>String(r.canonical_sku)===String(sku));
  const all=row?(row.source_rows??[row]):[];
  const filtered=all.filter(r=>(market==="ALL"||r.marketplace===market)&&(cabinet==="ALL"||r.account_id===cabinet));
  return {payload,row,all,sources:filtered,agg:aggregate(filtered),closed:payload?.metadata?.marketplace_close_status==="CLOSED",has:Boolean(payload)};
 };
 const cur=slice(month),prev=compareMonth?slice(compareMonth):null;
 const history=months.map(m=>({month:m,...slice(m)}));
 const cabinets=[];const seen=new Set();
 for(const r of cur.all)if(!seen.has(r.account_id)){seen.add(r.account_id);cabinets.push({id:r.account_id,marketplace:r.marketplace,label:(MP_SHORT[r.marketplace]??r.marketplace)+" · "+(r.cabinet??r.account_id)});}
 const markets=[...new Set(cur.all.map(r=>r.marketplace))];
 // operations (sale/return operations) are available for Ozon and Yandex only
 const ops=(m)=>{
  const list=(extras?.ops??[]).filter(o=>o.month===m&&(market==="ALL"||o.marketplace===market)&&(cabinet==="ALL"||o.account_id===cabinet));
  const s=slice(m);
  const covered=s.sources.filter(r=>r.marketplace!=="WB");
  const wb=s.sources.filter(r=>r.marketplace==="WB"&&n0(r.financial_net_units)!==0);
  if(!extras||!covered.length)return null;
  const sale=sum(list,o=>o.sale_ops),ret=sum(list,o=>o.return_ops),netCovered=sum(covered,r=>r.financial_net_units);
  if(Math.abs(sale-ret-netCovered)>0.5)return {mismatch:true};
  return {sale,ret,partial:wb.length>0,wbUnits:sum(wb,r=>r.financial_net_units)};
 };
 const orders=(m)=>{
  if(!extras||cabinet!=="ALL"||!(market==="ALL"||market==="OZON"))return null;
  const o=(extras.orders??[]).find(x=>x.month===m);return o?n0(o.units):null;
 };
 const prices=(()=>{
  if(!extras)return null;
  const byProject=new Map();
  for(const h of extras.price_history??[]){if(!byProject.has(h.project))byProject.set(h.project,[]);byProject.get(h.project).push(h);}
  const ozon=[...byProject.entries()].map(([project,rows])=>({label:project.replace("ORANGE:",""),rows,last:rows.at(-1)}));
  const others=(extras.seller_prices??[]).map(p=>({marketplace:p.marketplace,cabinet:p.cabinet,price:p.seller_price,list:p.list_price,at:p.captured_at}));
  return {ozon,others};
 })();
 const stock=(()=>{
  if(!extras)return null;
  const rows=(extras.stock??[]).filter(s=>cabinet==="ALL"||cabinetLabel(cur.all,cabinet)===s.cabinet);
  if(market!=="ALL"&&market!=="OZON")return {pieces:null,days:null,rows:[]};
  // FBS stock is one physical stock mirrored in every Ozon cabinet (identical in 99.7% of multi-cabinet SKUs): count it once.
  const byType=t=>rows.filter(s=>s.stock_type===t).map(s=>n0(s.available));
  const fbs=byType("fbs");
  const pieces=rows.filter(s=>s.stock_type!=="fbs").reduce((t,s)=>t+n0(s.available),0)+(fbs.length?Math.max(...fbs):0);
  const daily=n0(extras.units_30d)/30;
  const days=cabinet==="ALL"&&daily>0?pieces/daily:null;
  return {pieces:rows.length?pieces:null,days,rows};
 })();
 return {sku,month,compareMonth,cur,prev,history,cabinets,markets,ops,orders,prices,stock,market,cabinet};
}
function cabinetLabel(all,accountId){return all.find(r=>r.account_id===accountId)?.cabinet??null;}

function delta(c,p,o={}){
 if(c==null||p==null||!Number.isFinite(c)||!Number.isFinite(p))return "";
 const d=c-p;if(Math.abs(d)<0.5&&!o.keep)return '<span class="oc-pill oc-pn">0</span>';
 const good=(o.inverse?-d:d)>=0;
 const pc=p!==0?d/Math.abs(p)*100:null;
 const txt=(o.pp?(d>0?"+":"−")+Math.abs(d).toLocaleString("ru-RU",{maximumFractionDigits:1,minimumFractionDigits:1})+" п.п.":(o.pcsFmt?(d>0?"+":"−")+Math.round(Math.abs(d)).toLocaleString("ru-RU"):rubS(d))+(!o.noPct&&pc!=null?" ("+(pc>0?"+":"−")+Math.abs(pc).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%)":""));
 return '<span class="oc-pill '+(good?"oc-pu":"oc-pd")+'">'+(o.approx?"≈ ":"")+e(txt)+'</span>';
}
function deltaPct(c,p,o={}){
 if(c==null||p==null||!Number.isFinite(c)||!Number.isFinite(p)||p===0)return "";
 const pc=(c-p)/Math.abs(p)*100;
 return '<span class="oc-pill '+(pc>=0?"oc-pu":"oc-pd")+'">'+(o.approx?"≈ ":"")+(pc>0.05?"+":pc<-0.05?"−":"")+Math.abs(pc).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%</span>";
}
const rate=(v,base)=>base>0?v/base*100:null;

function statusChips(m,payload,extras){
 const chips=[];
 const md=payload?.metadata??{};
 chips.push(m.cur.closed?'<span class="oc-pill oc-pu">Месяц закрыт</span>':'<span class="oc-pill oc-pw">Данные предварительные, месяц не закрыт</span>');
 if(md.compensation_status==="COMPLETE")chips.push('<span class="oc-pill oc-pu">Компенсации применены</span>');
 else if(md.compensation_status==="PARTIAL")chips.push('<span class="oc-pill oc-pw">Компенсации применены частично</span>');
 else chips.push('<span class="oc-pill oc-pn">Компенсации ожидаются</span>');
 chips.push('<span class="oc-pill oc-pn">Физ. возвраты и утиль: нет данных</span>');
 if(m.markets.includes("WB"))chips.push('<span class="oc-pill oc-pn">WB: продажи и возвраты не разделены в источнике</span>');
 return '<div class="oc-chips">'+chips.join("")+'</div>';
}

function filters(m,state){
 const mk=['ALL',...m.markets].map(id=>'<option value="'+id+'"'+(id===m.market?" selected":"")+'>'+(id==="ALL"?"Все":(MP[id]??id))+'</option>').join("");
 const cb=[{id:"ALL",label:"Все кабинеты"},...m.cabinets.filter(c=>m.market==="ALL"||c.marketplace===m.market)].map(c=>'<option value="'+e(c.id)+'"'+(c.id===m.cabinet?" selected":"")+'>'+e(c.label)+'</option>').join("");
 const cmp=state.compareOptions.map(v=>'<option value="'+v+'"'+(v===m.compareMonth?" selected":"")+'>'+mLong(v)+'</option>').join("")||'<option value="">нет месяцев</option>';
 return '<div class="oc-filters"><label>Период<span class="oc-static">'+mLong(m.month)+'</span></label><label>Сравнить с<select data-oc="compare">'+cmp+'</select></label><label>Маркетплейс<select data-oc="market">'+mk+'</select></label><label>Кабинет<select data-oc="cabinet">'+cb+'</select></label></div>';
}

function priceKpi(m){
 if(!m.prices)return '<div class="oc-k"><div class="oc-l">Цена карточки</div><div class="oc-v oc-nd">загрузка…</div></div>';
 const lines=[];
 const pickOzon=m.prices.ozon.filter(p=>p.last);
 if((m.market==="ALL"||m.market==="OZON")&&pickOzon.length){
  const vals=[...new Set(pickOzon.map(p=>Math.round(n0(p.last.cabinet_price))))];
  lines.push(vals.length===1?"Ozon "+rub(vals[0]):"Ozon "+rub(Math.min(...vals))+"–"+rub(Math.max(...vals)));
 }
 for(const mk of ["YANDEX","WB"]){
  if(!(m.market==="ALL"||m.market===mk))continue;
  const list=m.prices.others.filter(p=>p.marketplace===mk&&(m.cabinet==="ALL"||true));
  if(list.length){const vals=[...new Set(list.map(p=>Math.round(n0(p.price))))];lines.push(MP_SHORT[mk]+" "+(vals.length===1?rub(vals[0]):rub(Math.min(...vals))+"–"+rub(Math.max(...vals))));}
 }
 const body=lines.length?lines.map(l=>"<div>"+e(l)+"</div>").join(""):'<div class="oc-nd">нет данных</div>';
 return '<div class="oc-k"><div class="oc-l">Цена карточки</div><div class="oc-sm">'+body+'</div></div>';
}
function sparkPoints(rows,w,h){
 const v=rows.map(r=>n0(r.cabinet_price));if(v.length<2)return "";
 const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1;
 return v.map((x,i)=>(i/(v.length-1)*w).toFixed(1)+","+(h-3-(x-lo)/span*(h-8)).toFixed(1)).join(" ");
}
function priceTile(m,open){
 const series=m.prices?.ozon?.[0]?.rows??[];
 const chg=series.length>1?(n0(series.at(-1).cabinet_price)-n0(series[0].cabinet_price))/n0(series[0].cabinet_price)*100:null;
 return '<button type="button" class="oc-k oc-kb" data-oc-toggle="price" aria-expanded="'+open+'"><div class="oc-l">Цена за 30 дней</div>'+(series.length>1?'<svg width="100%" height="30" viewBox="0 0 80 30" preserveAspectRatio="none"><polyline points="'+sparkPoints(series,80,30)+'" fill="none" stroke="var(--oc-accent)" stroke-width="1.5"/></svg>':'<div class="oc-nd oc-sm">нет истории</div>')+'<div class="oc-l">'+(chg==null?"":'<span class="'+(chg>=0?"oc-up":"oc-dn")+'">'+(chg>0?"+":chg<0?"−":"")+Math.abs(chg).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%</span> · ")+(open?"Свернуть ▴":"Подробнее ▾")+'</div></button>';
}
function pricePanel(m){
 if(!m.prices)return "";
 const out=[];
 const rows=m.prices.ozon;
 if(rows.length){
  const all=rows.flatMap(r=>r.rows.map(x=>n0(x.cabinet_price)));
  const lo=Math.min(...all),hi=Math.max(...all),avg=all.reduce((t,x)=>t+x,0)/all.length;
  const w=300,h=96,dates=[...new Set(rows.flatMap(r=>r.rows.map(x=>String(x.date).slice(0,10))))].sort();
  const x=d=>dates.length>1?dates.indexOf(d)/(dates.length-1)*w:w/2;
  const y=v=>h-14-(v-lo)/((hi-lo)||1)*(h-30);
  const colors=["var(--oc-accent)","var(--oc-pos)","var(--oc-warn)","var(--oc-neg)"];
  const lines=rows.map((r,i)=>'<polyline fill="none" stroke="'+colors[i%4]+'" stroke-width="1.6" points="'+r.rows.map(p=>x(String(p.date).slice(0,10)).toFixed(1)+","+y(n0(p.cabinet_price)).toFixed(1)).join(" ")+'"/>').join("");
  const legend=rows.length>1?'<div class="oc-l">'+rows.map((r,i)=>'<span style="color:'+colors[i%4]+'">● '+e(r.label)+"</span>").join(" · ")+"</div>":"";
  const changes=[];
  for(const r of rows){for(let i=1;i<r.rows.length;i++){const a=n0(r.rows[i-1].cabinet_price),b=n0(r.rows[i].cabinet_price);if(Math.abs(b-a)>0.5)changes.push({d:String(r.rows[i].date).slice(0,10),l:r.label,a,b});}}
  changes.sort((p,q)=>q.d.localeCompare(p.d));
  out.push('<div><p class="oc-h">Цена карточки Ozon · 30 дней</p><svg width="100%" height="'+h+'" viewBox="0 0 '+w+" "+h+'" role="img" aria-label="Цена Ozon за 30 дней">'+lines+'<text x="0" y="'+(h-1)+'" font-size="10" fill="var(--oc-sec)">'+e(dates[0]?.slice(5).split("-").reverse().join("."))+'</text><text x="'+w+'" y="'+(h-1)+'" text-anchor="end" font-size="10" fill="var(--oc-sec)">'+e(dates.at(-1)?.slice(5).split("-").reverse().join("."))+'</text></svg>'+legend+'<div class="oc-l">Минимум '+rub(lo)+" · максимум "+rub(hi)+" · средняя "+rub(avg)+"</div></div>");
  out.push('<div><p class="oc-h">Изменения цены</p>'+(changes.length?'<table class="oc-t"><tr><th>Дата</th>'+(rows.length>1?"<th>Кабинет</th>":"")+'<th>Было</th><th>Стало</th><th>Δ</th></tr>'+changes.slice(0,8).map(c=>'<tr><td>'+c.d.slice(8,10)+"."+c.d.slice(5,7)+"</td>"+(rows.length>1?"<td>"+e(c.l)+"</td>":"")+"<td>"+rub(c.a)+"</td><td>"+rub(c.b)+'</td><td><span class="oc-pill '+(c.b>=c.a?"oc-pu":"oc-pd")+'">'+(c.b>c.a?"+":"−")+Math.abs((c.b-c.a)/c.a*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%</span></td></tr>").join("")+"</table>":'<div class="oc-l">Цена за период не менялась</div>')+'<div class="oc-l oc-top">Яндекс и WB: только текущая цена, история копится с 17.11</div></div>');
 }else out.push('<div><p class="oc-h">История цены</p><div class="oc-nd">Для этого товара нет истории цены Ozon</div></div>');
 return '<div class="oc-panel">'+out.join("")+"</div>";
}

function kpis(m,state){
 const c=m.cur.agg,p=m.prev?.agg,approx=!m.cur.closed;
 if(!c)return "";
 const ru=per(c.result,c.units),pu=p?per(p.result,p.units):null;
 const days=m.stock?.days;
 const stockTile='<div class="oc-k"><div class="oc-l">Запас, Ozon</div>'+(m.stock&&m.stock.pieces!=null?'<div class="oc-v">'+pcs(m.stock.pieces)+' шт</div><div class="oc-l">'+(days!=null?"хватит на "+Math.round(days)+" дн.":"дни: нет данных")+"</div>":'<div class="oc-v oc-nd">нет данных</div>')+"</div>";
 return '<div class="oc-kpis">'
 +'<div class="oc-k"><div class="oc-l">Продано чистыми</div><div class="oc-v">'+pcs(c.units)+' шт</div>'+(p?delta(c.units,p.units,{approx,pcsFmt:true}):"")+"</div>"
 +'<div class="oc-k"><div class="oc-l">Выручка нетто</div><div class="oc-v">'+rub(c.net_sales)+' ₽</div>'+(p?delta(c.net_sales,p.net_sales,{approx,noPct:false}):"")+"</div>"
 +'<div class="oc-k"><div class="oc-l">Получаем / шт</div><div class="oc-v">'+(ru==null?"—":rub(ru)+" ₽")+"</div>"+(ru!=null&&pu!=null?delta(ru,pu,{approx}):"")+'<div class="oc-l">'+(c.units>0?"на "+pcs(c.units)+" чист. шт":"нет чистых продаж")+"</div></div>"
 +priceKpi(m)+stockTile+priceTile(m,state.pricesOpen)+"</div>"+(state.pricesOpen?pricePanel(m):"");
}

function marketTable(m){
 const approx=!m.cur.closed;
 const keys=[...new Set([...m.cur.all.map(r=>r.marketplace)])];
 const cabOnly=r=>m.cabinet==="ALL"||r.account_id===m.cabinet;
 const rows=keys.map(k=>({k,c:aggregate(m.cur.all.filter(r=>r.marketplace===k&&cabOnly(r))),p:m.prev?aggregate(m.prev.all.filter(r=>r.marketplace===k&&cabOnly(r))):null})).filter(x=>x.c&&(Math.abs(x.c.units)>0||Math.abs(x.c.net_sales)>0));
 if(!rows.length)return '<div class="oc-card"><p class="oc-h">По маркетплейсам</p><div class="oc-nd">Нет продаж за период</div></div>';
 const tc=aggregate(rows.flatMap(x=>m.cur.all.filter(r=>r.marketplace===x.k&&cabOnly(r)))),tp=m.prev?aggregate(rows.flatMap(x=>m.prev.all.filter(r=>r.marketplace===x.k&&cabOnly(r)))):null;
 const share=(a,t)=>t&&t.units>0?a.units/t.units*100:null;
 const line=(label,c,p,tot,totp,isTot)=>{
  const pr=c?per(c.result,c.units):null,pp=p?per(p.result,p.units):null;
  const sh=!isTot?share(c,tot):null,shp=!isTot&&p&&totp?share(p,totp):null;
  return '<tr'+(isTot?' class="oc-tot"':"")+'><td>'+e(label)+(!isTot&&sh!=null?'<small>'+p1(sh).replace(",0%","%")+(shp!=null?" · было "+p1(shp).replace(",0%","%"):"")+"</small>":"")+"</td><td>"+pcs(c.units)+(p?"<small>"+delta(c.units,p.units,{approx,pcsFmt:true})+"</small>":"")+"</td><td>"+rub(c.net_sales)+(p?"<small>"+deltaPct(c.net_sales,p.net_sales,{approx})+"</small>":"")+"</td><td>"+(pr==null?"—":rub(pr))+(pr!=null&&pp!=null?"<small>"+delta(pr,pp,{approx})+"</small>":"")+"</td></tr>";
 };
 return '<div class="oc-card"><p class="oc-h">По маркетплейсам · '+e(mShort(m.month))+(m.prev?" к "+e(mShort(m.compareMonth)):"")+'</p><table class="oc-t"><tr><th>МП</th><th>Шт</th><th>Выручка, ₽</th><th>Пол./шт, ₽</th></tr>'
 +rows.map(x=>line(MP[x.k]??x.k,x.c,x.p,tc,tp,false)).join("")+(rows.length>1?line("Итого",tc,tp,tc,tp,true):"")+"</table></div>";
}

function expenseTable(m){
 const c=m.cur.agg,p=m.prev?.agg;if(!c)return "";
 const approx=!m.cur.closed;
 const rows=GROUPS.filter(([g])=>Math.abs(c.cost[g])>0.5||(p&&Math.abs(p.cost[g])>0.5));
 const cell=(a,g)=>a?rub(g==="__t"?a.cost_total:a.cost[g])+"<small>"+p1(rate(g==="__t"?a.cost_total:a.cost[g],a.net_sales))+" · "+(a.units>0?rub(per(g==="__t"?a.cost_total:a.cost[g],a.units))+"/шт":"—")+"</small>":'<span class="oc-nd">—</span>';
 const chg=(g)=>{if(!p)return "";const cv=g==="__t"?c.cost_total:c.cost[g],pv=g==="__t"?p.cost_total:p.cost[g];const pp=rate(cv,c.net_sales)-rate(pv,p.net_sales);return (Number.isFinite(pp)?delta(rate(cv,c.net_sales),rate(pv,p.net_sales),{pp:true,inverse:true,approx,keep:true}):"")+"<small>"+rubS(cv-pv)+" ₽</small>";};
 const tr=(label,g,tot)=>'<tr'+(tot?' class="oc-tot"':"")+'><td>'+label+"</td><td>"+cell(p,g)+"</td><td>"+cell(c,g)+"</td><td>"+chg(g)+"</td></tr>";
 return '<div class="oc-card"><p class="oc-h">Расходы маркетплейса · '+e(mShort(m.month))+(m.prev?" к "+e(mShort(m.compareMonth)):"")+'</p><table class="oc-t"><tr><th>Статья</th><th>'+(m.prev?e(mLong(m.compareMonth).split(" ")[0]):"—")+"</th><th>"+e(mLong(m.month).split(" ")[0])+"</th><th>Изменение</th></tr>"
 +rows.map(([g,l])=>tr(l,g,false)).join("")+tr("Итого","__t",true)+'</table><div class="oc-l oc-top">Доля считается от выручки нетто. Рост доли расходов красный, снижение зелёное</div></div>';
}

function perUnitBlock(m){
 const hs=m.history.filter(h=>h.agg);
 if(hs.length<2)return "";
 const rows=hs.map(h=>{const a=h.agg;return {m:h.month,closed:h.closed,u:a.units,rev:per(a.net_sales,a.units),cost:per(a.cost_total,a.units),comp:per(a.compensation,a.units),res:per(a.result,a.units),total:a.result,net:a.net_sales};});
 const vals=rows.map(r=>r.res).filter(v=>v!=null);
 if(vals.length<2)return "";
 const lo=Math.min(...vals),hi=Math.max(...vals),span=(hi-lo)||Math.abs(hi)*0.1||1;
 const W=360,H=130,step=W/rows.length;
 const pts=rows.map((r,i)=>r.res==null?null:{x:step*(i+0.5),y:100-((r.res-lo)/span)*70-0,r});
 const ok=pts.filter(Boolean);
 const poly='<polyline fill="none" stroke="var(--oc-accent)" stroke-width="1.8" points="'+ok.map(q=>q.x.toFixed(1)+","+(q.y-8).toFixed(1)).join(" ")+'"/>';
 const dots=ok.map((q,i)=>'<circle cx="'+q.x.toFixed(1)+'" cy="'+(q.y-8).toFixed(1)+'" r="'+(q.r.m===m.month?5:4)+'" fill="'+(q.r.m===m.month?"var(--oc-accent)":"var(--oc-card)")+'" stroke="var(--oc-accent)" stroke-width="1.5"/><text x="'+q.x.toFixed(1)+'" y="'+(q.y-18).toFixed(1)+'" text-anchor="middle" font-size="12" fill="var(--oc-text)">'+rub(q.r.res)+"</text>").join("");
 const labels=rows.map((r,i)=>'<text x="'+(step*(i+0.5)).toFixed(1)+'" y="'+(H-4)+'" text-anchor="middle" font-size="11" fill="var(--oc-sec)">'+mShort(r.m)+(r.m===m.month&&!r.closed?" ≈":"")+"</text>").join("");
 const head=rows.map(r=>"<th"+(r.m===m.month?' class="oc-cur"':"")+">"+mShort(r.m)+(!r.closed?" ≈":"")+"</th>").join("");
 const td=(fn,cls)=>rows.map(r=>"<td"+(r.m===m.month?' class="oc-cur '+(cls?cls(r):"")+'"':(cls?' class="'+cls(r)+'"':""))+">"+fn(r)+"</td>").join("");
 const dl=rows.map((r,i)=>{const prev=rows[i-1];return "<td"+(r.m===m.month?' class="oc-cur"':"")+">"+(prev&&prev.res!=null&&r.res!=null?delta(r.res,prev.res,{approx:!r.closed}):'<span class="oc-nd">—</span>')+"</td>";}).join("");
 return '<div class="oc-card oc-wide"><div class="oc-row"><p class="oc-h oc-m0">Получаем / шт по месяцам</p><span class="oc-l">после всех расходов МП, с компенсациями и декомпенсациями</span></div><div class="oc-two"><svg width="100%" height="'+H+'" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="Получаем на штуку по месяцам">'+poly+dots+labels+'</svg><table class="oc-t"><tr><th></th>'+head+"</tr>"
 +"<tr><td>Цена реализации / шт</td>"+td(r=>rub(r.rev))+"</tr>"
 +"<tr><td>− Расходы МП / шт</td>"+td(r=>r.cost==null?"—":rub(-r.cost),()=>"oc-dn")+"</tr>"
 +"<tr><td>± Компенсации / шт</td>"+td(r=>r.comp==null?"—":rubS(r.comp),r=>r.comp>0.5?"oc-up":r.comp<-0.5?"oc-dn":"")+"</tr>"
 +'<tr class="oc-tot"><td>Получаем / шт</td>'+td(r=>rub(r.res))+"</tr><tr><td class=\"oc-l\">К пред. месяцу</td>"+dl+"</tr><tr><td class=\"oc-l\">Чистых шт в знаменателе</td>"+td(r=>pcs(r.u))+"</tr></table></div>"
 +'<div class="oc-l oc-top">'+(m.cur.closed?"":"Текущий месяц предварительный: месяц не закрыт, дельты со значком ≈. ")+"Если выбрана площадка или кабинет, блок пересчитывается по ним</div></div>";
}

function salesBlock(m){
 const c=m.cur.agg;if(!c)return "";
 const approx=!m.cur.closed;
 const o=m.ops(m.month),po=m.prev?m.ops(m.compareMonth):null;
 const ord=m.orders(m.month),pord=m.prev?m.orders(m.compareMonth):null;
 const rows=[];
 rows.push(["Продажи до возвратов",rub(c.sales)+" ₽",m.prev?.agg?delta(c.sales,m.prev.agg.sales,{approx}):""]);
 rows.push(["Возвраты, ₽",rub(c.returns)+" ₽",""]);
 rows.push(["Выручка нетто",rub(c.net_sales)+" ₽",m.prev?.agg?delta(c.net_sales,m.prev.agg.net_sales,{approx}):""]);
 if(ord!=null)rows.push(["Заказано, шт (Ozon) <span class=\"oc-pill oc-pn\">по дате заказа</span>",pcs(ord),pord!=null?delta(ord,pord,{pcsFmt:true}):""]);
 if(o&&!o.mismatch){
  const ratePct=o.sale>0?o.ret/o.sale*100:null,pr=po&&!po.mismatch&&po.sale>0?po.ret/po.sale*100:null;
  rows.push(["Реализовано, шт"+(o.partial?" (без WB)":""),pcs(o.sale),po&&!po.mismatch?delta(o.sale,po.sale,{approx,pcsFmt:true}):""]);
  rows.push(["Финансовые возвраты, шт"+(o.partial?" (без WB)":""),pcs(o.ret),po&&!po.mismatch?delta(o.ret,po.ret,{approx,pcsFmt:true,inverse:true}):""]);
  rows.push(["Чистые продажи, шт",pcs(c.units),m.prev?.agg?delta(c.units,m.prev.agg.units,{approx,pcsFmt:true}):""]);
  if(ratePct!=null)rows.push(["Доля финансовых возвратов",p1(ratePct),pr!=null?delta(ratePct,pr,{pp:true,inverse:true,approx,keep:true}):""]);
 }else rows.push(["Чистые продажи, шт",pcs(c.units),m.prev?.agg?delta(c.units,m.prev.agg.units,{approx,pcsFmt:true}):""],["Реализации и возвраты по операциям",'<span class="oc-nd">'+(o?.mismatch?"не сошлись с итогом, скрыты":"нет данных")+"</span>",""]);
 rows.push(["Физически возвращено · списано",'<span class="oc-nd">нет данных</span>',""]);
 rows.push(["Компенсировано, шт",c.compensated_units>0?pcs(c.compensated_units):"—",""]);
 return '<div class="oc-card"><p class="oc-h">Продажи и возвраты</p>'+rows.map(([a,b,d])=>'<div class="oc-ev"><span>'+a+"</span><span>"+b+(d?" "+d:"")+"</span></div>").join("")+"</div>";
}

function overview(m,state){
 if(!m.cur.agg)return '<div class="oc-card"><div class="oc-nd">В выбранном периоде нет данных по этому товару и фильтру</div></div>';
 return '<div class="oc-grid">'+marketTable(m)+expenseTable(m)+"</div><div class=\"oc-grid\">"+perUnitBlock(m)+"</div><div class=\"oc-grid\">"+salesBlock(m)+bridgeBlock(m)+"</div>";
}
function bridgeBlock(m){
 const c=m.cur.agg;if(!c)return "";const u=c.units;
 const pu=v=>u>0?rub(v/u):"—";
 const line=(l,v,cls)=>'<div class="oc-ev"><span>'+l+'</span><span class="'+(cls||"")+'">'+pu(v)+"</span></div>";
 const rowsCost=GROUPS.filter(([g])=>Math.abs(c.cost[g])>0.5).map(([g,l])=>line(l,-c.cost[g],"oc-dn")).join("");
 const decomp=c.decompensation_in;
 return '<div class="oc-card"><p class="oc-h">От выручки до результата, на 1 шт</p>'+(u>0?line("Выручка нетто",c.net_sales)+rowsCost+line("Компенсации и декомпенсации, нетто",c.compensation,c.compensation>0.5?"oc-up":c.compensation<-0.5?"oc-dn":"")+'<div class="oc-ev oc-tot"><span>Получаем / шт</span><span>'+pu(c.result)+"</span></div>"+'<div class="oc-l oc-top">На '+pcs(u)+" чист. шт. Цена карточки в расчёте не участвует</div>":'<div class="oc-nd">Нет чистых продаж: «на штуку» не считается</div>')+"</div>";
}

function financeTab(m){
 const c=m.cur.agg;if(!c)return '<div class="oc-card"><div class="oc-nd">Нет данных</div></div>';
 const u=c.units;
 const dRow=([g,l])=>'<tr><td>'+l+"</td><td>"+rub(c.direct[g])+"</td><td>"+(Math.abs(c.shared[g])>0.5?rub(c.shared[g]):'<span class="oc-nd">—</span>')+"</td><td>"+rub(c.cost[g])+"</td></tr>";
 const split='<div class="oc-card"><p class="oc-h">Прямые и общие расходы</p><table class="oc-t"><tr><th>Статья</th><th>Прямые</th><th>Общие</th><th>Всего</th></tr>'+GROUPS.filter(([g])=>Math.abs(c.cost[g])>0.5).map(dRow).join("")+'<tr class="oc-tot"><td>Итого</td><td>'+rub(c.direct_total)+"</td><td>"+rub(c.shared_total)+"</td><td>"+rub(c.cost_total)+"</td></tr></table>"
 +(u>0?'<div class="oc-top">'
 +'<div class="oc-ev"><span>После прямых расходов / шт</span><span>'+rub(c.after_direct/u)+" ₽</span></div>"
 +'<div class="oc-ev"><span>После всех расходов / шт</span><span>'+rub(c.result_without_compensation/u)+" ₽</span></div>"
 +'<div class="oc-ev"><span>+ компенсации и декомпенсации ('+rubS(c.compensation)+") = Получаем / шт</span><span><b>"+rub(c.result/u)+" ₽</b></span></div></div>":"")
 +'<div class="oc-l oc-top">Общие расходы (без артикула) делятся между артикулами пропорционально положительной выручке</div></div>';
 const rows=m.cur.all.filter(r=>m.market==="ALL"||r.marketplace===m.market).map(r=>({r,a:aggregate([r])}));
 const tot=aggregate(m.cur.all.filter(r=>m.market==="ALL"||r.marketplace===m.market));
 const cab='<div class="oc-card"><p class="oc-h">По площадкам и кабинетам</p><table class="oc-t"><tr><th>Кабинет</th><th>Шт</th><th>Выручка</th><th>Результат</th></tr>'
 +rows.map(({r,a})=>"<tr><td>"+e((MP_SHORT[r.marketplace]??r.marketplace)+" · "+(r.cabinet??r.account_id))+"</td><td>"+pcs(a.units)+"</td><td>"+rub(a.net_sales)+"</td><td>"+rub(a.result)+"</td></tr>").join("")
 +(tot?'<tr class="oc-tot"><td>Итого</td><td>'+pcs(tot.units)+"</td><td>"+rub(tot.net_sales)+"</td><td>"+rub(tot.result)+"</td></tr>":"")+"</table>"
 +(tot&&m.cur.agg&&m.cabinet==="ALL"&&m.market==="ALL"?'<div class="oc-chips oc-top"><span class="oc-pill '+(Math.abs(tot.result-c.result)<1?"oc-pu":"oc-pd")+'">Сверка: кабинеты '+(Math.abs(tot.result-c.result)<1?"=":"≠")+" итог товара, расхождение "+rub(tot.result-c.result)+" ₽</span></div>":"")
 +'<div class="oc-l oc-top">Результат: после всех расходов, с компенсациями и декомпенсациями</div></div>';
 return '<div class="oc-grid">'+split+cab+"</div>";
}
function salesTab(m){
 const rows=m.history.filter(h=>h.agg).map(h=>{const o=m.ops(h.month);return "<tr"+(h.month===m.month?' class="oc-curr"':"")+"><td>"+e(mShort(h.month))+(h.closed?"":" ≈")+"</td><td>"+(m.orders(h.month)==null?"—":pcs(m.orders(h.month)))+"</td><td>"+(o&&!o.mismatch?pcs(o.sale):"—")+"</td><td>"+(o&&!o.mismatch?pcs(o.ret):"—")+"</td><td>"+pcs(h.agg.units)+"</td><td>"+rub(h.agg.sales)+"</td><td>"+rub(h.agg.returns)+"</td><td>"+rub(h.agg.net_sales)+"</td></tr>";}).join("");
 return '<div class="oc-card"><p class="oc-h">Продажи и возвраты по месяцам</p><table class="oc-t"><tr><th>Месяц</th><th>Заказано, шт (Ozon)</th><th>Реализовано</th><th>Возвраты</th><th>Чистые, шт</th><th>Продажи, ₽</th><th>Возвраты, ₽</th><th>Выручка нетто, ₽</th></tr>'+rows+'</table><div class="oc-l oc-top">Реализовано и возвраты в штуках: Ozon и Яндекс. По WB источник не разделяет продажи и возвраты. Физические возвраты и утиль для Orange не загружались</div></div>';
}
function pricesTab(m){
 const stockRows=(m.stock?.rows??[]).map(s=>"<tr><td>"+e(s.cabinet)+"</td><td>"+e(String(s.stock_type).toUpperCase())+"</td><td>"+pcs(s.available)+"</td></tr>").join("");
 return '<div class="oc-card"><p class="oc-h">Цены</p>'+pricePanel(m)+'</div><div class="oc-card oc-gap"><p class="oc-h">Остатки Ozon</p>'+(stockRows?'<table class="oc-t"><tr><th>Кабинет</th><th>Тип</th><th>Доступно, шт</th></tr>'+stockRows+"</table>":'<div class="oc-nd">нет данных</div>')+'<div class="oc-l oc-top">FBS: один физический остаток отражён в каждом кабинете Ozon, в итоге учтён один раз. Остатки Яндекса не обновляются с 29.10, остатков WB в базе нет. Дни считаются по продажам Ozon за 30 дней</div></div><div class="oc-card oc-gap"><p class="oc-h">Реклама</p><div class="oc-nd">Расходы на рекламу по товару есть в блоке «Расходы» (строка «Реклама»)</div></div>';
}
function opsTab(m){
 const rows=m.cur.all.map(r=>{const a=aggregate([r]);return "<tr><td>"+e((MP_SHORT[r.marketplace]??r.marketplace)+" · "+(r.cabinet??r.account_id))+"</td><td>"+pcs(a.units)+"</td><td>"+rub(a.sales)+"</td><td>"+rub(a.returns)+"</td>"+GROUPS.map(([g])=>"<td>"+rub(a.direct[g])+"<small>"+rub(a.shared[g])+"</small></td>").join("")+"<td>"+rub(a.compensation)+"</td><td>"+rub(a.result)+"</td></tr>";}).join("");
 return '<div class="oc-card"><p class="oc-h">Исходные строки по кабинетам</p><div class="oc-scroll"><table class="oc-t"><tr><th>Кабинет</th><th>Чист., шт</th><th>Продажи</th><th>Возвраты</th>'+GROUPS.map(([,l])=>"<th>"+l+"<small>прямые / общие</small></th>").join("")+"<th>Компенс.</th><th>Результат</th></tr>"+rows+'</table></div><div class="oc-l oc-top">Все суммы в ₽. В расходах сверху прямые, ниже общие (разнесённые на артикул). Расходы показаны как затраты, без знака</div></div>';
}

export function renderCard(m,state,product){
 const tabs=[["overview","Обзор"],["sales","Продажи и возвраты"],["finance","Финансы"],["prices","Цены, реклама, остатки"],["ops","Операции"]];
 const body=state.tab==="sales"?salesTab(m):state.tab==="finance"?financeTab(m):state.tab==="prices"?pricesTab(m):state.tab==="ops"?opsTab(m):overview(m,state);
 const noSales=m.cur.agg&&m.cur.agg.units<=0&&Math.abs(m.cur.agg.cost_total)>0.5;
 return '<div class="oc">'
 +'<div class="oc-head"><div class="oc-photo" aria-hidden="true">'+e(String(product.article||product.canonical_sku).slice(0,3))+'</div><div><div class="oc-name">'+e(product.product_name||product.article||product.canonical_sku)+'</div><div class="oc-l">'+e(product.article||product.canonical_sku)+(product.category_name?" · "+e(product.category_name):"")+(noSales?' <span class="oc-pill oc-pw">Только расходы</span>':"")+"</div></div></div>"
 +filters(m,state)+statusChips(m,m.cur.payload,state.extras)
 +(state.extrasError?'<div class="oc-note">Цены, остатки и операции продаж не загрузились. Остальные данные карточки доступны.</div>':"")
 +kpis(m,state)
 +'<div class="oc-tabs" role="tablist">'+tabs.map(([id,l])=>'<button type="button" role="tab" aria-selected="'+(id===state.tab)+'" class="oc-tab'+(id===state.tab?" oc-on":"")+'" data-oc-tab="'+id+'">'+l+"</button>").join("")+"</div>"
 +body+"</div>";
}

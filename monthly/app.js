import {TENANTS as DEFAULT_TENANTS,MONTHS,MARKETPLACES,GROUPS} from "./config.js?v=20261004periods";
import {escapeHtml as e,money,units,rate,pct,monthLabel,shortMonth,validatePayload,selectPayload,expenseOnly,filterRows,monthsBefore,numberOrNull} from "./core.js?v=20261002orange";
import {createScopeLoader} from "./live-v2.js?v=20261006incomeunits";

import {loadReportRegistry} from '../core/runtime-registry.js?v=20261004finish';
import {ensureSession,makeAuthedFetch,mountAuthBadge} from '../shared/auth-dev.js?v=20261012authpathfix1';
const session=await ensureSession();
const authedFetch=makeAuthedFetch();
mountAuthBadge();
let TENANTS={...DEFAULT_TENANTS};
try{const rows=await loadReportRegistry();const runtime=Object.fromEntries(rows.filter(t=>t.monthly_available).map(t=>[t.tenant_id,{label:t.display_name}]));if(Object.keys(runtime).length)TENANTS=runtime}catch(error){console.warn('Report registry unavailable',error.message)}
const $=s=>document.querySelector(s);
const state={bundle:null,market:"ALL",payload:null,product:null,productMarket:"ALL",focus:"all",comparisonMonth:null};
const query=new URLSearchParams(location.search);
const EXPENSE_ORDER=[["commission","Комиссия"],["promotion","Продвижение"],["logistics","Логистика"],["other","Прочее"],["storage","Хранение"]];
const $text=(selector,value)=>{$(selector).textContent=value;};
const tenant=()=>$("#tenantSelect").value;
const month=()=>$("#monthSelect").value;
const finance=()=>state.payload?.financial_economics??{};
const signedClass=v=>numberOrNull(v)==null?"":Number(v)<0?"negative":"positive";
const dateText=v=>v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"})+" МСК":"—";
const clamp=v=>Math.max(0,Math.min(100,numberOrNull(v)??0));
const previousMonth=value=>{const[y,m]=value.split("-").map(Number);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);};
const comparisonCandidates=()=>MONTHS.filter(value=>value<month());
const comparisonMonth=()=>state.comparisonMonth;
const previousPayload=()=>selectPayload(state.bundle,tenant(),comparisonMonth(),state.market);
const comparisonReady=()=>{const previous=previousPayload();return Boolean(state.payload&&previous&&state.payload.metadata.data_available!==false&&previous.metadata.data_available!==false&&previous.metadata.marketplace_close_status==="CLOSED");};
const metricRate=(p,key)=>rate(p?.financial_economics?.[key],p?.financial_economics?.sales);

function updateUrl(){const url=new URL(location.href);url.searchParams.set("tenant",tenant());url.searchParams.set("month",month());url.searchParams.set("marketplace",state.market);if(comparisonMonth())url.searchParams.set("compare",comparisonMonth());else url.searchParams.delete("compare");history.replaceState(null,"",url);const daily=new URL("../daily/",location.href);daily.searchParams.set("tenant",tenant());const link=document.getElementById("dailyLink");if(link)link.href=daily.toString();const weekly=new URL("../weekly/",location.href);weekly.searchParams.set("tenant",tenant());const wlink=document.getElementById("weeklyLink");if(wlink)wlink.href=weekly.toString();}

function availableMarkets(){
 const consolidated=selectPayload(state.bundle,tenant(),month(),"ALL");
 if(consolidated?.metadata?.available_markets?.length)return consolidated.metadata.available_markets;
 return [...new Set((state.bundle?.payloads??[]).filter(p=>p.metadata.tenant_id===tenant()&&p.metadata.month===month()&&p.metadata.marketplace!=="ALL"&&p.metadata.data_available!==false).map(p=>p.metadata.marketplace))];
}
function renderHeader(){
 const p=state.payload,m=p?.metadata??{},available=availableMarkets();
 $text("#pageTitle",(TENANTS[tenant()]?.label??tenant())+" · "+monthLabel(month()).replace(/^./,c=>c.toUpperCase()));
 $text("#monthStatus",p?(m.marketplace_close_status==="CLOSED"?"Закрыт · ревизия "+m.base_close_revision:m.marketplace_close_status==="LIVE"?"LIVE · текущий месяц":"Нет данных"):"Нет данных");
 $("#monthStatus").className="status-pill "+(m.marketplace_close_status==="CLOSED"?"closed":m.marketplace_close_status==="LIVE"?"live":"empty");
 const candidates=comparisonCandidates();
 if(!candidates.includes(comparisonMonth()))state.comparisonMonth=candidates[0]??null;
 $("#comparisonSelect").innerHTML=candidates.length?candidates.map(value=>'<option value="'+value+'">к '+e(shortMonth(value))+'</option>').join(""):'<option value="">Нет предыдущих месяцев</option>';
 $("#comparisonSelect").value=comparisonMonth()??"";
 $("#comparisonSelect").disabled=!candidates.length;
 const marketLabel=MARKETPLACES.find(item=>item.id===state.market)?.label??state.market;
 $text("#bridgeMarket",state.market==="ALL"?(available.length>1?"Все площадки":MARKETPLACES.find(item=>item.id===available[0])?.label??"Все площадки"):marketLabel);
 $text("#footerCoverage",state.market==="ALL"?(available.length?"Доступно: "+available.map(id=>MARKETPLACES.find(item=>item.id===id)?.label??id).join(" · "):"Нет доступных площадок"):(p?"Данные: "+marketLabel:"Площадка не подключена"));
}

function deltaText(current,previous,mode="amount"){
 if(!comparisonReady()||numberOrNull(current)==null||numberOrNull(previous)==null)return "Нет сопоставимой истории";
 const delta=mode==="pp"?current-previous:(Number(previous)===0?null:(current-previous)/Math.abs(previous)*100);
 if(delta==null)return "Нет базы сравнения";
 return (delta>0?"↑ +":delta<0?"↓ −":"→ ")+Math.abs(delta).toLocaleString("ru-RU",{maximumFractionDigits:1})+(mode==="pp"?" п.п.":"%");
}

function renderSummary(){
 const p=state.payload,f=finance(),m=p?.metadata??{},prev=previousPayload(),pf=prev?.financial_economics??{};
 const kpis=[
  ["₽","Продажи",f.sales,p?.sku_rows?.length?`${p.sku_rows.length} SKU · до возвратов`:"До возвратов",deltaText(f.sales,pf.sales)],
  ["↩","Возвраты/списания",f.returns,pct(rate(f.returns,f.sales))+" от продаж",deltaText(metricRate(p,"returns"),metricRate(prev,"returns"),"pp"),"danger"],
  ["≋","Расходы МП",f.marketplace_expenses,pct(rate(f.marketplace_expenses,f.sales))+" от продаж",deltaText(metricRate(p,"marketplace_expenses"),metricRate(prev,"marketplace_expenses"),"pp"),"danger"],
  ["▥","Результат без компенсаций",f.result_without_compensation,pct(rate(f.result_without_compensation,f.sales))+" от продаж",deltaText(metricRate(p,"result_without_compensation"),metricRate(prev,"result_without_compensation"),"pp"),signedClass(f.result_without_compensation)],
  ["＋","Результат с компенсациями",f.result_with_compensation,"Компенсации: "+money(f.compensation),deltaText(metricRate(p,"result_with_compensation"),metricRate(prev,"result_with_compensation"),"pp"),signedClass(f.result_with_compensation)],
  ["◫","После всех расходов",f.final_business_result,"С компенсациями · после себестоимости и бизнес-расходов",deltaText(metricRate(p,"final_business_result"),metricRate(prev,"final_business_result"),"pp"),signedClass(f.final_business_result)]
 ];
 $("#overview").innerHTML=kpis.map(([icon,label,value,note,delta,tone="neutral"])=>'<article class="kpi '+tone+'"><div class="kpi-label"><i>'+icon+'</i><span>'+e(label)+'</span></div><strong>'+money(value)+'</strong><small>'+e(note)+'</small><em class="'+(delta.startsWith("↑")?"up":delta.startsWith("↓")?"down":"unavailable")+'">'+e(delta)+'</em></article>').join("");
 $("#contextLine").innerHTML=p?'<span><i class="status-dot"></i>'+e(m.marketplace_close_status==="CLOSED"?"База месяца зафиксирована":m.marketplace_close_status==="LIVE"?"Данные месяца продолжают поступать":"Данные месяца ещё не поступили")+'</span><span>Компенсации: '+e(m.compensation_status==="PENDING"?"ожидаются":m.compensation_status==="COMPLETE"?"завершены":m.compensation_status==="PARTIAL"?"загружены частично":"нет данных")+'</span><span>Бизнес-расходы: '+e(m.business_expense_status==="COMPLETE"?"учтены":m.business_expense_status==="NOT_APPLICABLE"?"не применяются":"не доступны")+'</span>':"";
 $text("#compensationBadge",p?"Компенсации: "+money(f.compensation)+" · "+(m.compensation_status==="PENDING"?"ожидаются":m.compensation_status==="PARTIAL"?"загружены частично":m.compensation_status==="COMPLETE"?"завершены":"нет данных"):"");
 $("#technicalState").textContent=p?JSON.stringify(m,null,2):"Нет данных выбранной площадки";
}

function renderAllocation(){
 const f=finance(),sales=f.sales;
 const parts=[
  ["returns","Возвраты",rate(f.returns,sales),"return"],
  ["marketplace_expenses","Расходы МП",rate(f.marketplace_expenses,sales),"market"],
  ["cogs","COGS",rate(f.cogs,sales),"cogs"],
  ["result_after_cogs","Остаётся",rate(f.result_after_cogs,sales),"remain"]
 ];
 if(numberOrNull(sales)==null||sales<=0){$("#allocationBar").innerHTML='<div class="empty compact">Нет данных для структуры 100 ₽</div>';$("#allocationCards").innerHTML="";return;}
 $("#allocationBar").innerHTML='<div class="stack">'+parts.map(([,label,value,tone])=>'<span class="'+tone+'" style="width:'+clamp(value)+'%" title="'+e(label)+': '+pct(value)+'"></span>').join("")+'</div><div class="stack-labels">'+parts.map(([,label,value,tone])=>'<span class="'+tone+'"><strong>'+(value==null?'—':value.toLocaleString("ru-RU",{maximumFractionDigits:1})+' ₽')+'</strong><small>'+e(label)+'</small></span>').join("")+'</div>';
 $("#allocationCards").innerHTML=parts.map(([,label,value,tone])=>'<div class="allocation-card '+tone+'"><i></i><span><strong>'+(value==null?'—':value.toLocaleString("ru-RU",{maximumFractionDigits:1})+' ₽')+'</strong><small>'+e(label)+'</small><b>'+pct(value)+'</b></span></div>').join("");
}

function renderComparison(){
 const p=state.payload,prev=previousPayload(),ready=comparisonReady();
 const rows=[["Комиссия","commission"],["Продвижение","promotion"],["Логистика","logistics"],["Возвраты","returns"],["Результат МП","result_without_compensation"]];
 const previousLabel=ready?shortMonth(comparisonMonth()):"Выбранный месяц";
 $("#comparisonTable").innerHTML='<table class="comparison-table"><thead><tr><th>Показатель</th><th>'+e(previousLabel)+'</th><th>'+e(shortMonth(month()))+'</th><th>Изменение</th></tr></thead><tbody>'+rows.map(([label,key])=>{const current=metricRate(p,key),old=metricRate(prev,key),delta=ready?deltaText(current,old,"pp"):"—";return '<tr><td>'+e(label)+'</td><td>'+(ready?pct(old):"—")+'</td><td>'+pct(current)+'</td><td class="'+(delta.startsWith("↑")?"delta-up":delta.startsWith("↓")?"delta-down":"delta-na")+'">'+e(delta)+'</td></tr>';}).join("")+'</tbody></table>'+(ready?"":'<p class="comparison-empty">Сравнение включится автоматически, когда API передаст сопоставимый закрытый месяц.</p>');
}

function renderExpenses(){
 const p=state.payload,f=finance(),total=p?.expense_structure?.total??{};
 const values=EXPENSE_ORDER.map(([key])=>Math.abs(numberOrNull(total[key])??0)),max=Math.max(...values,1);
 $("#expenseRows").innerHTML=EXPENSE_ORDER.map(([key,label],index)=>'<div class="expense-row"><span>'+e(label)+'</span><div class="expense-track"><i class="expense-'+index+'" style="width:'+clamp(values[index]/max*100)+'%"></i></div><strong>'+money(total[key],false)+'</strong><b>'+pct(rate(total[key],f.sales))+'</b></div>').join("");
 const largest=EXPENSE_ORDER.map(([key,label])=>({key,label,value:Math.abs(numberOrNull(total[key])??0)})).sort((a,b)=>b.value-a.value)[0];
 $("#expenseDriver").innerHTML=largest?'<span>◉</span> Главный драйвер расходов — '+e(largest.label.toLowerCase())+' ('+pct(rate(total[largest.key],f.sales))+' от продаж).':'Нет данных о расходах.';
}

function renderBridge(){
 const f=finance(),base=Math.abs(numberOrNull(f.sales)??0);
 const steps=[
  ["Чистые<br>продажи",f.net_sales,0,"net"],
  ["Расходы<br>МП",f.marketplace_expenses,Math.max(0,numberOrNull(f.result_without_compensation)??0),"expense"],
  ["Результат<br>МП",f.result_without_compensation,0,"result"],
  ["COGS",numberOrNull(f.cogs)==null?null:-Math.abs(Number(f.cogs)),Math.max(0,numberOrNull(f.result_after_cogs)??0),"cogs"],
  ["После<br>COGS",f.result_after_cogs,0,"final"]
 ];
 if(!base){$("#bridgeChart").innerHTML='<div class="empty compact">Нет данных для финансового моста</div>';return;}
 $("#bridgeChart").innerHTML='<div class="bridge-grid"></div>'+steps.map(([label,value,bottom,tone])=>{const height=clamp(Math.abs(numberOrNull(value)??0)/base*100),floor=clamp(bottom/base*100);return '<div class="bridge-step"><div class="bridge-value '+signedClass(value)+'">'+money(value,false)+'</div><div class="bridge-column"><span class="bridge-fill '+tone+'" style="--height:'+height+'%;--bottom:'+floor+'%"></span></div><small>'+label+'</small></div>';}).join("");
}

const comparableProductResult=row=>numberOrNull(row?.result_after_cogs)??(numberOrNull(row?.result_without_compensation)==null?null:Number(row.result_without_compensation)+(numberOrNull(row.compensation)??0));
const previousProduct=row=>previousPayload()?.sku_rows?.find(item=>(row.product_id!=null&&item.product_id===row.product_id)||String(item.canonical_sku)===String(row.canonical_sku));
const percentChange=(current,previous)=>current==null||previous==null||previous===0?null:(current-previous)/Math.abs(previous)*100;
const soldUnitsValue=row=>numberOrNull(row?.financial_sale_units??row?.sale_units_display);
const yieldUnits=row=>{const value=numberOrNull(row?.income_units??row?.financial_net_units);return value!=null&&value>0?value:null;};
const netUnitsValue=row=>{const value=numberOrNull(row?.financial_net_units);return value!=null&&value>0?value:null;};
const perUnit=(amount,count)=>amount==null||count==null||count<=0?null:amount/count;
const monthClosed=()=>state.payload?.metadata?.marketplace_close_status==="CLOSED";
const opsReadyIn=(row,payload)=>numberOrNull(row?.physical_returned_units)!=null||payload?.metadata?.marketplace_close_status==="CLOSED";
const opsReady=row=>opsReadyIn(row,state.payload);
const deltaUnits=(row,prev)=>opsReadyIn(row,state.payload)&&opsReadyIn(prev,previousPayload())?yieldUnits:netUnitsValue;
const compareAll=(row,prev)=>{const u=deltaUnits(row,prev);return percentChange(perUnit(numberOrNull(row?.result_without_compensation),u(row)),perUnit(numberOrNull(prev?.result_without_compensation),u(prev)));};
const compareDirect=(row,prev)=>{const u=deltaUnits(row,prev);return percentChange(perUnit(directResultAmount(row),u(row)),perUnit(directResultAmount(prev),u(prev)));};
const sumGroups=(row,kind)=>{const values=GROUPS.map(([key])=>numberOrNull(row?.expense_structure?.[kind]?.[key]));return values.every(value=>value==null)?null:values.reduce((sum,value)=>sum+(value??0),0);};
const splitAvailableFor=payload=>Boolean(payload?.sku_rows?.some(row=>{const shared=sumGroups(row,"allocated_shared");return shared!=null&&Math.abs(shared)>0;}));
const splitAvailable=()=>splitAvailableFor(state.payload);
const directResultAmount=row=>{
 const provided=numberOrNull(row?.direct_net_received);
 if(provided!=null)return provided;
 const netSales=numberOrNull(row?.net_sales),direct=sumGroups(row,"direct");
 return netSales==null||direct==null?null:netSales+direct;
};
const directResultPerUnit=row=>perUnit(directResultAmount(row),yieldUnits(row));
const allExpensesPerUnit=row=>perUnit(numberOrNull(row?.result_without_compensation),yieldUnits(row));
function productDelta(row){
 if(!comparisonReady())return null;
 return compareAll(row,previousProduct(row));
}
const productSalesDelta=row=>comparisonReady()?percentChange(numberOrNull(row?.sales),numberOrNull(previousProduct(row)?.sales)):null;
const productUnitsDelta=row=>comparisonReady()?percentChange(soldUnitsValue(row),soldUnitsValue(previousProduct(row))):null;
const productDirectDelta=row=>comparisonReady()&&splitAvailable()&&splitAvailableFor(previousPayload())?compareDirect(row,previousProduct(row)):null;
const money0=value=>numberOrNull(value)==null?"—":Math.round(Number(value)).toLocaleString("ru-RU");
const deltaMarkup=(value,approx=false)=>value==null?'<span class="cell-delta unavailable">—</span>':approx?'<span class="cell-delta approx" title="Месяц не закрыт: данные могут измениться. Если за один из месяцев нет физических возвратов и утиля, сравнение идёт на чистых единицах">≈ '+(value>0?'+':value<0?'−':'')+Math.abs(value).toLocaleString("ru-RU",{maximumFractionDigits:1})+'%</span>':'<span class="cell-delta '+(value>0?'up':value<0?'down':'flat')+'">'+(value>0?'↑ +':value<0?'↓ −':'→ ')+Math.abs(value).toLocaleString("ru-RU",{maximumFractionDigits:1})+'%</span>';

function focusMembers(source,focus){
 if(focus==="leaders")return [...source].filter(row=>comparableProductResult(row)!=null).sort((a,b)=>comparableProductResult(b)-comparableProductResult(a)).slice(0,12);
 if(focus==="expenses")return [...source].filter(row=>numberOrNull(row.marketplace_expenses)!=null&&row.marketplace_expenses!==0).sort((a,b)=>Math.abs(b.marketplace_expenses)-Math.abs(a.marketplace_expenses)).slice(0,12);
 if(focus==="negative")return source.filter(row=>comparableProductResult(row)!=null&&comparableProductResult(row)<0);
 if(focus==="expense-only")return source.filter(expenseOnly);
 if(focus==="growth")return comparisonReady()?source.filter(row=>(productDelta(row)??0)>0):[];
 if(focus==="decline")return comparisonReady()?source.filter(row=>(productDelta(row)??0)<0):[];
 return [...source];
}

function renderProducts(){
 const source=state.payload?.sku_rows??[],ready=comparisonReady();
 const groups=[
  ["all","Все",source.length,false],
  ["leaders","Лидеры результата",focusMembers(source,"leaders").length,false],
  ["expenses","Самые большие расходы",focusMembers(source,"expenses").length,false],
  ["growth","Выросли",ready?focusMembers(source,"growth").length:null,!ready],
  ["decline","Упали",ready?focusMembers(source,"decline").length:null,!ready],
  ["negative","Убыточные",focusMembers(source,"negative").length,false],
  ["expense-only","Только расходы",focusMembers(source,"expense-only").length,false]
 ];
 if(groups.find(group=>group[0]===state.focus)?.[3])state.focus="all";
 $("#focusChips").innerHTML=groups.map(([id,label,count,disabled])=>'<button type="button" data-focus="'+id+'" aria-pressed="'+(state.focus===id)+'" '+(disabled?'disabled title="Нет сопоставимого закрытого месяца"':"")+'>'+e(label)+' <span>('+(count==null?"—":count)+')</span></button>').join("");
 const focused=focusMembers(source,state.focus);
 const rows=filterRows(focused,{search:$("#skuSearch").value,category:$("#categoryFilter").value,focus:"all",sort:$("#sortSelect").value});
 const losses=focusMembers(source,"negative").length,expenseOnlyCount=focusMembers(source,"expense-only").length;
 $("#productAlerts").innerHTML='<button data-focus="negative"><i class="red-dot"></i>Товаров в минусе: '+losses+'</button><button data-focus="expense-only"><i class="amber-dot"></i>Только расходы: '+expenseOnlyCount+'</button>';
 $("#skuBody").innerHTML=rows.map(row=>{const delta=productDelta(row),directDelta=productDirectDelta(row),salesDelta=productSalesDelta(row),unitsDelta=productUnitsDelta(row),directPerUnit=directResultPerUnit(row),allPerUnit=allExpensesPerUnit(row),approx=!monthClosed(),splitOk=splitAvailable(),netU=netUnitsValue(row),physUnits=numberOrNull(row.physical_returned_units),writtenOff=numberOrNull(row.written_off_units),ready=opsReady(row);const soldUnits=Number(row.financial_sale_units??row.sale_units_display??0),returnUnits=Number(row.financial_return_units??row.return_writeoff_units??0),incomeUnits=Number(row.income_units??row.financial_net_units??0),returnPct=soldUnits>0?returnUnits/soldUnits:null,resultMp=Number(row.result_without_compensation??0),comp=Number(row.compensation??0),resultWithComp=resultMp+comp,resultWithCompPerUnit=incomeUnits>0?resultWithComp/incomeUnits:null,afterCogsPerUnit=incomeUnits>0&&row.result_after_cogs!=null?Number(row.result_after_cogs)/incomeUnits:null;return '<tr><td><button class="product-link" data-sku="'+e(row.canonical_sku)+'" title="'+e(row.product_name||row.article||row.canonical_sku)+'"><span class="product-monogram">'+e((row.article||row.canonical_sku||"?").slice(0,2))+'</span><span><strong>'+e(row.article||row.canonical_sku)+'</strong><small>'+e(row.product_name||"Название не передано")+'</small>'+(expenseOnly(row)?'<em>Только расходы</em>':"")+'<span class="ops-badge '+(ready?'ok':'wait')+'">'+(ready?'возвр. и утиль учтены':'возвр. и утиль ожидаются')+'</span></span><b>›</b></button></td><td>'+money0(row.sales)+deltaMarkup(salesDelta)+'</td><td>'+units(soldUnits)+deltaMarkup(unitsDelta)+'<span class="cell-note">чистых '+units(row.financial_net_units)+'</span></td><td class="returns-units-col">'+units(returnUnits)+'<span class="cell-note">'+(physUnits==null?'физ. возвраты: нет данных':'+'+units(physUnits)+' на склад · +'+units(writtenOff)+' утиль')+'</span></td><td>'+(returnPct==null?"—":(returnPct*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%")+'</td><td>'+money0(row.marketplace_expenses)+'<span class="cell-note">'+(Number(row.sales)>0&&numberOrNull(row.marketplace_expenses)!=null?(Math.abs(Number(row.marketplace_expenses))/Number(row.sales)*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+'% от продаж':'—')+'</span></td><td class="'+signedClass(row.result_without_compensation)+'">'+money0(row.result_without_compensation)+'<span class="cell-note">'+(Number(row.sales)>0&&numberOrNull(row.result_without_compensation)!=null?(Number(row.result_without_compensation)/Number(row.sales)*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+'% от продаж':'—')+'</span></td><td class="direct-yield-col">'+(splitOk?money0(directPerUnit)+deltaMarkup(directDelta,approx)+'<span class="cell-note">на '+units(netU)+' чист.: '+money0(perUnit(directResultAmount(row),netU))+'</span>':'—<span class="cell-note">нет деления на прямые и общие расходы</span>')+'</td><td class="all-expenses-col">'+money0(allPerUnit)+deltaMarkup(delta,approx)+'<span class="cell-note">на '+units(netU)+' чист.: '+money0(perUnit(numberOrNull(row.result_without_compensation),netU))+'</span></td><td>'+money0(row.compensation)+'</td><td>'+money0(resultWithCompPerUnit)+'</td><td class="result-col '+signedClass(row.result_after_cogs)+'">'+money0(afterCogsPerUnit)+'</td></tr>';}).join("");
 $("#skuEmpty").hidden=rows.length>0;{const note=$("#perUnitNote");if(note){note.hidden=(monthClosed()&&splitAvailable())||!state.payload;note.textContent=(monthClosed()?"":"Месяц не закрыт: возвраты и утиль могут быть неполными, Δ в колонках «на штуку» приблизительная (≈). ")+(splitAvailable()?"":"В данных за этот месяц расходы приходят одной суммой по статье, без деления на прямые и общие, поэтому «После прямых» не показывается.");}}
 $text("#skuEmpty",source.length?"Нет товаров по выбранным условиям. Измените поиск или режим анализа.":state.payload?.metadata.finance_data_status==="WAITING_FOR_FINANCE"?"Finance за этот месяц ещё не поступил.":"Для выбранной площадки нет товарных данных.");
}

function setCategories(){
 const current=$("#categoryFilter").value,rows=state.payload?.sku_rows??[],categories=new Map();
 for(const row of rows)if(row.category_id!=null||row.category)categories.set(String(row.category_id??row.category),row.category_name??row.category??String(row.category_id));
 $("#categoryFilter").innerHTML=categories.size?'<option value="">Все категории</option>'+[...categories].map(([id,label])=>'<option value="'+e(id)+'">'+e(label)+'</option>').join(""):'<option value="">Все товары</option>';
 $("#categoryFilter").disabled=!categories.size;
 if([...$("#categoryFilter").options].some(option=>option.value===current))$("#categoryFilter").value=current;
}

function drawerTabs(selected){
 const available=new Set(["ALL",...availableMarkets()]);
 return MARKETPLACES.filter(item=>available.has(item.id)).map(item=>'<button type="button" data-product-market="'+item.id+'" aria-pressed="'+(item.id===selected)+'">'+e(item.label)+'</button>').join("");
}
function dlRows(rows){return '<dl class="detail-list">'+rows.map(([name,value,note])=>'<div><dt>'+e(name)+'</dt><dd><span>'+e(value)+'</span>'+(note?'<small>'+e(note)+'</small>':"")+'</dd></div>').join("")+'</dl>';}
function renderDrawer(){
 const identity=state.product;if(!identity)return;
 $("#drawerTabs").innerHTML=drawerTabs(state.productMarket);
 const selectedPayload=selectPayload(state.bundle,tenant(),month(),state.productMarket);
 if(!selectedPayload){$("#drawerBody").innerHTML='<div class="empty drawer-empty"><h3>Площадка ещё не подключена</h3><p>Для выбранного периода нет финансового слоя.</p></div>';return;}
 const row=selectedPayload.sku_rows.find(item=>item.canonical_sku===identity.canonical_sku);
 if(!row){$("#drawerBody").innerHTML='<div class="empty drawer-empty">В выбранной площадке нет данных по этому товару.</div>';return;}
 const statuses=[["Себестоимость",row.cost_status==="COMPLETE"?"Полная":row.cost_status==="NOT_APPLICABLE"?"Не применима":"Недоступна"],["Компенсации",row.compensation_status==="PENDING"?"Ожидаются":row.compensation_status==="COMPLETE"?"Завершены":"Недоступны"]];
 const turnover=Number(row.net_sales??0),incomeUnits=Number(row.income_units??row.financial_net_units??0),financialNetUnits=Number(row.financial_net_units??0),resultMp=Number(row.result_without_compensation??0),comp=Number(row.compensation??0);
 const returnedAndWrittenOffUnits=Number(row.physical_returned_units??0)+Number(row.written_off_units??0);
 const expensePct=value=>turnover>0&&value!=null?(Math.abs(Number(value))/turnover*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"% от чистых продаж":"";
 const receivedPerUnit=incomeUnits>0?resultMp/incomeUnits:null;
 const receivedPerUnitWithoutReturnsAndDisposal=financialNetUnits>0?resultMp/financialNetUnits:null;
 const compensationPerReturnedDisposedUnit=returnedAndWrittenOffUnits>0?comp/returnedAndWrittenOffUnits:null;
 const receivedWithCompPerUnit=incomeUnits>0?(resultMp+comp)/incomeUnits:null;
 const afterCogsPerUnit=incomeUnits>0&&row.result_after_cogs!=null?Number(row.result_after_cogs)/incomeUnits:null;
 const detail=[["Продажи",money(row.sales)],["Возвраты, ₽ (Finance)",money(row.returns)],["Выручка нетто",money(row.net_sales)],["Продано, шт (операции продаж)",units(row.financial_sale_units??row.sale_units_display)],["Возвраты, шт (операции возвратов)",units(row.financial_return_units??row.return_writeoff_units)],["Из них физ. возвраты / списания",units(row.physical_returned_units)+" / "+units(row.written_off_units)],["Чистые фин. единицы",units(row.financial_net_units)],["Количество для доходности, шт",units(row.income_units),"Чистые продажи + складские возвраты + утиль"],["Компенсировано, шт",units(row.compensated_units)],["Комиссия",money(row.commission),expensePct(row.commission)],["Логистика",money(row.logistics),expensePct(row.logistics)],["Хранение",money(row.storage),expensePct(row.storage)],["Продвижение",money(row.promotion),expensePct(row.promotion)],["Прочие расходы",money(row.other),expensePct(row.other)],["Всего расходы МП",money(row.marketplace_expenses),expensePct(row.marketplace_expenses)],["Результат без компенсаций",money(row.result_without_compensation)],["Получаем / шт после расходов",money(receivedPerUnit)],["Получаем / шт без возвратов и утиля",money(receivedPerUnitWithoutReturnsAndDisposal),"Результат без компенсаций / чистые фин. единицы"],["Компенсации",money(row.compensation),row.compensation_status==="PENDING"?"Ожидается завершение слоя":""],["Компенсация / возврат + утиль, шт",money(compensationPerReturnedDisposedUnit),returnedAndWrittenOffUnits>0?"Компенсации / (физ. возвраты + списания), "+units(returnedAndWrittenOffUnits):"Нет возвратов/утиля"],["Получаем / шт после расходов + компенсации",money(receivedWithCompPerUnit)],["Себестоимость единицы",money(row.unit_cost)],["COGS",money(row.cogs)],["После COGS / шт",money(afterCogsPerUnit),"С учетом компенсаций, без бизнес-расходов"]];
 const timeline=monthsBefore(month()).map(value=>{const p=selectPayload(state.bundle,tenant(),value,state.productMarket);const found=p?.sku_rows.find(item=>item.product_id===row.product_id&&item.canonical_sku===row.canonical_sku);const foundUnits=Number(found?.financial_net_units??0),perUnit=found&&foundUnits>0&&found.result_after_cogs!=null?Number(found.result_after_cogs)/foundUnits:null;return '<div><span>'+e(shortMonth(value))+'</span><strong>'+money(found?.result_after_cogs)+'</strong><small>'+(p?.metadata.marketplace_close_status==="LIVE"?"LIVE · неполный":found?"Закрытый месяц":"Нет истории")+'</small>'+(found?'<small>После всех расходов + компенсации / шт: <b>'+money(perUnit)+'</b></small>':"")+'</div>';}).join("");

 const bridgeRows=rows=>'<div class="bridge-list">'+rows.map(([name,value,kind,note])=>'<div class="'+(kind||"")+'"><span>'+e(name)+(note?'<small>'+e(note)+'</small>':"")+'</span><b>'+e(value)+'</b></div>').join("")+'</div>';
 const bSold=numberOrNull(row.financial_sale_units??row.sale_units_display),bRet=numberOrNull(row.financial_return_units??row.return_writeoff_units),bNet=numberOrNull(row.financial_net_units),bPhys=numberOrNull(row.physical_returned_units),bWo=numberOrNull(row.written_off_units),bInc=yieldUnits(row);
 const unitsBlock='<h3>Единицы: что в знаменателе</h3>'+bridgeRows([["Операции продаж",units(bSold)],["− операции возвратов",bRet==null?"—":"−"+units(Math.abs(bRet)),"minus"],["Чистые продажи",units(bNet),"total"],["+ физические возвраты на склад",bPhys==null?"нет данных":units(bPhys)],["+ утиль",units(bWo)],["Единицы для «на штуку»",units(bInc),"total"]])+(opsReady(row)?"":'<p class="bridge-note">Физические возвраты и утиль за этот месяц ещё не поступили. Знаменатель вырастет, «на штуку» пересчитается.</p>');
 const bNetSales=numberOrNull(row.net_sales),bDirect=sumGroups(row,"direct"),bShared=sumGroups(row,"allocated_shared"),bAfterDirect=directResultAmount(row),bAll=numberOrNull(row.result_without_compensation);
 const bAdjust=bAfterDirect!=null&&bAll!=null?bAll-bAfterDirect-(bShared??0):null;
 const bSplit=splitAvailable();
 const moneyRows=bSplit?[["Чистая выручка",money(bNetSales)],["− прямые расходы по артикулу",money(bDirect),"minus","комиссия, логистика, хранение, продвижение, прочие"],["После прямых",money(bAfterDirect),"total"],["− общие расходы, разнесённые на артикул",money(bShared),"minus"]]:[["Чистая выручка",money(bNetSales)],["− все расходы маркетплейса",money(bNetSales!=null&&bAll!=null?bAll-bNetSales:null),"minus","одной суммой, без деления на прямые и общие"]];
 if(bSplit&&bAdjust!=null&&Math.abs(bAdjust)>1)moneyRows.push(["Прочие корректировки",money(bAdjust),"minus"]);
 moneyRows.push(["После всех расходов, без компенсаций",money(bAll),"total"]);
 if(bSplit)moneyRows.push(["После прямых / шт",money(perUnit(bAfterDirect,bInc)),"",bNet?"на чистых "+units(bNet)+": "+money(perUnit(bAfterDirect,bNet)):""]);
 moneyRows.push(["После всех расходов / шт",money(perUnit(bAll,bInc)),"",bNet?"на чистых "+units(bNet)+": "+money(perUnit(bAll,bNet)):""]);
 const moneyBlock='<h3>Рубли: от выручки до результата</h3>'+bridgeRows(moneyRows)+(bSplit?"":'<p class="bridge-note">В данных за этот месяц расходы приходят одной суммой по статье, без деления на прямые и общие. «После прямых» посчитать нельзя.</p>');
 const unitKpis=[
  ["После расходов / шт",receivedPerUnit,"По количеству для доходности"],
  ["Без возвратов и утиля / шт",receivedPerUnitWithoutReturnsAndDisposal,"По чистым фин. единицам"],
  ["После расходов + компенсации / шт",receivedWithCompPerUnit,"С учетом компенсаций"],
  ["После COGS / шт",afterCogsPerUnit,"С компенсациями, без бизнес-расходов"]
 ];
 $("#drawerBody").innerHTML='<p class="drawer-scope">'+e(monthLabel(month()))+' · '+(state.productMarket==="ALL"?"Все доступные площадки":MARKETPLACES.find(item=>item.id===state.productMarket)?.label??state.productMarket)+'</p>'+unitsBlock+moneyBlock+'<div class="drawer-unit-kpis">'+unitKpis.map(([label,value,note])=>'<article><span>'+e(label)+'</span><strong class="'+signedClass(value)+'">'+money(value)+'</strong><small>'+e(note)+'</small></article>').join("")+'<article class="drawer-comp-kpi"><span>Компенсация / возврат + утиль, шт</span><strong>'+money(compensationPerReturnedDisposedUnit)+'</strong><small>'+(returnedAndWrittenOffUnits>0?e("Компенсации / "+units(returnedAndWrittenOffUnits)+" возвратов и списаний"):"Нет возвратов/утиля")+'</small></article><article class="drawer-result drawer-result-compact"><span>После себестоимости</span><strong class="'+signedClass(row.result_after_cogs)+'">'+money(row.result_after_cogs)+'</strong><small>Промежуточный результат</small></article></div><div class="drawer-status">'+statuses.map(([key,value])=>'<span>'+key+': <strong>'+value+'</strong></span>').join("")+'</div><h3>Экономика товара</h3>'+dlRows(detail)+'<h3>По площадкам и кабинетам</h3><div class="table-scroll"><table class="allocation-table"><thead><tr><th>Площадка · кабинет</th><th>Продано, шт</th><th>Продажи, ₽</th></tr></thead><tbody>'+(row.source_rows??[row]).map(source=>'<tr><td>'+e((MARKETPLACES.find(item=>item.id===source.marketplace)?.label??source.marketplace)+' · '+(source.cabinet??source.account_id??'—'))+'</td><td>'+units(source.financial_sale_units??source.sale_units_display)+'</td><td>'+money(source.sales,false)+'</td></tr>').join('')+'</tbody></table></div><h3>Прямые и распределённые расходы</h3><div class="table-scroll"><table class="allocation-table"><thead><tr><th>Статья</th><th>Прямые</th><th>Shared</th></tr></thead><tbody>'+GROUPS.map(([key,label])=>'<tr><td>'+label+'</td><td>'+money(row.expense_structure?.direct?.[key])+'</td><td>'+money(row.expense_structure?.allocated_shared?.[key])+'</td></tr>').join("")+'</tbody></table></div><h3>Результат по месяцам</h3><div class="product-timeline">'+timeline+'</div>';
}
function openProduct(sku){const row=state.payload?.sku_rows.find(item=>String(item.canonical_sku)===String(sku));if(!row)return;state.product=row;state.productMarket=state.market;$text("#drawerTitle",row.product_name||row.article||row.canonical_sku);$text("#drawerSku",(row.article||"")+" · SKU "+row.canonical_sku);renderDrawer();$("#productDrawer").showModal();document.body.classList.add("drawer-open");$(".drawer-scroll").scrollTop=0;}

function renderLoadStatus(){
 const selected=state.bundle?.tenant_status?.[tenant()];
 const scope=state.bundle?.scope_status?.[[tenant(),month(),state.market].join("|")];
 const failed=Object.entries(state.bundle?.tenant_status??{}).filter(([,value])=>value.status==="error").map(([id])=>TENANTS[id]?.label??id);
 const selectedError=scope?.status==="error"?scope:selected?.status==="error"?selected:null;
 $("#reviewNote").classList.toggle("error",Boolean(selectedError));
 if(!selected||selected.status==="idle"||selected.status==="loading"||scope?.status==="loading")$text("#reviewNote","Загружаем данные "+(TENANTS[tenant()]?.label??tenant())+"…");
 else if(selectedError)$text("#reviewNote",selectedError.message);
 else $text("#reviewNote","Актуальные данные Monthly · "+dateText(selected.refreshed_at)+(failed.length?" · Недоступно: "+failed.join(", "):""));
 $("#accessNote").hidden=!selectedError;
 if(selectedError)$text("#accessNote",selectedError.accessDenied?"Нет доступа к этому кабинету для вашей учётной записи.":"Выбранный срез "+(TENANTS[tenant()]?.label??tenant())+" временно недоступен. Остальные организации и площадки работают независимо.");
}
function render(){
 state.payload=selectPayload(state.bundle,tenant(),month(),state.market);renderLoadStatus();updateUrl();renderHeader();renderSummary();renderAllocation();renderComparison();renderExpenses();renderBridge();setCategories();renderProducts();
}

$("#tenantSelect").innerHTML=Object.entries(TENANTS).map(([id,config])=>'<option value="'+e(id)+'">'+e(config.label)+'</option>').join("");
$("#monthSelect").innerHTML=MONTHS.map(value=>'<option value="'+value+'">'+e(monthLabel(value))+'</option>').join("");
$("#marketSelect").innerHTML=MARKETPLACES.map(item=>'<option value="'+item.id+'">'+e(item.label)+'</option>').join("");
const returnsHeader=$("#products thead th:nth-child(4)");if(returnsHeader){returnsHeader.classList.add("returns-units-col");returnsHeader.innerHTML="Возвраты / списания<span>операции · + склад и утиль</span>";}
$("#tenantSelect").value=TENANTS[query.get("tenant")]?query.get("tenant"):"W";
// Organization picker only when the user can see more than one organization.
$("#tenantControl").hidden=Object.keys(TENANTS).length<2;
$("#monthSelect").value=MONTHS.includes(query.get("month"))?query.get("month"):(MONTHS[1]||MONTHS[0]);
state.comparisonMonth=MONTHS.includes(query.get("compare"))&&query.get("compare")<month()?query.get("compare"):(comparisonCandidates()[0]??null);
state.market=MARKETPLACES.some(item=>item.id===query.get("marketplace"))?query.get("marketplace"):"ALL";
$("#marketSelect").value=state.market;
let loader;
async function ensureSelection(){
 const months=[month(),comparisonMonth()].filter(Boolean);
 await loader.loadTenant(tenant(),months);
 if(state.market!=="ALL")await Promise.allSettled(months.map(value=>loader.loadScope(tenant(),value,state.market)));
}
$("#tenantSelect").addEventListener("change",async()=>{state.focus="all";render();await ensureSelection();render();});
$("#monthSelect").addEventListener("change",async()=>{state.focus="all";state.comparisonMonth=comparisonCandidates()[0]??null;render();await ensureSelection();render();});
$("#comparisonSelect").addEventListener("change",async()=>{state.focus="all";state.comparisonMonth=$("#comparisonSelect").value||null;render();await ensureSelection();render();});
$("#marketSelect").addEventListener("change",async()=>{state.market=$("#marketSelect").value;state.focus="all";render();await ensureSelection();render();});
$("#skuSearch").addEventListener("input",renderProducts);
for(const id of ["#categoryFilter","#sortSelect"])$(id).addEventListener("change",renderProducts);
$("#drawerClose").addEventListener("click",()=>$("#productDrawer").close());
$("#productDrawer").addEventListener("click",event=>{
 const dialog=event.currentTarget;
 const rect=dialog.getBoundingClientRect();
 const outside=event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
 if(outside)dialog.close();
});
$("#productDrawer").addEventListener("close",()=>document.body.classList.remove("drawer-open"));
document.addEventListener("click",async event=>{
 const focus=event.target.closest("[data-focus]");if(focus&&!focus.disabled){state.focus=focus.dataset.focus;renderProducts();$("#products").scrollIntoView({behavior:"smooth",block:"start"});return;}
 const productMarket=event.target.closest("[data-product-market]");if(productMarket){
   const nextMarket=productMarket.dataset.productMarket;
   if(nextMarket!=="ALL")await loader.loadScope(tenant(),month(),nextMarket).catch(()=>null);
   const nextPayload=selectPayload(state.bundle,tenant(),month(),nextMarket);
   const nextRow=nextPayload?.sku_rows?.find(item=>String(item.canonical_sku)===String(state.product?.canonical_sku));
   state.productMarket=nextMarket;
   if(nextRow)state.product=nextRow;
   renderDrawer();return;
 }
 const sku=event.target.closest("[data-sku]");if(sku){openProduct(sku.dataset.sku);}
});
render();
loader=createScopeLoader({tenantIds:Object.keys(TENANTS),fetcher:authedFetch,onUpdate:bundle=>{
 state.bundle=bundle;
 render();
}});
state.bundle=loader.bundle;
await ensureSelection();

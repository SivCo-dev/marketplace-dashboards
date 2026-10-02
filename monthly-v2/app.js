import {TENANTS,MONTHS,MARKETPLACES,GROUPS} from "./config.js";
import {escapeHtml as e,money,units,rate,pct,monthLabel,shortMonth,validatePayload,selectPayload,expenseOnly,filterRows,monthsBefore,numberOrNull} from "./core.js";
import {openReview} from "./shadow-access.js";

const $=s=>document.querySelector(s);
const state={bundle:null,market:"ALL",payload:null,product:null,productMarket:"ALL",focus:"all"};
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
const previousPayload=()=>selectPayload(state.bundle,tenant(),previousMonth(month()),state.market);
const comparisonReady=()=>Boolean(state.payload&&previousPayload()&&state.payload.metadata.marketplace_close_status==="CLOSED"&&previousPayload().metadata.marketplace_close_status==="CLOSED");
const metricRate=(p,key)=>rate(p?.financial_economics?.[key],p?.financial_economics?.sales);

function updateUrl(){const url=new URL(location.href);url.searchParams.set("tenant",tenant());url.searchParams.set("month",month());url.searchParams.set("marketplace",state.market);history.replaceState(null,"",url);}

function renderHeader(){
 const p=state.payload,m=p?.metadata??{};
 $text("#pageTitle",tenant()+" · "+monthLabel(month()).replace(/^./,c=>c.toUpperCase()));
 $text("#monthStatus",p?(m.marketplace_close_status==="CLOSED"?"Закрыт · ревизия "+m.base_close_revision:"LIVE · текущий месяц"):"Нет данных");
 $("#monthStatus").className="status-pill "+(m.marketplace_close_status==="CLOSED"?"closed":m.marketplace_close_status==="LIVE"?"live":"empty");
 const ready=comparisonReady(),prev=previousMonth(month());
 $("#comparisonSelect").innerHTML='<option>'+(ready?"к "+shortMonth(prev):"Нет сопоставимой истории")+'</option>';
 $("#comparisonSelect").disabled=!ready;
 $text("#bridgeMarket",state.market==="ALL"?"Ozon · доступно":MARKETPLACES.find(item=>item.id===state.market)?.label??state.market);
 $text("#footerCoverage",state.market==="ALL"?"Доступно: Ozon · 1 из 3 площадок":p?"Данные Ozon":"Площадка не подключена");
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
  ["₽","Валовые продажи",f.sales,p?.sku_rows?.length?`${p.sku_rows.length} SKU`:"—",deltaText(f.sales,pf.sales)],
  ["↩","Возвраты, ₽ (Finance)",f.returns,pct(rate(f.returns,f.sales))+" от валовых",deltaText(metricRate(p,"returns"),metricRate(prev,"returns"),"pp"),"danger"],
  ["▣","Чистые продажи",f.net_sales,pct(rate(f.net_sales,f.sales))+" от валовых",deltaText(f.net_sales,pf.net_sales)],
  ["≋","Расходы маркетплейса",f.marketplace_expenses,pct(rate(f.marketplace_expenses,f.sales))+" от продаж",deltaText(metricRate(p,"marketplace_expenses"),metricRate(prev,"marketplace_expenses"),"pp"),"danger"],
  ["▥","Результат МП",f.result_without_compensation,pct(rate(f.result_without_compensation,f.sales))+" от продаж",deltaText(metricRate(p,"result_without_compensation"),metricRate(prev,"result_without_compensation"),"pp"),"positive"],
  ["◫","После COGS",f.result_after_cogs,pct(rate(f.result_after_cogs,f.sales))+" от продаж",deltaText(metricRate(p,"result_after_cogs"),metricRate(prev,"result_after_cogs"),"pp"),signedClass(f.result_after_cogs)]
 ];
 $("#overview").innerHTML=kpis.map(([icon,label,value,note,delta,tone="neutral"])=>'<article class="kpi '+tone+'"><div class="kpi-label"><i>'+icon+'</i><span>'+e(label)+'</span></div><strong>'+money(value)+'</strong><small>'+e(note)+'</small><em class="'+(delta.startsWith("↑")?"up":delta.startsWith("↓")?"down":"unavailable")+'">'+e(delta)+'</em></article>').join("");
 $("#contextLine").innerHTML=p?'<span><i class="status-dot"></i>'+e(m.marketplace_close_status==="CLOSED"?"База месяца зафиксирована":"Данные месяца продолжают поступать")+'</span><span>Компенсации: '+e(m.compensation_status==="PENDING"?"ожидаются":m.compensation_status==="COMPLETE"?"завершены":"нет данных")+'</span><span>Бизнес-расходы: '+e(m.business_expense_status==="NOT_APPLICABLE"?"не применяются":"не доступны")+'</span>':"";
 $text("#compensationBadge",p?"Компенсации: "+money(f.compensation)+" · "+(m.compensation_status==="PENDING"?"ожидаются":"статус "+m.compensation_status):"");
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
 $("#allocationBar").innerHTML='<div class="stack">'+parts.map(([,label,value,tone])=>'<span class="'+tone+'" style="width:'+clamp(value)+'%" title="'+e(label)+': '+pct(value)+'"></span>').join("")+'</div><div class="stack-labels">'+parts.map(([,label,value,tone])=>'<span class="'+tone+'"><strong>'+((value??0)/100*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+' ₽</strong><small>'+e(label)+'</small></span>').join("")+'</div>';
 $("#allocationCards").innerHTML=parts.map(([,label,value,tone])=>'<div class="allocation-card '+tone+'"><i></i><span><strong>'+((value??0)/100*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+' ₽</strong><small>'+e(label)+'</small><b>'+pct(value)+'</b></span></div>').join("");
}

function renderComparison(){
 const p=state.payload,prev=previousPayload(),ready=comparisonReady();
 const rows=[["Комиссия","commission"],["Продвижение","promotion"],["Логистика","logistics"],["Возвраты","returns"],["Результат МП","result_without_compensation"]];
 const previousLabel=ready?shortMonth(previousMonth(month())):"Прошлый месяц";
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

function productDelta(row){
 if(!comparisonReady())return null;
 const previous=previousPayload()?.sku_rows?.find(item=>(row.product_id!=null&&item.product_id===row.product_id)||String(item.canonical_sku)===String(row.canonical_sku));
 const currentValue=numberOrNull(row.result_after_cogs),oldValue=numberOrNull(previous?.result_after_cogs);
 if(currentValue==null||oldValue==null||oldValue===0)return null;
 return (currentValue-oldValue)/Math.abs(oldValue)*100;
}

function focusMembers(source,focus){
 if(focus==="leaders")return [...source].filter(row=>numberOrNull(row.result_after_cogs)!=null).sort((a,b)=>b.result_after_cogs-a.result_after_cogs).slice(0,12);
 if(focus==="expenses")return [...source].filter(row=>numberOrNull(row.marketplace_expenses)!=null&&row.marketplace_expenses!==0).sort((a,b)=>Math.abs(b.marketplace_expenses)-Math.abs(a.marketplace_expenses)).slice(0,12);
 if(focus==="negative")return source.filter(row=>numberOrNull(row.result_after_cogs)!=null&&row.result_after_cogs<0);
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
 $("#skuBody").innerHTML=rows.map(row=>{const delta=productDelta(row);const soldUnits=Number(row.sale_units_display??row.financial_sale_units??0),returnUnits=Number(row.return_writeoff_units??row.financial_return_units??0),netUnits=Number(row.financial_net_units??0),returnPct=soldUnits>0?returnUnits/soldUnits:null,resultMp=Number(row.result_without_compensation??0),comp=Number(row.compensation??0),resultWithComp=resultMp+comp,resultPerUnit=netUnits>0?resultMp/netUnits:null,resultWithCompPerUnit=netUnits>0?resultWithComp/netUnits:null,afterCogsPerUnit=netUnits>0&&row.result_after_cogs!=null?Number(row.result_after_cogs)/netUnits:null;return '<tr><td><button class="product-link" data-sku="'+e(row.canonical_sku)+'"><span class="product-monogram">'+e((row.article||row.canonical_sku||"?").slice(0,2))+'</span><span><strong>'+e(row.article||row.canonical_sku)+'</strong><small>'+e(row.product_name||"Название не передано")+'</small><small>Продано: '+units(soldUnits)+' · Возвраты/списания: '+units(returnUnits)+'</small>'+(expenseOnly(row)?'<em>Только расходы</em>':"")+'</span><b>›</b></button></td><td>'+money(row.sales,false)+'</td><td>'+(returnPct==null?"—":(returnPct*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%")+'</td><td>'+money(row.marketplace_expenses,false)+'</td><td class="'+signedClass(row.result_without_compensation)+'">'+money(row.result_without_compensation,false)+'</td><td>'+money(resultPerUnit,false)+'</td><td class="'+(delta==null?"delta-na":delta>=0?"delta-down":"delta-up")+'">'+(delta==null?"—":(delta>0?"↑ +":"↓ −")+Math.abs(delta).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%")+'</td><td>'+money(row.compensation,false)+'</td><td>'+money(resultWithCompPerUnit,false)+'</td><td class="result-col '+signedClass(row.result_after_cogs)+'">'+money(afterCogsPerUnit,false)+'</td></tr>';}).join("");
 $("#skuEmpty").hidden=rows.length>0;
 $text("#skuEmpty",source.length?"Нет товаров по выбранным условиям. Измените поиск или режим анализа.":state.payload?.metadata.finance_data_status==="WAITING_FOR_FINANCE"?"Finance за этот месяц ещё не поступил.":"Для выбранной площадки нет товарных данных.");
}

function setCategories(){
 const current=$("#categoryFilter").value,rows=state.payload?.sku_rows??[],categories=new Map();
 for(const row of rows)if(row.category_id!=null||row.category)categories.set(String(row.category_id??row.category),row.category_name??row.category??String(row.category_id));
 $("#categoryFilter").innerHTML=categories.size?'<option value="">Все категории</option>'+[...categories].map(([id,label])=>'<option value="'+e(id)+'">'+e(label)+'</option>').join(""):'<option value="">Все товары</option>';
 $("#categoryFilter").disabled=!categories.size;
 if([...$("#categoryFilter").options].some(option=>option.value===current))$("#categoryFilter").value=current;
}

function drawerTabs(selected){return MARKETPLACES.map(item=>'<button type="button" data-product-market="'+item.id+'" aria-pressed="'+(item.id===selected)+'">'+e(item.label)+'</button>').join("");}
function dlRows(rows){return '<dl class="detail-list">'+rows.map(([name,value,note])=>'<div><dt>'+e(name)+(note?'<small>'+e(note)+'</small>':"")+'</dt><dd>'+e(value)+'</dd></div>').join("")+'</dl>';}
function renderDrawer(){
 const row=state.product;if(!row)return;
 $("#drawerTabs").innerHTML=drawerTabs(state.productMarket);
 if(state.productMarket!=="ALL"&&state.productMarket!=="OZON"){$("#drawerBody").innerHTML='<div class="empty drawer-empty"><h3>Площадка ещё не подключена</h3><p>Экономика товара появится после подключения источника и сопоставления SKU.</p></div>';return;}
 const statuses=[["Себестоимость",row.cost_status==="COMPLETE"?"Полная":row.cost_status==="NOT_APPLICABLE"?"Не применима":"Недоступна"],["Компенсации",row.compensation_status==="PENDING"?"Ожидаются":row.compensation_status==="COMPLETE"?"Завершены":"Недоступны"]];
 const detail=[["Продажи",money(row.sales)],["Возвраты, ₽ (Finance)",money(row.returns)],["Выручка нетто",money(row.net_sales)],["Продано, шт",units(row.sale_units_display??row.financial_sale_units)],["Возвраты/списания, шт",units(row.return_writeoff_units??row.financial_return_units)],["Из них физ. возвраты / списания",units(row.physical_returned_units)+" / "+units(row.written_off_units)],["Чистые фин. единицы",units(row.financial_net_units)],["Компенсировано, шт",units(row.compensated_units)],["Комиссия",money(row.commission)],["Логистика",money(row.logistics)],["Хранение",money(row.storage)],["Продвижение",money(row.promotion)],["Прочие расходы",money(row.other)],["Всего расходы МП",money(row.marketplace_expenses)],["Результат без компенсаций",money(row.result_without_compensation)],["Компенсации",money(row.compensation),row.compensation_status==="PENDING"?"Ожидается завершение слоя":""],["Себестоимость единицы",money(row.unit_cost)],["COGS",money(row.cogs)],["Результат МП / фин. ед.",money(row.result_without_compensation_per_financial_unit)]];
 const timeline=monthsBefore(month()).map(value=>{const p=selectPayload(state.bundle,tenant(),value);const found=p?.sku_rows.find(item=>item.product_id===row.product_id&&item.canonical_sku===row.canonical_sku);return '<div><span>'+e(shortMonth(value))+'</span><strong>'+money(found?.result_after_cogs)+'</strong><small>'+(p?.metadata.marketplace_close_status==="LIVE"?"LIVE · неполный":found?"Закрытый месяц":"Нет истории")+'</small></div>';}).join("");
 $("#drawerBody").innerHTML='<p class="drawer-scope">'+e(monthLabel(month()))+' · '+(state.productMarket==="ALL"?"Все доступные площадки · только Ozon":"Ozon")+'</p><div class="drawer-result"><span>После себестоимости</span><strong class="'+signedClass(row.result_after_cogs)+'">'+money(row.result_after_cogs)+'</strong><small>Промежуточный результат</small></div><div class="drawer-status">'+statuses.map(([key,value])=>'<span>'+key+': <strong>'+value+'</strong></span>').join("")+'</div><h3>Экономика товара</h3>'+dlRows(detail)+'<h3>Прямые и распределённые расходы</h3><div class="table-scroll"><table class="allocation-table"><thead><tr><th>Статья</th><th>Прямые</th><th>Shared</th></tr></thead><tbody>'+GROUPS.map(([key,label])=>'<tr><td>'+label+'</td><td>'+money(row.expense_structure?.direct?.[key])+'</td><td>'+money(row.expense_structure?.allocated_shared?.[key])+'</td></tr>').join("")+'</tbody></table></div><h3>Результат по месяцам</h3><div class="product-timeline">'+timeline+'</div>';
}
function openProduct(sku){const row=state.payload?.sku_rows.find(item=>String(item.canonical_sku)===String(sku));if(!row)return;state.product=row;state.productMarket=state.market==="OZON"?"OZON":"ALL";$text("#drawerTitle",row.product_name||row.article||row.canonical_sku);$text("#drawerSku",(row.article||"")+" · SKU "+row.canonical_sku);renderDrawer();$("#productDrawer").showModal();document.body.classList.add("drawer-open");$(".drawer-scroll").scrollTop=0;}

function render(){
 state.payload=selectPayload(state.bundle,tenant(),month(),state.market);updateUrl();renderHeader();renderSummary();renderAllocation();renderComparison();renderExpenses();renderBridge();setCategories();renderProducts();
}

$("#tenantSelect").innerHTML=Object.entries(TENANTS).map(([id,config])=>'<option value="'+e(id)+'">'+e(config.label)+'</option>').join("");
$("#monthSelect").innerHTML=MONTHS.map(value=>'<option value="'+value+'">'+e(monthLabel(value))+'</option>').join("");
$("#marketSelect").innerHTML=MARKETPLACES.map(item=>'<option value="'+item.id+'">'+e(item.label)+'</option>').join("");
$("#tenantSelect").value=TENANTS[query.get("tenant")]?query.get("tenant"):"W";
$("#monthSelect").value=MONTHS.includes(query.get("month"))?query.get("month"):"2026-09";
state.market=MARKETPLACES.some(item=>item.id===query.get("marketplace"))?query.get("marketplace"):"ALL";
$("#marketSelect").value=state.market;
for(const id of ["#tenantSelect","#monthSelect"])$(id).addEventListener("change",()=>{state.focus="all";render();});
$("#marketSelect").addEventListener("change",()=>{state.market=$("#marketSelect").value;state.focus="all";render();});
$("#skuSearch").addEventListener("input",renderProducts);
for(const id of ["#categoryFilter","#sortSelect"])$(id).addEventListener("change",renderProducts);
$("#drawerClose").addEventListener("click",()=>$("#productDrawer").close());
$("#productDrawer").addEventListener("close",()=>document.body.classList.remove("drawer-open"));
document.addEventListener("click",event=>{
 const focus=event.target.closest("[data-focus]");if(focus&&!focus.disabled){state.focus=focus.dataset.focus;renderProducts();$("#products").scrollIntoView({behavior:"smooth",block:"start"});return;}
 const productMarket=event.target.closest("[data-product-market]");if(productMarket){state.productMarket=productMarket.dataset.productMarket;renderDrawer();return;}
 const sku=event.target.closest("[data-sku]");if(sku){openProduct(sku.dataset.sku);}
});
render();
try{
 state.bundle=await openReview();
 if(state.bundle){state.bundle.payloads.forEach(validatePayload);$text("#reviewNote","Срез для продуктового ревью · "+dateText(state.bundle.exported_at)+" · данные не обновляются в реальном времени");render();}
 else{$text("#reviewNote","Предпросмотр Monthly · финансовые данные доступны по приватной ссылке");$("#accessNote").hidden=false;}
}catch(error){$text("#reviewNote",error.message);$("#reviewNote").classList.add("error");$("#accessNote").hidden=false;}

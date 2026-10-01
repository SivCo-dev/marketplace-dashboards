import {TENANTS,MONTHS,MARKETPLACES,GROUPS} from "./config.js";
import {escapeHtml as e,money,units,rate,pct,monthLabel,shortMonth,validatePayload,selectPayload,expenseOnly,filterRows,monthsBefore,numberOrNull} from "./core.js";
import {openReview} from "./shadow-access.js";
const $=s=>document.querySelector(s);
const state={bundle:null,market:"ALL",payload:null,product:null,productMarket:"ALL",expense:"commission"};
const query=new URLSearchParams(location.search);
const dateText=v=>v?new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"})+" МСК":"—";
const tenant=()=>$("#tenantSelect").value;
const month=()=>$("#monthSelect").value;
const finance=()=>state.payload?.financial_economics??{};
const t=(id,value)=>{$(id).textContent=value;};
const signedClass=v=>numberOrNull(v)==null?"":Number(v)<0?"negative":"positive";
const tabs=(selected,attr)=>MARKETPLACES.map(m=>'<button type="button" '+attr+'="'+m.id+'" aria-pressed="'+(m.id===selected)+'">'+e(m.label)+(m.id==="WB"||m.id==="YANDEX"?'<span class="tab-dot"></span>':"")+'</button>').join("");
function readScope(){return selectPayload(state.bundle,tenant(),month(),state.market);}
function updateUrl(){const url=new URL(location.href);url.searchParams.set("tenant",tenant());url.searchParams.set("month",month());url.searchParams.set("marketplace",state.market);history.replaceState(null,"",url);}
function renderSummary(){
 const p=state.payload,f=finance(),m=p?.metadata??{},waiting=m.finance_data_status==="WAITING_FOR_FINANCE";
 t("#heroResult",money(f.result_after_cogs));$("#heroResult").classList.toggle("loss",numberOrNull(f.result_after_cogs)!=null&&f.result_after_cogs<0);
 t("#heroMargin",rate(f.result_after_cogs,f.net_sales)==null?"":(f.result_after_cogs<0?"−":"")+pct(rate(f.result_after_cogs,f.net_sales))+" от net sales");
 t("#monthStatus",p?(m.marketplace_close_status==="CLOSED"?"Месяц закрыт":"LIVE · месяц идёт"):"Нет данных");
 t("#heroNote",waiting?"Ожидаем Finance за этот месяц":p?"Промежуточный результат · компенсации ещё не завершены":"Финансовые данные площадки недоступны");
 const journey=[["Продажи",f.sales,"До возвратов"],["Выручка нетто",f.net_sales,"Возвраты: "+money(f.returns)],["Расходы площадок",f.marketplace_expenses,pct(rate(f.marketplace_expenses,f.sales))+" от продаж"],["Осталось после МП",f.result_without_compensation,"Без компенсаций"],["Себестоимость",f.cogs,m.cost_status==="COMPLETE"?"Себестоимость загружена":"Себестоимость недоступна"]];
 $("#journey").innerHTML=journey.map(([label,value,note],i)=>'<div class="journey-step"><span class="step-index">0'+(i+1)+'</span><div><span class="metric-label">'+e(label)+'</span><strong>'+money(value)+'</strong><small>'+e(note)+'</small></div></div>').join("");
 $("#contextLine").innerHTML=p?'<span><i class="status-dot"></i>'+e(m.marketplace_close_status==="CLOSED"?"База месяца зафиксирована · ревизия "+m.base_close_revision:"Месяц открыт · данные продолжат поступать")+'</span><span>Компенсации: '+money(f.compensation)+' · '+e(m.compensation_status==="PENDING"?"ожидаются":m.compensation_status==="COMPLETE"?"завершены":"нет данных")+'</span><span>Бизнес-расходы: '+(m.business_expense_status==="NOT_APPLICABLE"?"не применяются":"не доступны")+'</span>':"";
 if(p) $("#contextLine").insertAdjacentHTML("beforeend",'<span>Списания: — · данные не подключены</span>');
 const rows=p?.sku_rows??[],losses=rows.filter(r=>numberOrNull(r.result_after_cogs)!=null&&r.result_after_cogs<0),best=filterRows(rows)[0];
 const largest=GROUPS.map(([key,label])=>({key,label,value:f[key]})).filter(r=>numberOrNull(r.value)!=null).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0];
 const cards=[
 ["Расходная нагрузка",largest?pct(rate(f.marketplace_expenses,f.sales)):"—",largest?"Основная статья — "+largest.label.toLowerCase()+": "+pct(rate(largest.value,f.sales))+" от продаж.":waiting?"Finance пока не поступил. Доли появятся вместе с начислениями.":"Данные о расходах отсутствуют.","expenses"],
 ["Товары в минусе",rows.length?String(losses.length):"—",rows.length?(losses.length?"Проверьте себестоимость и расходы по убыточным SKU.":"Среди доступных SKU нет отрицательного результата после COGS."):"Анализ появится после загрузки товарной экономики.","negative"],
 ["Лидер результата",best?money(best.result_after_cogs):"—",best?(best.article||best.canonical_sku)+" · откройте полную экономику товара.":"Товар с наибольшим результатом появится здесь.","best"]
 ];
 $("#insights").innerHTML=cards.map(([label,value,note,action])=>'<button class="insight" data-insight="'+action+'"><span>'+label+' <b>↗</b></span><strong>'+e(value)+'</strong><small>'+e(note)+'</small></button>').join("");
 $("#technicalState").textContent=p?JSON.stringify(m,null,2):"Нет данных выбранной площадки";
}
function renderExpenses(){
 const p=state.payload,f=finance(),total=p?.expense_structure?.total??{};
 $("#expenseComposition").innerHTML=GROUPS.map(([key],i)=>'<span class="color-'+i+'" style="width:'+Math.min(100,rate(total[key],Math.abs(f.marketplace_expenses??0))??0)+'%"></span>').join("");
 $("#expenseRows").innerHTML=GROUPS.map(([key,label],i)=>'<button class="expense-row '+(key===state.expense?"selected":"")+'" data-expense="'+key+'" aria-pressed="'+(key===state.expense)+'"><span><i class="color-'+i+'"></i>'+label+'</span><strong>'+money(total[key])+'</strong><span>'+pct(rate(total[key],f.sales))+'</span></button>').join("");
 renderExpenseDrill();
}
function renderExpenseDrill(){
 const p=state.payload,key=state.expense,label=GROUPS.find(g=>g[0]===key)[1];
 const rows=[...(p?.sku_rows??[])].filter(r=>numberOrNull(r[key])!=null&&r[key]!==0).sort((a,b)=>Math.abs(b[key])-Math.abs(a[key])).slice(0,3);
 $("#expenseDrill").innerHTML='<div class="allocation"><span>'+e(label)+' / прямые<strong>'+money(p?.expense_structure?.direct?.[key])+'</strong></span><span>Распределённые<strong>'+money(p?.expense_structure?.allocated_shared?.[key])+'</strong></span></div><p class="mini-heading">Наибольшие расходы по статье</p>'+ (rows.length?rows.map(r=>'<button class="mini-product" data-sku="'+e(r.canonical_sku)+'"><span>'+e(r.article||r.canonical_sku)+'</span><strong>'+money(r[key])+' ↗</strong></button>').join(""):'<p class="muted">Нет данных для детализации.</p>')+'<p class="micro">«—» означает отсутствие значения в контракте, а не нулевой расход.</p>';
}
function renderMarkets(){
 $("#marketComparison").innerHTML=MARKETPLACES.filter(m=>m.id!=="ALL").map(m=>{
 const p=selectPayload(state.bundle,tenant(),month(),m.id),f=p?.financial_economics??{};
 return '<button class="market-card '+(!p?"unavailable":"")+'" data-market="'+m.id+'"><div class="market-heading"><span class="market-icon '+m.id.toLowerCase()+'">'+(m.id==="OZON"?"O":m.id==="WB"?"W":"Я")+'</span><strong>'+e(m.label)+'</strong><span class="muted">'+(p?"Данные подключены":"Не подключён")+'</span><span>↗</span></div>'+(p?'<div class="market-metrics"><span>Выручка нетто<strong>'+money(f.net_sales)+'</strong></span><span>Расходы / продажи<strong>'+pct(rate(f.marketplace_expenses,f.sales))+'</strong></span><span>После COGS<strong>'+money(f.result_after_cogs)+'</strong></span></div><div class="market-expenses">Расходы МП: '+money(f.marketplace_expenses)+'</div>':'<p>Выручка, расходы и результат появятся после подключения.</p>')+'</button>';
 }).join("");
}
function renderProducts(){
 const source=state.payload?.sku_rows??[];
 const rows=filterRows(source,{search:$("#skuSearch").value,category:$("#categoryFilter").value,focus:$("#focusFilter").value,sort:$("#sortSelect").value});
 t("#skuCount",rows.length+" из "+source.length+" SKU");
 $("#skuBody").innerHTML=rows.map(r=>'<tr><td><button class="product-link" data-sku="'+e(r.canonical_sku)+'"><span class="product-monogram">'+e((r.article||r.canonical_sku||"?").slice(0,2))+'</span><span><strong>'+e(r.article||r.canonical_sku)+'</strong><small>'+e(r.product_name||"Название не передано")+'</small>'+(expenseOnly(r)?'<em>Только расходы</em>':"")+'</span><b>↗</b></button></td><td>'+money(r.sales,false)+'</td><td>'+units(r.financial_sale_units)+' / '+units(r.financial_return_units)+'</td><td>'+money(r.returns,false)+'</td><td>'+money(r.marketplace_expenses,false)+'</td><td>'+money(r.result_without_compensation,false)+'</td><td>'+money(r.cogs,false)+'</td><td class="result-col '+signedClass(r.result_after_cogs)+'">'+money(r.result_after_cogs,false)+'</td><td>'+money(r.result_without_compensation_per_financial_unit,false)+'</td></tr>').join("");
 $("#skuEmpty").hidden=rows.length>0;
 t("#skuEmpty",source.length?"Нет товаров по выбранным условиям. Измените поиск или фильтр.":state.payload?.metadata.finance_data_status==="WAITING_FOR_FINANCE"?"Finance за этот месяц ещё не поступил. Товары появятся вместе с начислениями.":"Для выбранной площадки нет товарных данных.");
}
function setCategories(){
 const rows=state.payload?.sku_rows??[],categories=new Map();
 for(const r of rows)if(r.category_id!=null||r.category)categories.set(String(r.category_id??r.category),r.category_name??r.category??String(r.category_id));
 $("#categoryFilter").innerHTML=categories.size?'<option value="">Все категории</option>'+[...categories].map(([id,label])=>'<option value="'+e(id)+'">'+e(label)+'</option>').join(""):'<option value="">Категории не переданы</option>';
 $("#categoryFilter").disabled=!categories.size;
}
function renderTrends(){
 const months=monthsBefore(MONTHS[0]);
 const ps=months.map(m=>selectPayload(state.bundle,tenant(),m,state.market));
 const series=[["Выручка нетто","net_sales"],["Расходы / продажи","expense_rate"],["Результат МП","result_without_compensation"],["После COGS","result_after_cogs"]];
 $("#trendTable").innerHTML='<table class="trends-table"><thead><tr><th>Показатель</th>'+months.map((m,i)=>'<th>'+e(shortMonth(m))+'<span>'+(ps[i]?.metadata.marketplace_close_status==="CLOSED"?"Закрыт":ps[i]?.metadata.marketplace_close_status==="LIVE"?"LIVE · неполный":"Нет истории")+'</span></th>').join("")+'</tr></thead><tbody>'+series.map(([label,key])=>'<tr><td>'+label+'</td>'+ps.map(p=>'<td>'+(key==="expense_rate"?pct(rate(p?.financial_economics.marketplace_expenses,p?.financial_economics.sales)):money(p?.financial_economics[key]))+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
}
function render(){
 state.payload=readScope();$("#marketTabs").innerHTML=tabs(state.market,"data-market");t("#coverage",state.market==="ALL"?"Доступно: Ozon · 1 из 3 площадок":state.market==="OZON"?"Финансовые данные Ozon":"Данные площадки пока не подключены");
 updateUrl();renderSummary();renderExpenses();renderMarkets();setCategories();renderProducts();renderTrends();
}
function dlRows(rows){return '<dl class="detail-list">'+rows.map(([name,value,note])=>'<div><dt>'+e(name)+(note?'<small>'+e(note)+'</small>':"")+'</dt><dd>'+e(value)+'</dd></div>').join("")+'</dl>';}
function renderDrawer(){
 const row=state.product;
 $("#drawerTabs").innerHTML=tabs(state.productMarket,"data-product-market");
 if(state.productMarket!=="ALL"&&state.productMarket!=="OZON"){$("#drawerBody").innerHTML='<div class="empty drawer-empty"><h3>Площадка ещё не подключена</h3><p>Экономика этого товара появится после подключения источника и сопоставления SKU.</p></div>';return;}
 const statuses=[["Себестоимость",row.cost_status==="COMPLETE"?"Полная":row.cost_status==="NOT_APPLICABLE"?"Не применима":"Недоступна"],["Компенсации",row.compensation_status==="PENDING"?"Ожидаются":row.compensation_status==="COMPLETE"?"Завершены":"Недоступны"]];
 const detail=[["Продажи",money(row.sales)],["Возвраты",money(row.returns)],["Выручка нетто",money(row.net_sales)],["Единицы: продано / возврат / нетто",units(row.financial_sale_units)+" / "+units(row.financial_return_units)+" / "+units(row.financial_net_units),"По финансовым операциям"],["Списания, ед.",units(row.written_off_units),"Операционные данные не подключены"],["Комиссия",money(row.commission)],["Логистика",money(row.logistics)],["Хранение",money(row.storage)],["Продвижение",money(row.promotion)],["Прочие расходы",money(row.other)],["Всего расходы МП",money(row.marketplace_expenses)],["Результат без компенсаций",money(row.result_without_compensation)],["Компенсации",money(row.compensation),row.compensation_status==="PENDING"?"Ожидается завершение слоя":""],["Себестоимость единицы",money(row.unit_cost)],["COGS",money(row.cogs)],["Выручка нетто / фин. ед.",money(row.net_sales_per_financial_unit),"Это net sales на единицу, не банковская выплата"],["Результат МП / фин. ед.",money(row.result_without_compensation_per_financial_unit)],["Результат после COGS / ед.","—","Отдельное поле ещё не передано API"]];
 const timeline=monthsBefore(MONTHS[0]).map(m=>{const p=selectPayload(state.bundle,tenant(),m);const r=p?.sku_rows.find(r=>r.product_id===row.product_id&&r.canonical_sku===row.canonical_sku);return '<div><span>'+e(shortMonth(m))+'</span><strong>'+money(r?.result_after_cogs)+'</strong><small>'+(p?.metadata.marketplace_close_status==="LIVE"?"LIVE · неполный":r?"Закрытый месяц":"Нет истории")+'</small></div>';}).join("");
 $("#drawerBody").innerHTML='<p class="drawer-scope">'+e(monthLabel(month()))+' · '+(state.productMarket==="ALL"?"Все доступные площадки · только Ozon":"Ozon")+'</p><div class="drawer-result"><span>После себестоимости</span><strong class="'+signedClass(row.result_after_cogs)+'">'+money(row.result_after_cogs)+'</strong><small>Промежуточный результат</small></div><div class="drawer-status">'+statuses.map(([k,v])=>'<span>'+k+': <strong>'+v+'</strong></span>').join("")+'</div><h3>Экономика товара</h3>'+dlRows(detail)+'<h3>Прямые и распределённые расходы</h3><div class="table-scroll"><table class="allocation-table"><thead><tr><th>Статья</th><th>Прямые</th><th>Shared</th></tr></thead><tbody>'+GROUPS.map(([k,l])=>'<tr><td>'+l+'</td><td>'+money(row.expense_structure?.direct?.[k])+'</td><td>'+money(row.expense_structure?.allocated_shared?.[k])+'</td></tr>').join("")+'</tbody></table></div><h3>Вклад площадок в выручку</h3><div class="product-shares"><span>Ozon <strong>'+(numberOrNull(row.net_sales)!=null&&row.net_sales>0?"100% доступной выручки":"Доля неприменима")+'</strong></span><span>WB <strong>Нет данных</strong></span><span>Яндекс Маркет <strong>Нет данных</strong></span></div><p class="micro">Покрытие — только Ozon. Доли не отражают неподключённые площадки.</p><h3>Результат по месяцам</h3><div class="product-timeline">'+timeline+'</div>';
}
function openProduct(sku){
 const row=state.payload?.sku_rows.find(r=>String(r.canonical_sku)===String(sku));if(!row)return;
 state.product=row;state.productMarket=state.market==="OZON"?"OZON":"ALL";
 t("#drawerTitle",row.product_name||row.article||row.canonical_sku);t("#drawerSku",(row.article||"")+" · SKU "+row.canonical_sku);
 renderDrawer();$("#productDrawer").showModal();document.body.classList.add("drawer-open");$(".drawer-scroll").scrollTop=0;
}
$("#tenantSelect").innerHTML=Object.entries(TENANTS).map(([id,c])=>'<option value="'+e(id)+'">'+e(c.label)+'</option>').join("");
$("#monthSelect").innerHTML=MONTHS.map(m=>'<option value="'+m+'">'+e(monthLabel(m))+'</option>').join("");
$("#tenantSelect").value=TENANTS[query.get("tenant")]?query.get("tenant"):"W";
$("#monthSelect").value=MONTHS.includes(query.get("month"))?query.get("month"):"2026-09";
state.market=MARKETPLACES.some(m=>m.id===query.get("marketplace"))?query.get("marketplace"):"ALL";
for(const id of ["#tenantSelect","#monthSelect"])$(id).addEventListener("change",render);
for(const id of ["#skuSearch","#categoryFilter","#focusFilter","#sortSelect"])$(id).addEventListener(id==="#skuSearch"?"input":"change",renderProducts);
$("#drawerClose").addEventListener("click",()=>$("#productDrawer").close());
$("#productDrawer").addEventListener("close",()=>document.body.classList.remove("drawer-open"));
document.addEventListener("click",event=>{
 const nav=event.target.closest('a[href^="#"]');
 if(nav){event.preventDefault();document.querySelector(nav.getAttribute("href"))?.scrollIntoView({behavior:"smooth"});return;}
 const mp=event.target.closest("[data-market]");
 if(mp){state.market=mp.dataset.market;render();return;}
 const pm=event.target.closest("[data-product-market]");
 if(pm){state.productMarket=pm.dataset.productMarket;renderDrawer();return;}
 const ex=event.target.closest("[data-expense]");
 if(ex){state.expense=ex.dataset.expense;renderExpenses();return;}
 const sku=event.target.closest("[data-sku]");
 if(sku){openProduct(sku.dataset.sku);return;}
 const insight=event.target.closest("[data-insight]");
 if(insight){const action=insight.dataset.insight;if(action==="best"){const best=filterRows(state.payload?.sku_rows??[])[0];if(best)openProduct(best.canonical_sku);}else if(action==="negative"){$("#focusFilter").value="negative";renderProducts();$("#products").scrollIntoView({behavior:"smooth"});}else $("#expenses").scrollIntoView({behavior:"smooth"});}
});
render();
try{
 state.bundle=await openReview();
 if(state.bundle){state.bundle.payloads.forEach(validatePayload);t("#reviewNote","Срез для продуктового ревью · "+dateText(state.bundle.exported_at)+" · данные не обновляются в реальном времени");render();}
 else{t("#reviewNote","Предпросмотр Monthly · финансовые данные доступны по приватной ссылке");$("#accessNote").hidden=false;}
}catch(error){t("#reviewNote",error.message);$("#reviewNote").classList.add("error");$("#accessNote").hidden=false;}

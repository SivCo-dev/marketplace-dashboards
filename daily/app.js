import {startDashboard} from './core/dashboard-core.js?v=20261004finish';
import w from '../config/w.js';
import cpr from '../config/cpr.js';
import orange from '../config/orange.js';
import {loadReportRegistry,dailyConfigsFromRegistry} from '../core/runtime-registry.js?v=20261004finish';
const initialQuery=new URLSearchParams(location.search);
const requestedTenant=/^[A-Z0-9_-]{1,32}$/.test(initialQuery.get('tenant')||'')?initialQuery.get('tenant'):'W';
const initialResponse=fetch('https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev23?tenant='+requestedTenant+'&format=columnar',{cache:'no-cache'});
initialResponse.catch(()=>{});
let configs={W:w,CPR:cpr,ORANGE:orange};
try{const runtime=dailyConfigsFromRegistry(await loadReportRegistry(),configs);if(Object.keys(runtime).length)configs=runtime}catch(error){console.warn('Report registry unavailable',error.message)}
const query=new URLSearchParams(location.search),tenant=configs[query.get('tenant')]?query.get('tenant'):configs.W?'W':Object.keys(configs)[0];
const config={...configs[tenant],data_url:configs[tenant].data_url+"&format=columnar",theme:{accent:'#355846'},onRender:paint,data_response:tenant===requestedTenant?initialResponse:null};
const $=id=>document.getElementById(id),num=v=>Number(v||0),fmt=v=>v==null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(num(v)),money=v=>fmt(v)+' ₽';
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const pct=(a,b)=>a==null||b==null?null:num(b)?(num(a)/num(b)-1)*100:null;
const delta=v=>v==null?'<span class="muted">Нет сопоставимой истории</span>':'<span class="'+(v<0?'negative':'positive')+'">'+(v<0?'↓ ':'↑ ')+Math.abs(v).toFixed(1)+'%</span>';
const date=v=>String(v||'').slice(8,10)+'.'+String(v||'').slice(5,7);
let view,focus='all',breakdown=null,limit=25,lastFocus;
const pending=startDashboard(config); // Shared calculations, canonical SKU mapping and SKU card economics.
const shell=document.querySelector('.shell'),header=document.querySelector('.header');
header.innerHTML='<div><div class="eyebrow">АНАЛИТИКА ПРОДАЖ</div><h1>'+esc(config.display_name)+' · Ежедневный отчёт <span class="live-badge">● LIVE</span></h1><p class="muted">Оперативная динамика по маркетплейсам и товарам</p></div><nav class="view-switch" aria-label="Вид отчёта"><span aria-current="page">По дням</span><a id="monthlyLink" href="../monthly/?tenant='+tenant+'">По месяцам</a></nav>';
const coreStatus=document.createElement('span');coreStatus.id='status';coreStatus.hidden=true;header.append(coreStatus);
const toolbar=document.querySelector('.toolbar'),organization=document.createElement('div');
organization.innerHTML='<label for="organization">Организация</label><select id="organization">'+Object.entries(configs).map(([id,c])=>'<option value="'+id+'" '+(id===tenant?'selected':'')+'>'+esc(c.display_name)+'</option>').join('')+'</select>';
toolbar.prepend(organization);
// The cabinet select stays in the main toolbar and is hidden by core when only one exists.
const search=$('q').parentElement; search.className='sku-search-field';search.querySelector('label').textContent='Поиск товара';$('q').placeholder='Найти товар, SKU или артикул…';
const periodControl=$('days').parentElement;toolbar.append(periodControl); // Move period after category.
toolbar.className='toolbar visual-filters';
$('organization').onchange=()=>{const url=new URL(location.href);url.searchParams.set('tenant',$('organization').value);location.assign(url)};
// A previously persisted ?period=14 was the old default, not a deliberate new selection.
// Use 30 on initial load; the dropdown remains fully interactive afterwards.
$('days').value='30';
const status=document.createElement('div');status.className='state-strip';status.innerHTML='<div id="dailyContext"></div><span id="liveContext"></span>';document.querySelector('#kpis').after(status);
const trend=document.querySelector('.trend-card');trend.querySelector('.ttl').textContent='Динамика заказов';
const opt=document.createElement('option');opt.value='orders';opt.textContent='Заказы';$('trendMode').append(opt);
const breakdownPanel=document.createElement('section');breakdownPanel.className='card pad breakdown-panel';breakdownPanel.innerHTML='<div class="section-head"><div><h2>Где формируется оборот</h2><p class="muted">Доля и вклад основных направлений</p></div><div class="seg" id="breakdownSwitch"><button type="button" class="active" data-breakdown="market">Маркетплейсы</button><button type="button" data-breakdown="category">Категории</button></div></div><div id="breakdownCards"></div>';
const overview=document.createElement('div');overview.className='sales-overview';trend.before(overview);overview.append(trend,breakdownPanel);
// Keep the core DOM contract for every filter and card control, including hidden analysis tables.
$('trendSummary').hidden=true;
const panels=[...document.querySelectorAll('.work-left > .card')];panels.slice(0,3).forEach(p=>p.hidden=true);
const skuPanel=panels.at(-1);skuPanel.classList.add('visual-products');skuPanel.querySelector('.desc').innerHTML='Один список товаров для анализа продаж, рисков и динамики <span id="cnt" hidden></span>';
const controls=document.createElement('div');controls.className='product-controls';controls.innerHTML='<div class="focus-tabs" id="focusTabs"></div><div class="product-search"></div>';
controls.lastElementChild.append(search);skuPanel.querySelector('.section-head').after(controls);
const footer=document.createElement('div');footer.className='table-footer';footer.innerHTML='<span id="tableCount"></span><button type="button" id="showMore">Показать ещё</button>';skuPanel.append(footer);$('allSkuLimit').hidden=true;
const detail=$('detail'),right=document.querySelector('.work-right');right.hidden=true;
const drawer=document.createElement('dialog');drawer.id='productDrawer';drawer.setAttribute('aria-label','Карточка товара');drawer.innerHTML='<div class="drawer-head"><span class="eyebrow">КАРТОЧКА ТОВАРА</span><button type="button" id="drawerClose" aria-label="Закрыть карточку">✕</button></div><div class="drawer-scroll"></div>';drawer.lastElementChild.append(detail);$('app').append(drawer);
const originalOpen=globalThis.openSku;globalThis.openSku=key=>{originalOpen(key);if(!drawer.open){lastFocus=document.activeElement;drawer.showModal();document.body.classList.add('drawer-open');$('drawerClose').focus()}};
$('drawerClose').onclick=()=>drawer.close();drawer.addEventListener('click',e=>{if(e.target===drawer){const b=drawer.getBoundingClientRect();if(e.clientX<b.left||e.clientY<b.top||e.clientX>b.right||e.clientY>b.bottom)drawer.close()}});
drawer.addEventListener('close',()=>{document.body.classList.remove('drawer-open');lastFocus?.focus()});
$('focusTabs').onclick=e=>{const b=e.target.closest('[data-focus]');if(!b)return;focus=b.dataset.focus;limit=25;paint(view)};
$('breakdownSwitch').onclick=e=>{const b=e.target.closest('[data-breakdown]');if(!b)return;breakdown=b.dataset.breakdown;paint(view)};
$('showMore').onclick=()=>{limit+=25;paint(view)};
shell.insertAdjacentHTML('beforeend','<footer class="page-footer"><span>Данные из текущих сохранённых отчётов V2</span>'+({ORANGE:'../',W:'../w.html',CPR:'../cpr.html'}[tenant]?'<a href="'+{ORANGE:'../',W:'../w.html',CPR:'../cpr.html'}[tenant]+'">Открыть прежний ежедневный дашборд ↗</a>':'')+'</footer>');
await pending;
document.title=config.display_name+' · Ежедневный отчёт';
function paint(data){
 if(!data||!$('focusTabs'))return;view=data;
 const {current:c,previous:p,skus,currentDates:days,live,payload}=data;
 const activeMarkets=new Set(data.skuRows.filter(r=>num(r.gmv)!==0||num(r.units)!==0).map(r=>r.marketplace));
 const breakdownMode=breakdown??((data.filters.marketplace!=='ALL'||activeMarkets.size===1)?'category':'market');
 const risks=skus.filter(a=>a.risk.level>0),critical=risks.filter(a=>a.risk.level===3).length;
 const kpis=[['₽','Оборот заказов',money(c.gmv),days.length+' закрытых дней',delta(pct(c.gmv,p.gmv))],['▥','Заказано',fmt(c.units)+' шт',days.length?fmt(c.units/days.length)+' шт. в среднем за день':'Нет закрытых дней',delta(pct(c.units,p.units))],['○','Заказы',fmt(c.orders),c.orders==null?'Нет полной детализации заказов':'Средний чек '+(c.orders?money(c.gmv/c.orders):'—'),delta(pct(c.orders,p.orders))],['◇','Активные SKU',fmt(skus.length),'Товары с заказами за период','<span class="muted">Без LIVE-дней</span>'],['!','Точки внимания',fmt(risks.length)+' SKU',critical+' критичных · '+(risks.length-critical)+' требуют внимания','<span class="negative">По действующим правилам рисков</span>']];
 $('kpis').innerHTML=kpis.map(([icon,label,value,note,change])=>'<article class="card visual-kpi"><div class="kpi-label"><i>'+icon+'</i>'+label+'</div><strong>'+value+'</strong><small>'+note+'</small><div>'+change+'</div></article>').join('');
 const latest=live.at(-1),ts=payload.meta?.generated_at;
 $('dailyContext').textContent='● Обновлено '+(ts?new Date(ts).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' МСК':'—')+' · '+(days.length?date(days[0])+'–'+date(days.at(-1)):'Нет закрытых дней')+' · LIVE не входит в итог';
 $('liveContext').textContent=latest?'LIVE · '+date(latest.report_date)+' · '+money(latest.gmv):'LIVE-данных нет';
 const url=new URL(location.href);url.searchParams.set('tenant',tenant);url.searchParams.set('period',$('days').value);history.replaceState(null,'',url);
 const monthUrl=new URL('../monthly/',location.href);monthUrl.searchParams.set('tenant',tenant);if(data.filters.marketplace!=='ALL')monthUrl.searchParams.set('marketplace',data.filters.marketplace);$('monthlyLink').href=monthUrl;
 const groups=new Map();
 for(const r of data.skuRows){const key=breakdownMode==='market'?r.marketplace:(r.category||'Без категории');const g=groups.get(key)||{gmv:0,units:0};g.gmv+=num(r.gmv);g.units+=num(r.units);groups.set(key,g)}
 const marketNames={OZON:'Ozon',WB:'Wildberries',YANDEX:'Яндекс Маркет'};
 breakdownPanel.dataset.mode=breakdownMode;
 const items=breakdownMode==='market'?data.marketTotals.filter(g=>data.filters.marketplace==='ALL'||g.marketplace===data.filters.marketplace).map(g=>[g.marketplace,g]):[...groups].sort((a,b)=>b[1].gmv-a[1].gmv);
 if(breakdownMode==='category'){
  const total=items.reduce((acc,[,g])=>({gmv:acc.gmv+g.gmv,units:acc.units+g.units}),{gmv:0,units:0});
  const share=v=>total.gmv?(v/total.gmv*100).toFixed(1)+'%':'0%';
  const rows=items.map(([key,g])=>'<div class="category-line"><div class="category-line-top"><span class="category-name" title="'+esc(key)+'">'+esc(key)+'</span><strong>'+money(g.gmv)+'</strong></div><div class="category-line-meta"><span>'+share(g.gmv)+' оборота</span><span>'+fmt(g.units)+' шт · '+(g.units?money(g.gmv/g.units):'—')+' / шт</span></div><div class="category-line-track"><i style="width:'+Math.max(0,Math.min(100,total.gmv?g.gmv/total.gmv*100:0))+'%"></i></div></div>').join('');
  $('breakdownCards').innerHTML=items.length?'<div class="category-lines">'+rows+'<div class="category-total"><div class="category-line-top"><b>Итого</b><strong>'+money(total.gmv)+'</strong></div><div class="category-line-meta"><span>100% оборота</span><span>'+fmt(total.units)+' шт · '+(total.units?money(total.gmv/total.units):'—')+' / шт</span></div></div></div>':'<p class="muted">Нет данных за выбранный период</p>';
 }else{
  $('breakdownCards').innerHTML=items.map(([key,g])=>'<article class="breakdown-card"><div><span class="market-icon '+esc(key.toLowerCase())+'">'+esc(key.slice(0,2))+'</span><b>'+esc(marketNames[key]||key)+'</b><small>'+(c.gmv?(g.gmv/c.gmv*100).toFixed(1):'0')+'% оборота</small></div><strong>'+money(g.gmv)+'</strong><div class="progress"><i style="width:'+Math.max(0,Math.min(100,c.gmv?g.gmv/c.gmv*100:0))+'%"></i></div><p>'+fmt(g.units)+' шт <span>'+(g.units?money(g.gmv/g.units):'—')+' / шт</span></p></article>').join('')||'<p class="muted">Нет данных за выбранный период</p>';
 }
 for(const b of $('breakdownSwitch').querySelectorAll('button'))b.classList.toggle('active',b.dataset.breakdown===breakdownMode);
 const counts={all:skus.length,top:Math.min(25,skus.filter(s=>s.units>=2).length),risk:risks.length,up:skus.filter(s=>s.risk.gmvPct>0).length,down:skus.filter(s=>s.risk.gmvPct<0).length};
 $('focusTabs').innerHTML=[['all','Все'],['top','Топ по обороту'],['risk','Проблемные'],['up','Рост'],['down','Падение']].map(([id,label])=>'<button type="button" data-focus="'+id+'" aria-pressed="'+(focus===id)+'" class="'+(focus===id?'active':'')+'">'+label+' <span>'+counts[id]+'</span></button>').join('');
 let list=skus.filter(a=>focus==='risk'?a.risk.level>0:focus==='up'?a.risk.gmvPct>0:focus==='down'?a.risk.gmvPct<0:focus==='top'?a.units>=2:true).sort((a,b)=>focus==='risk'?b.risk.level-a.risk.level||b.gmv-a.gmv:focus==='up'?b.risk.gmvPct-a.risk.gmvPct:focus==='down'?a.risk.gmvPct-b.risk.gmvPct:b.gmv-a.gmv);if(focus==='top')list=list.slice(0,25);
 $('allSkuHead').innerHTML='<th>Товар / SKU</th><th>Маркетплейсы</th><th class="r">Оборот</th><th class="r">Заказано</th><th class="r">Ср. цена</th><th class="r">Остаток</th><th class="r">К прошлому периоду</th><th>Статус</th>';
 $('rows').innerHTML=list.slice(0,limit).map(a=>'<tr class="click" data-key="'+esc(a.key)+'" tabindex="0" aria-label="Открыть '+esc(a.product_name||a.article)+'"><td><div class="product-cell"><span class="monogram">'+esc((a.article||a.sku||'SKU').slice(0,2))+'</span><div><b>'+esc(a.product_name||a.article||a.sku)+'</b><small>'+esc(a.article||'')+' · SKU '+esc(a.sku)+'</small></div></div></td><td><span title="'+esc(a.channels)+'">'+esc(a.channels)+'</span></td><td class="r"><b>'+money(a.gmv)+'</b></td><td class="r">'+fmt(a.units)+' шт</td><td class="r">'+money(a.price)+'</td><td class="r">'+(a.stock?fmt(a.stock.total_stock)+' шт':'—')+'</td><td class="r">'+delta(a.risk.gmvPct)+'</td><td><span class="risk-chip '+esc(a.risk.cls)+'" title="'+esc(a.risk.reasons.join(' · '))+'">'+esc(a.risk.label)+'</span></td></tr>').join('')||'<tr><td colspan="8" class="empty">Нет товаров по выбранным фильтрам</td></tr>';
 $('tableCount').textContent='Показано '+Math.min(limit,list.length)+' из '+list.length+' SKU';$('showMore').hidden=limit>=list.length;
 // Fill below the closed-day curve using its already calculated SVG points.
 $('trend').querySelectorAll('.daily-trend-fill').forEach(n=>n.remove());const line=$('trend').querySelector('polyline:not([stroke-dasharray])');if(line){const pts=line.getAttribute('points').split(' ');const first=pts[0].split(',')[0],last=pts.at(-1).split(',')[0];const polygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');polygon.classList.add('daily-trend-fill');polygon.setAttribute('points',first+',226 '+pts.join(' ')+' '+last+',226');polygon.setAttribute('fill','#e6eddd');polygon.setAttribute('opacity','.6');line.before(polygon)}
}
$('rows').addEventListener('keydown',e=>{if(e.key==='Enter'){const row=e.target.closest('[data-key]');if(row){e.preventDefault();globalThis.openSku(row.dataset.key)}}});

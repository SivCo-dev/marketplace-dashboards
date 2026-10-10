import {resolveRowAccount} from '../../core/runtime-registry.js?v=20261004finish';
import { createCanonicalSkuResolver } from "./canonical-sku.js";

function dashboardLayout(config){
  return `<div id="load" class="load">Загружаю ${X(config.display_name)} Orders…</div><div class="shell"><div class="header"><div><h1>${X(config.display_name)} — Orders Control 2.3</h1><div class="sub">2.3 • Product Registry • единый Dashboard Core</div></div><div class="sub" id="status"></div></div><div id="err" class="err hide"></div>
<div class="toolbar"><div id="cabinetFilterWrap"><label>Кабинет</label><select id="cabinet"><option value="ALL">Все кабинеты</option></select></div><div><label>Период</label><select id="days"><option value="7">7 дней</option><option value="14">14 дней</option><option value="30" selected>30 дней</option><option value="MONTH">Текущий месяц</option><option value="999">Весь период</option></select></div><div id="marketplaceFilterWrap"><label>Маркетплейс</label><select id="marketplace"><option value="ALL" selected>Все маркетплейсы</option></select></div><div><label>Мастер-категория</label><select id="masterCategory"><option value="ALL">Все мастер-категории</option></select></div><div><label>Категория</label><select id="category"><option value="ALL">Все категории</option></select></div><div><label>Бренд</label><select id="brand"><option value="ALL">Все бренды</option></select></div><div><label>Поиск SKU / название</label><input id="q" name="orders_search" type="text" autocomplete="off" spellcheck="false" placeholder="Артикул или название"></div></div>
<div id="kpis" class="grid5"></div><div class="card pad market-accent-card trend-card"><div class="section-head"><div><div class="ttl">Динамика заказов</div><div class="desc" id="trendDesc">Закрытые дни выбранного периода и оперативная LIVE-точка.</div></div><select id="trendMode" class="inline-select"><option value="units">Штуки</option><option value="gmv" selected>Оборот</option></select></div><div class="trend-layout"><div class="trend-chart-column"><svg id="trend"></svg><div id="trendPeriodNote" class="trend-period-note"></div><div id="trendDayDetail" class="trend-day-detail"><span class="neu">Нажми на точку, чтобы посмотреть выбранный день.</span></div></div><aside id="trendSummary" class="trend-summary"></aside></div></div>
<div class="workbench">
  <div class="work-left">
    <div class="card pad market-accent-card">
      <div class="section-head"><div><div class="ttl">Проблемные SKU</div><div class="desc">Ключевые сигналы по цене, обороту, остатку и качеству карточки.</div></div><select id="riskLimit" class="inline-select"><option value="10" selected>10</option><option value="25">25</option><option value="all">Все</option></select></div>
      <div class="tw noscroll"><table><thead><tr><th>SKU</th><th class="r">Δ цены</th><th class="r">Δ оборота</th><th class="r">Остаток</th><th class="r">Контент</th><th>Сигнал</th></tr></thead><tbody id="risks"></tbody></table></div>
    </div>
    <div class="card pad market-accent-card">
      <div class="section-head"><div><div class="ttl">TOP по обороту</div><div class="desc">За выбранный период • только SKU с продажами от 2 шт.</div></div><select id="topLimit" class="inline-select"><option value="10" selected>10</option><option value="25">25</option><option value="50">50</option><option value="all">Все</option></select></div>
      <div class="tw noscroll"><table><thead><tr><th>SKU</th><th class="r">GMV</th><th class="r">Шт</th><th class="r">Цена</th><th class="r">Остаток</th><th class="r">Доля маркетов</th></tr></thead><tbody id="topGmv"></tbody></table></div>
    </div>
    <div class="card pad market-accent-card">
      <div class="section-head"><div><div class="ttl">Рост / падение SKU</div><div class="desc">Сравнение со своим предыдущим периодом по GMV.</div></div><div class="section-actions"><select id="moverLimit" class="inline-select"><option value="10" selected>10</option><option value="25">25</option><option value="50">50</option><option value="all">Все</option></select><div id="moverMode" class="seg" data-value="all"><button type="button" class="active" data-mode="all">Все</button><button type="button" data-mode="up">Рост</button><button type="button" data-mode="down">Падение</button></div></div></div>
      <div class="tw noscroll"><table><thead><tr><th>SKU</th><th class="r">Шт</th><th class="r">Δ шт</th><th class="r">Δ цены</th><th class="r">GMV</th><th class="r">Δ оборота</th><th class="r">Контент</th><th class="r">Доля маркетов</th></tr></thead><tbody id="movers"></tbody></table></div>
    </div>
    <div class="card pad market-accent-card">
      <div class="section-head"><div><div class="ttl">Все SKU</div><div class="desc"><span id="cnt"></span> • клик открывает карточку SKU справа • LIVE-день исключён из итогов и таблиц.</div></div><select id="allSkuLimit" class="inline-select"><option value="10" selected>10</option><option value="25">25</option><option value="50">50</option><option value="all">Все</option></select></div>
      <div class="tw"><table><thead><tr id="allSkuHead"></tr></thead><tbody id="rows"></tbody></table></div>
    </div>
  </div>
  <div class="work-right"><div class="work-right-sticky">
    <div id="skuSearchBox" class="sku-search"><button type="button" class="sku-search-toggle" data-action="toggle-sku-search">⌕ Поиск SKU</button><label>Быстрый поиск SKU</label><div class="sku-search-row"><input id="skuQuickSearch" list="skuQuickList" type="text" autocomplete="off" placeholder="Артикул, SKU или название"><datalist id="skuQuickList"></datalist><button type="button" data-action="open-quick-sku">Открыть</button></div><div class="sku-search-hint">Поиск по всем SKU выбранного периода, независимо от TOP-блоков.</div></div>
    <div id="detail" class="card pad detail"><div class="desc">Выбери SKU слева или найди его через поиск выше.</div></div>
  </div></div>
</div>
</div>`;
}



let CONFIG=null;const API=null,OZON_API=null;let D=null,selected=null,detailTab="overview";const E=id=>document.getElementById(id),N=v=>Number(v||0),R=v=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(N(v))+" ₽",I=v=>v==null?"—":new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(N(v)),P=v=>(v==null||!isFinite(Number(v)))?"—":Number(v).toFixed(1)+"%",C=v=>N(v)>0?"pos":N(v)<0?"neg":"neu",S=v=>N(v)>0?"+":"",X=s=>String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
function normArticle(v){return String(v||"").toLowerCase().replace(/[^a-zа-я0-9]+/gi,"")}
function canonicalKey(x){return String((x&&x.canonical_sku)||(x&&x.external_sku)||(x&&x.article)||(x&&x.sku)||"")}
function refMap(){let m=new Map();for(const r of D.refs||[]){if(r.article)m.set(String(r.article).toLowerCase(),r);if(r.sku)m.set(String(r.sku),r)}return m}
let DIM=new Map(),STOCK=[],POSITION=[],CONTENT=[],VISIBILITY=[],ADS=[],LINKS=[];
// Perf caches. Each entry remembers the exact source object it was built from (the snapshot object D,
// the STOCK array, the CONTENT array) and is rebuilt when that object changes; setup() also clears all
// entries for every new snapshot. Index buckets keep the original row order, so every sum, sort and
// "first match" below sees rows in the same order as the previous full scans.
let PERF={};
function perfCache(name,src,build){let c=PERF[name];if(!c||c.src!==src){c=PERF[name]={src,val:build()}}return c.val}
function groupRows(rows,keyFn){let m=new Map();for(const x of rows){let k=keyFn(x),b=m.get(k);if(!b)m.set(k,b=[]);b.push(x)}return m}
function skuRowsByKey(key){return perfCache("skuByKey",D,()=>groupRows(D.sku_daily||[],canonicalKey)).get(key)||[]}
function skuRowsByArticle(art){return perfCache("skuByArticle",D,()=>groupRows(D.sku_daily||[],x=>normArticle(x.article))).get(art)||[]}
function stockIndex(){return perfCache("stockIndex",STOCK,()=>({byArticle:groupRows(STOCK,s=>normArticle(s.offer_id)),bySku:groupRows(STOCK,s=>String(s.sku||""))}))}
function contentIndex(){return perfCache("contentIndex",CONTENT,()=>{let byArticle=new Map(),bySku=new Map();CONTENT.forEach((c,i)=>{let a=normArticle(c.offer_id),s=String(c.sku||"");if(!byArticle.has(a))byArticle.set(a,[]);byArticle.get(a).push(i);if(!bySku.has(s))bySku.set(s,[]);bySku.get(s).push(i)});return{byArticle,bySku}})}
function dimKey(cab,sku){return String(cab||"")+"|"+String(sku||"")}
function rebuildDimMap(){DIM=new Map();for(const d of D.dimensions||[])DIM.set(dimKey(d.cabinet,d.sku),d)}
function rebuildStockMap(){STOCK=Array.isArray(D.stocks)?D.stocks:[]}
function rebuildLinkMap(){
  let base=Array.isArray(D.product_links)?D.product_links:[];
  let registry=(D.marketplace_products||[]).map(p=>({
    marketplace:p.marketplace,cabinet:p.cabinet,offer_id:p.offer_id||p.external_sku,
    external_id:p.marketplace_product_id||p.external_sku,product_url:p.product_url,
    canonical_sku:p.canonical_sku
  }));
  LINKS=base.concat(registry)
}
function marketSkuFor(marketplace,a){
 let key=canonicalKey(a),rows=(D&&Array.isArray(D.sku_daily))?D.sku_daily:[];
 let candidates=rows.filter(function(x){
   return rowMarketplace(x)===String(marketplace||"").toUpperCase()
     && key&&canonicalKey(x)===key
     && x.sku
 });
 candidates.sort((x,y)=>String(y.report_date||"").localeCompare(String(x.report_date||"")));
 return candidates.length?String(candidates[0].sku||""):null
}
function productLinkFor(marketplace,a){
 let mk=String(marketplace||"").toUpperCase(),art=normArticle(a&&a.article),sku=String((a&&a.sku)||""),cab=String((a&&a.cabinet)||"");
 let marketSku=marketSkuFor(mk,a)||sku;
 let arr=LINKS.filter(function(x){
   if(String(x.marketplace||"").toUpperCase()!==mk)return false;
   let xo=normArticle(x.offer_id),xe=String(x.external_id||"");
   return (art&&xo===art)||(marketSku&&xe===marketSku)||(!art&&sku&&(xe===sku||String(x.offer_id||"")===sku));
 });
 if(arr.length){
   let exact=arr.find(x=>cab&&String(x.cabinet||"")===cab&&x.product_url);
   return (exact||arr.find(x=>x.product_url)||{}).product_url||null
 }
 let regs=(D.marketplace_products||[]).filter(p=>String(p.marketplace||"").toUpperCase()===mk&&canonicalKey(p)===canonicalKey(a)&&p.is_active!==false);
 if(regs.length){
   let exact=regs.find(x=>cab&&String(x.cabinet||"")===cab&&x.product_url);
   return (exact||regs.find(x=>x.product_url)||{}).product_url||null
 }
 if(mk==="OZON"&&/^\d+$/.test(String(marketSku||"")))return "https://www.ozon.ru/product/"+marketSku+"/";
 if(mk==="WB"&&/^\d+$/.test(String(marketSku||"")))return "https://www.wildberries.ru/catalog/"+marketSku+"/detail.aspx";
 return null
}
function stockFor(a){
 let art=normArticle(a.article),sku=String(a.sku||"");
 // Same rows as STOCK.filter((art&&normArticle(offer_id)===art)||(!art&&sku&&String(sku)===sku)), in STOCK order.
 let idx=stockIndex(),arr=art?(idx.byArticle.get(art)||[]).slice():sku?(idx.bySku.get(sku)||[]).slice():[];
 if(!arr.length)return null;

 // 1. Ozon всегда приоритетнее других маркетплейсов, если SKU там существует.
 let oz=arr.filter(s=>String(s.source_marketplace||"OZON").toUpperCase()==="OZON");
 let chosen=[];

 if(oz.length){
   // Market IPT приоритетный Ozon-кабинет; иначе берём один Ozon-кабинет, не суммируя разные кабинеты.
   let pri=["Market IPT","PSK","IPCH","BOND"];
   oz.sort((x,y)=>{
     let px=pri.indexOf(x.cabinet),py=pri.indexOf(y.cabinet);
     px=px<0?999:px;py=py<0?999:py;
     if(px!==py)return px-py;
     return String(y.captured_at||"").localeCompare(String(x.captured_at||""));
   });
   chosen=oz.filter(s=>s.cabinet===oz[0].cabinet);
 }else{
   // 2. Только если SKU отсутствует во всех Ozon-кабинетах — используем другой источник.
   let ya=arr.filter(s=>String(s.source_marketplace||"").toUpperCase()==="YANDEX");
   if(ya.length){
     // Не суммируем одинаковый физический остаток между кабинетами Яндекса: выбираем один кабинет.
     let pri=["IPT","IPP","IPU","PSK","IPCH","BOND"];
     ya.sort((x,y)=>{
       let px=pri.indexOf(x.cabinet),py=pri.indexOf(y.cabinet);
       px=px<0?999:px;py=py<0?999:py;
       if(px!==py)return px-py;
       return String(y.captured_at||"").localeCompare(String(x.captured_at||""));
     });
     chosen=ya.filter(s=>s.cabinet===ya[0].cabinet);
   }
 }

 if(!chosen.length)return null;
 return chosen.reduce((z,s)=>{
   z.total_stock+=N(s.total_stock);z.fbo_stock+=N(s.fbo_stock);z.fbs_stock+=N(s.fbs_stock);
   z.reserved_stock+=N(s.reserved_stock);z.avg_daily_sales_14d=Math.max(z.avg_daily_sales_14d,N(s.avg_daily_sales_14d));
   z.units_14d=Math.max(z.units_14d,N(s.units_14d));z.captured_at=z.captured_at||s.captured_at;
   z.source_cabinet=z.source_cabinet||s.cabinet;z.source_marketplace=z.source_marketplace||String(s.source_marketplace||"OZON");
   return z
 },{total_stock:0,fbo_stock:0,fbs_stock:0,reserved_stock:0,avg_daily_sales_14d:0,units_14d:0,captured_at:null,source_cabinet:null,source_marketplace:null})
}
function rebuildPositionMap(){POSITION=Array.isArray(D.positions)?D.positions:[]}
function positionFor(a){
 let cab=E("cabinet").value;if(cab==="ALL")return null;
 let art=String(a.article||"").toLowerCase(),sku=String(a.sku||"");
 return POSITION.find(p=>p.cabinet===cab&&((sku&&String(p.sku||"")===sku)||(art&&String(p.offer_id||"").toLowerCase()===art)))||null
}
function rebuildContentMap(){CONTENT=Array.isArray(D.content)?D.content:[]}
function rebuildYandexAnalytics(){VISIBILITY=Array.isArray(D.visibility)?D.visibility:[];ADS=Array.isArray(D.ads)?D.ads:[]}
function contentFor(a){
 let cab=E("cabinet").value,art=String(a.article||"").toLowerCase(),sku=String(a.sku||"");
 let arr=CONTENT.filter(c=>(cab==="ALL"||c.cabinet===cab)&&((art&&String(c.offer_id||"").toLowerCase()===art)||(sku&&String(c.sku||"")===sku)));
 if(!arr.length)return null;
 if(cab==="ALL")arr.sort((x,y)=>N(x.content_score)-N(y.content_score));
 return arr[0]
}
function rowMarketplace(x){return String((x&&x.marketplace)||(x&&x.market)||(x&&x.source_marketplace)||"OZON")}
function currentFilters(){return{cab:E("cabinet").value,marketplace:E("marketplace").value,masterCategory:E("masterCategory").value,category:E("category").value,brand:E("brand").value,q:E("q").value.trim().toLowerCase()}}
function dimFor(cab,sku){return DIM.get(dimKey(cab,sku))||{master_category:"Прочие",category:"Без категории",brand:"Без бренда"}}
function textMatch(article,name,sku,q){return !q||((article||"")+" "+(name||"")+" "+(sku||"")).toLowerCase().includes(q)}
function entityMatch(x,f){return(f.cab==="ALL"||x.cabinet===f.cab)&&(f.marketplace==="ALL"||rowMarketplace(x)===f.marketplace)&&(f.masterCategory==="ALL"||x.master_category===f.masterCategory)&&(f.category==="ALL"||x.category===f.category)&&(f.brand==="ALL"||x.brand===f.brand)&&textMatch(x.article,x.product_name,x.sku,f.q)}
function hasEntityFilter(f=currentFilters()){return f.masterCategory!=="ALL"||f.category!=="ALL"||f.brand!=="ALL"||!!f.q}
let skuSearchCollapsed=false;
globalThis.toggleSkuSearch=function(forceOpen){
 let box=E("skuSearchBox");if(!box)return;
 skuSearchCollapsed=forceOpen===true?false:!skuSearchCollapsed;
 box.classList.toggle("compact",skuSearchCollapsed);
 if(!skuSearchCollapsed)setTimeout(()=>E("skuQuickSearch")?.focus(),0)
}
function collapseSkuSearch(){
 let box=E("skuSearchBox");if(!box)return;
 skuSearchCollapsed=true;box.classList.add("compact")
}
function quickSkuIndex(){
 let allowed=new Set(periodDates(0)),m=new Map(),f=currentFilters();
 for(const x of (D.sku_daily||[])){
   if(!allowed.has(x.report_date))continue;
   if(f.marketplace!=="ALL"&&rowMarketplace(x)!==f.marketplace)continue;
   let k=canonicalKey(x);
   if(!m.has(k))m.set(k,{key:k,article:x.canonical_sku||x.article||"",sku:x.sku||"",name:x.product_name||""});
 }
 return [...m.values()].sort((a,b)=>String(a.article||a.sku).localeCompare(String(b.article||b.sku),"ru"))
}
function refreshQuickSkuList(){
 let dl=E("skuQuickList");if(!dl)return;
 dl.innerHTML=quickSkuIndex().map(x=>"<option value='"+X(x.article||x.sku)+"'>"+X(x.name)+" • SKU "+X(x.sku)+"</option>").join("")
}
globalThis.openQuickSku=function(){
 let inp=E("skuQuickSearch"),q=String(inp.value||"").trim().toLowerCase();if(!q)return;
 let idx=quickSkuIndex(),hit=idx.find(x=>String(x.article).toLowerCase()===q||String(x.sku).toLowerCase()===q)
   ||idx.find(x=>(String(x.article)+" "+String(x.sku)+" "+String(x.name)).toLowerCase().includes(q));
 if(!hit){inp.setCustomValidity("SKU не найден в выбранном периоде");inp.reportValidity();setTimeout(()=>inp.setCustomValidity(""),1200);return}
 inp.value=hit.article||hit.sku;openSku(hit.key);collapseSkuSearch()
}
function marketLabel(v){v=String(v||"").toUpperCase();return v==="YANDEX"?"Яндекс":v==="OZON"?"Ozon":v}
function applyMarketplacePageTheme(){let mk=E("marketplace")?String(E("marketplace").value||"ALL").toUpperCase():"ALL";document.body.classList.remove("market-ALL","market-OZON","market-YANDEX","market-WB");document.body.classList.add("market-"+(mk==="OZON"||mk==="YANDEX"||mk==="WB"?mk:"ALL"))}
function availableMarketplaces(){
 let src=[].concat(D.daily||[],D.sku_daily||[],D.lines||[],D.marketplace_products||[]),vals=[...new Set(src.map(rowMarketplace).filter(Boolean))],pri={OZON:1,YANDEX:2,WB:3};
 vals.sort((a,b)=>(pri[a]||99)-(pri[b]||99)||String(a).localeCompare(String(b),"ru"));
 return vals.length?vals:["OZON"]
}
function populateMarketplaceFilter(){
 let sel=E("marketplace"),wrap=E("marketplaceFilterWrap"),old=sel.value||"ALL",vals=availableMarketplaces();
 sel.innerHTML=(vals.length>1?'<option value="ALL">Все маркетплейсы</option>':'')+vals.map(v=>'<option value="'+X(v)+'">'+X(marketLabel(v))+'</option>').join("");
 sel.value=vals.includes(old)?old:(vals.length>1?"ALL":vals[0]);
 if(wrap)wrap.style.display=vals.length>1?"":"none"
}
function populateCabinetFilter(){
 let sel=E("cabinet"),wrap=E("cabinetFilterWrap"),old=sel.value||"ALL",mkt=E("marketplace").value,src=[].concat(D.daily||[],D.sku_daily||[],D.lines||[]);
 let vals=[...new Set(src.filter(x=>mkt==="ALL"||rowMarketplace(x)===mkt).map(x=>String(x.cabinet||"")).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru"));
 if(!vals.length){sel.innerHTML='<option value="ALL">Все кабинеты</option>';sel.value="ALL";if(wrap)wrap.style.display="none";return}
 sel.innerHTML=(vals.length>1?'<option value="ALL">Все кабинеты</option>':'')+vals.map(v=>'<option value="'+X(v)+'">'+X(v)+'</option>').join("");
 sel.value=vals.includes(old)?old:(vals.length>1?"ALL":vals[0]);
 if(wrap)wrap.style.display=vals.length>1?"":"none"
}
function populateDimensionFilters(){
 let cab=E("cabinet").value,mkt=E("marketplace").value,dims=(D.dimensions||[]).filter(d=>(cab==="ALL"||d.cabinet===cab)&&(mkt==="ALL"||rowMarketplace(d)===mkt));
 let oldMaster=E("masterCategory").value||"ALL",oldCat=E("category").value||"ALL",oldBrand=E("brand").value||"ALL";
 let masters=[...new Set(dims.map(d=>d.master_category||"Прочие"))].sort((a,b)=>a.localeCompare(b,"ru"));
 E("masterCategory").innerHTML='<option value="ALL">Все мастер-категории</option>'+masters.map(v=>'<option value="'+X(v)+'">'+X(v)+'</option>').join("");
 E("masterCategory").value=masters.includes(oldMaster)?oldMaster:"ALL";
 let master=E("masterCategory").value;
 let scoped=dims.filter(d=>master==="ALL"||(d.master_category||"Прочие")===master);
 let cats=[...new Set(scoped.map(d=>d.category||"Без категории"))].sort((a,b)=>a.localeCompare(b,"ru"));
 let brands=[...new Set(scoped.map(d=>d.brand||"Без бренда"))].sort((a,b)=>a.localeCompare(b,"ru"));
 E("category").innerHTML='<option value="ALL">Все категории</option>'+cats.map(v=>'<option value="'+X(v)+'">'+X(v)+'</option>').join("");
 E("brand").innerHTML='<option value="ALL">Все бренды</option>'+brands.map(v=>'<option value="'+X(v)+'">'+X(v)+'</option>').join("");
 E("category").value=cats.includes(oldCat)?oldCat:"ALL";E("brand").value=brands.includes(oldBrand)?oldBrand:"ALL"
}
function isLiveRow(x){return x&&(x.is_live===true||String(x.is_live).toLowerCase()==="true")}
// Date lists depend only on the snapshot D: computed once per snapshot; callers receive fresh copies.
function liveDateSet(){return new Set(perfCache("liveDates",D,()=>new Set([].concat(D.daily||[],D.sku_daily||[],D.lines||[]).filter(isLiveRow).map(x=>String(x.report_date||"").slice(0,10)).filter(Boolean))))}
function allDates(){return perfCache("allDates",D,()=>[...new Set([].concat(D.daily||[],D.sku_daily||[]).map(x=>String(x.report_date||"").slice(0,10)).filter(Boolean))].sort()).slice()}
function dates(){return perfCache("closedDates",D,()=>{let live=liveDateSet();return allDates().filter(d=>!live.has(d))}).slice()}
function chartLiveDates(){return selectUnclosedChartDates(allDates(),liveDateSet(),periodDates(0),E("days").value)}
function periodDates(offset=0){
 let ds=dates(),v=E("days").value;
 if(v==="MONTH"){
   let last=ds.at(-1)||"",key=last.slice(0,7),cur=ds.filter(d=>d.startsWith(key));
   if(!offset)return cur;
   let first=cur.length?ds.indexOf(cur[0]):ds.length;
   return ds.slice(Math.max(0,first-cur.length),first)
 }
 if(/^\d{4}-\d{2}$/.test(v)){
   let y=Number(v.slice(0,4)),m=Number(v.slice(5,7));
   if(offset){m-=offset;while(m<=0){m+=12;y--}}
   let key=y+"-"+String(m).padStart(2,"0");
   return ds.filter(d=>d.startsWith(key))
 }
 let n=Number(v);if(n>=999)return offset?[]:ds;
 let end=ds.length-offset*n,start=Math.max(0,end-n);return ds.slice(start,end)
}
function prevPeriodDates(){let cur=periodDates(0),prev=periodDates(1);return prev.slice(-cur.length)}
function dailyFor(ds,marketplaceOverride=null){
 let s=new Set(ds),f=currentFilters();if(marketplaceOverride)f={...f,marketplace:marketplaceOverride};
 if(hasEntityFilter(f)){
   const totals=new Map(), detail=new Map();
   for(const x of skuFor(ds)){
     if(marketplaceOverride&&rowMarketplace(x)!==marketplaceOverride)continue;
     const a=totals.get(x.report_date)||{report_date:x.report_date,orders:null,units:0,gmv:0,sku_set:new Set(),is_live:false,is_reconstructed:false};
     a.units+=N(x.units);a.gmv+=N(x.gmv);a.sku_set.add(String(x.article||x.sku).toLowerCase());a.is_live=a.is_live||!!x.is_live;a.is_reconstructed=a.is_reconstructed||!!x.is_reconstructed;
     totals.set(x.report_date,a);
   }
   for(const x of (D.lines||[])){
     if(!s.has(x.report_date))continue;
     const d=dimFor(x.cabinet,x.sku),y={...x,master_category:d.master_category||"Прочие",category:d.category||"Без категории",brand:d.brand||"Без бренда"};
     if(!entityMatch(y,f))continue;
     const a=detail.get(x.report_date)||{orders_set:new Set(),units:0,gmv:0};
     a.orders_set.add([rowMarketplace(y),y.cabinet,y.order_key].join("|"));a.units+=N(y.units);a.gmv+=N(y.gmv);detail.set(x.report_date,a);
   }
   return [...totals.values()].map(a=>{
     const b=detail.get(a.report_date);
     const complete=b&&Math.abs(a.units-b.units)<1e-8&&Math.abs(a.gmv-b.gmv)<1e-8;
     return {report_date:a.report_date,orders:complete?b.orders_set.size:null,orders_complete:!!complete,units:a.units,gmv:a.gmv,distinct_skus:a.sku_set.size,is_live:a.is_live,is_reconstructed:a.is_reconstructed};
   }).sort((a,b)=>a.report_date.localeCompare(b.report_date))
 }

 let m=new Map();
 for(const x of (D.daily||[])){
   if(!s.has(x.report_date))continue;
   if(f.cab!=="ALL"&&x.cabinet!==f.cab)continue;
   if(f.marketplace!=="ALL"&&rowMarketplace(x)!==f.marketplace)continue;
   let a=m.get(x.report_date)||{report_date:x.report_date,orders:0,units:0,gmv:0,distinct_skus:0,is_live:false,is_reconstructed:false};
   a.orders+=N(x.orders);a.units+=N(x.units);a.gmv+=N(x.gmv);a.distinct_skus+=N(x.distinct_skus);a.is_live=a.is_live||!!x.is_live;a.is_reconstructed=a.is_reconstructed||!!x.is_reconstructed;m.set(x.report_date,a)
 }
 return [...m.values()].sort((a,b)=>a.report_date.localeCompare(b.report_date))
}
function skuFor(ds,f=currentFilters()){
 let s=new Set(ds),out=[];
 for(const x of (D.sku_daily||[])){
   if(!s.has(x.report_date)||(f.cab!=="ALL"&&x.cabinet!==f.cab)||(f.marketplace!=="ALL"&&rowMarketplace(x)!==f.marketplace))continue;
   let d=dimFor(x.cabinet,x.sku),y={...x,master_category:d.master_category||"Прочие",category:d.category||"Без категории",brand:d.brand||"Без бренда"};
   if(f.masterCategory!=="ALL"&&y.master_category!==f.masterCategory)continue;
   if(f.category!=="ALL"&&y.category!==f.category)continue;
   if(f.brand!=="ALL"&&y.brand!==f.brand)continue;
   if(!textMatch(y.article,y.product_name,y.sku,f.q))continue;
   out.push(y)
 }
 return out
}
function aggregateDaily(rows){return{orders:rows.some(x=>x.orders===null)?null:rows.reduce((s,x)=>s+N(x.orders),0),units:rows.reduce((s,x)=>s+N(x.units),0),gmv:rows.reduce((s,x)=>s+N(x.gmv),0)}}
function aggregateSku(ds,f=currentFilters()){
 const m=new Map();
 for(const x of skuFor(ds,f)){
   let k=canonicalKey(x),mk=rowMarketplace(x);
   let a=m.get(k)||{key:k,marketplace:mk,cabinet:x.cabinet,sku:x.sku,article:x.canonical_sku||x.article,canonical_sku:x.canonical_sku||x.article,product_name:x.product_name,master_category:x.master_category||"Прочие",category:x.category||"Без категории",brand:x.brand||"Без бренда",orders:0,units:0,gmv:0,live:false,reconstructed:false,commission_amount:0,logistics_amount:0,expected_received:0,known_cost_rows:0,known_cost_units:0,known_cost_gmv:0,latest_date:"",latest_gmv:0,latest_units:0,actual_logistics_units:0,forecast_logistics_units:0,actual_logistics_amount:0,forecast_logistics_amount:0,finance_commission_units:0,posting_commission_units:0,tariff_commission_units:0,finance_commission_amount:0,posting_commission_amount:0,tariff_commission_amount:0,current_price:null,tariff_rate_pct:null};
   a.orders+=N(x.orders);a.units+=N(x.units);a.gmv+=N(x.gmv);a.live=a.live||!!x.is_live;a.reconstructed=a.reconstructed||!!x.is_reconstructed;
   if(String(x.report_date)>a.latest_date){a.latest_date=String(x.report_date);a.latest_gmv=N(x.gmv);a.latest_units=N(x.units);a.current_price=x.current_price==null?null:N(x.current_price)}
   else if(String(x.report_date)===a.latest_date){a.latest_gmv+=N(x.gmv);a.latest_units+=N(x.units)}
   if(mk==="WB"&&x.commission_pct!==null&&x.commission_pct!==undefined)a.tariff_rate_pct=N(x.commission_pct);
   if(x.expected_received!==null&&x.expected_received!==undefined){
     let cu=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_units):N(x.units),cg=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_gmv):N(x.gmv);
     a.commission_amount+=N(x.commission_amount);a.logistics_amount+=N(x.logistics_amount);a.expected_received+=N(x.expected_received);
     a.known_cost_units+=cu;a.known_cost_gmv+=cg;
     a.actual_logistics_units+=N(x.actual_logistics_units);a.forecast_logistics_units+=N(x.forecast_logistics_units);a.actual_logistics_amount+=N(x.actual_logistics_amount);a.forecast_logistics_amount+=N(x.forecast_logistics_amount);a.finance_commission_units+=N(x.finance_commission_units);a.posting_commission_units+=N(x.posting_commission_units);a.tariff_commission_units+=N(x.tariff_commission_units);a.finance_commission_amount+=N(x.finance_commission_amount);a.posting_commission_amount+=N(x.posting_commission_amount);a.tariff_commission_amount+=N(x.tariff_commission_amount);a.known_cost_rows++
   }
   m.set(k,a)
 }
 for(const a of m.values()){
   a.price=a.units?a.gmv/a.units:0;
   a.commission_pct=(a.marketplace==="WB"&&a.tariff_rate_pct!=null)?a.tariff_rate_pct:(a.known_cost_gmv?a.commission_amount/a.known_cost_gmv*100:null);
   a.logistics_per_unit=a.known_cost_units?a.logistics_amount/a.known_cost_units:null;
   a.received_per_unit=a.known_cost_units?a.expected_received/a.known_cost_units:null;
   a.cost_coverage_pct=a.units?a.known_cost_units/a.units*100:0;
   a.cost_partial=a.known_cost_units>0&&a.known_cost_units<a.units;
   a.logistics_status=a.known_cost_units>=a.units&&a.units>0?"fact":a.known_cost_units>0?"mixed":"pending";
   a.commission_status=a.known_cost_units>=a.units&&a.units>0?"fact":a.known_cost_units>0?"mixed":"pending";
   a.has_ref=a.known_cost_units>0;
   let op=operationalEconomicsFor(a.key,a.marketplace);
   if(op){if(op.current_price!=null)a.current_price=op.current_price;a.commission_pct=op.commission_pct;a.logistics_per_unit=op.logistics_per_unit;a.received_per_unit=op.received_per_unit;a.has_ref=op.has_ref;a.econ_source=op}
 }
 return [...m.values()]
}
function dp(a,b){return a==null||b==null?null:N(b)!==0?(N(a)/N(b)-1)*100:null}function prevMap(){let m=new Map();for(const x of aggregateSku(prevPeriodDates()))m.set(x.key,x);return m}
function kpis(){
 let cur=aggregateDaily(dailyFor(periodDates(0))),pre=aggregateDaily(dailyFor(prevPeriodDates())),days=periodDates(0).length,avgPrice=cur.units?cur.gmv/cur.units:0;
 let arr=[["GMV заказов",R(cur.gmv),dp(cur.gmv,pre.gmv)],["Заказано, шт",I(cur.units),dp(cur.units,pre.units)],["Заказов",I(cur.orders),dp(cur.orders,pre.orders)],["Средняя цена",R(avgPrice),pre.units?dp(avgPrice,pre.gmv/pre.units):null],["GMV / день",R(days?cur.gmv/days:0),null]];
 E("kpis").innerHTML=arr.map(x=>"<div class='card pad'><div class='kl'>"+x[0]+"</div><div class='kv'>"+x[1]+"</div><div class='kd "+C(x[2])+"'>"+(x[2]==null?"":S(x[2])+x[2].toFixed(1)+"%")+"</div></div>").join("")
}
const TREND_MARKETS=["OZON","WB","YANDEX"];
function blankTrendStats(){return{gmv:0,units:0,orders:0}}
function trendVisibleMarkets(){let mk=currentFilters().marketplace;return mk==="ALL"?TREND_MARKETS:[mk]}
function trendStatsFor(ds,mk=null){return aggregateDaily(dailyFor(ds,mk))}
function trendMarketName(mk){return mk==="OZON"?"Ozon":mk==="YANDEX"?"Yandex":"WB"}
function trendMarketClass(mk){return mk==="OZON"?"ozon":mk==="YANDEX"?"yandex":"wb"}
function trendDeltaHtml(current,baseline,enabled=true,integer=false){if(!enabled)return"";let v=dp(current,baseline);if(v==null)return"<span class='trend-delta neu'>—</span>";let cls=v>0?"pos":v<0?"neg":"neu",arrow=v>0?"↑ ":v<0?"↓ ":"",shown=integer?Math.round(Math.abs(v)).toFixed(0):Math.abs(v).toFixed(1);return"<span class='trend-delta "+cls+"'>"+arrow+(v<0?"-":"+")+shown+"%</span>"}
function trendMetricHtml(label,current,baseline,kind,showDelta=true,integerDelta=false){let value=kind==="gmv"?R(current):I(current)+(kind==="units"?" шт":"");return"<div class='trend-metric'><span class='trend-metric-label'>"+label+"</span><div class='trend-value-line'><b>"+value+"</b>"+trendDeltaHtml(current,baseline,showDelta,integerDelta)+"</div></div>"}
function trendMetricsHtml(current,baseline,showDelta=true,integerDelta=false){return"<div class='trend-metrics'>"+trendMetricHtml("GMV",current.gmv,baseline.gmv,"gmv",showDelta,integerDelta)+trendMetricHtml("Шт.",current.units,baseline.units,"units",showDelta,integerDelta)+trendMetricHtml("Заказы",current.orders,baseline.orders,"orders",showDelta,integerDelta)+"</div>"}
function trendMarketCardHtml(mk,current,baseline,showDelta=true,compact=false,integerDelta=false){return"<div class='trend-market-card "+(compact?"compact ":"")+trendMarketClass(mk)+"'><div class='trend-market-head'><span class='trend-market-icon'>"+(mk==="YANDEX"?"Я":mk==="OZON"?"OZ":"WB")+"</span><b>"+trendMarketName(mk)+"</b></div>"+trendMetricsHtml(current,baseline,showDelta,integerDelta)+"</div>"}
function renderTrendSummary(closedDates,previousDates){
 let totals=calculateTrendPeriodTotals(dailyFor(closedDates),dailyFor(previousDates),closedDates.length),current=totals.total.current,previous=totals.total.previous,markets=trendVisibleMarkets();
 E("trendSummary").innerHTML="<div class='trend-summary-total'><div class='trend-summary-title'>Итог за "+closedDates.length+" закрытых дней</div>"+trendMetricsHtml(current,previous,true,true)+"</div><div class='trend-market-list'>"+markets.map(mk=>trendMarketCardHtml(mk,trendStatsFor(closedDates,mk),trendStatsFor(previousDates,mk),true,false,true)).join("")+"</div>"
}
function trend(){
 let closedDates=periodDates(0),previousDates=prevPeriodDates(),closedRows=dailyFor(closedDates),liveRows=dailyFor(chartLiveDates()).filter(isLiveRow),curRows=closedRows.concat(liveRows).sort((a,b)=>a.report_date.localeCompare(b.report_date)),prevRows=dailyFor(previousDates),mode=E("trendMode").value,field=mode==="gmv"?"gmv":mode==="orders"?"orders":"units",label=mode==="gmv"?"Оборот, ₽":mode==="orders"?"Заказы":"Штуки";
 if(mode==="orders"&&curRows.some(row=>row.orders===null)){
 E("trend").setAttribute("viewBox","0 0 900 260");E("trend").innerHTML="<text x='450' y='130' text-anchor='middle' fill='#667085'>Нет полной детализации заказов за выбранный период</text>";
 globalThis._trendCur=[];E("trendDayDetail").innerHTML="<span class='neu'>Оборот и штуки доступны в других режимах графика.</span>";renderTrendSummary(closedDates,previousDates);return;
 }
 let ff=currentFilters(),scope=[];if(ff.category!=="ALL")scope.push(ff.category);if(ff.brand!=="ALL")scope.push(ff.brand);if(ff.q)scope.push("поиск: "+ff.q);E("trendDesc").textContent=(mode==="gmv"?"Оборот заказов по дням":mode==="orders"?"Количество заказов по дням":"Заказанные штуки по дням")+" • LIVE не входит в расчёты"+(scope.length?" • "+scope.join(" • "):"");
 let vals=curRows.concat(prevRows).map(function(x){return N(x[field])}),max=Math.max.apply(null,[1].concat(vals)),W=900,H=260,pl=62,pr=18,pt=20,pb=34,st=(W-pl-pr)/Math.max(1,curRows.length-1);
 function xp(i){return pl+i*st}function yp(v){return H-pb-(N(v)/max)*(H-pt-pb)}
 let z="",ticks=4;
 for(let t=0;t<=ticks;t++){let val=max*t/ticks,y=yp(val);z+="<line x1='"+pl+"' y1='"+y+"' x2='"+(W-pr)+"' y2='"+y+"' stroke='#eef0f3'/><text x='"+(pl-8)+"' y='"+(y+3)+"' text-anchor='end' font-size='9' fill='#667085'>"+(mode==="gmv"?Math.round(val/1000)+"k":Math.round(val))+"</text>"}
 z+="<text x='8' y='13' class='axis-label'>"+label+"</text>";
 let prev=prevRows.slice(0,closedRows.length),prevPts=prev.map(function(r,i){return xp(i)+","+yp(r[field])});
 if(prevPts.length>1)z+="<polyline fill='none' stroke='var(--a)' stroke-width='3' stroke-dasharray='7 6' opacity='.24' points='"+prevPts.join(" ")+"'/>";
 prev.forEach(function(r,i){z+="<circle cx='"+xp(i)+"' cy='"+yp(r[field])+"' r='3' fill='var(--a)' opacity='.22'/>"});
 let pts=closedRows.map(function(r,i){return xp(i)+","+yp(r[field])});
 if(pts.length>1)z+="<polyline fill='none' stroke='var(--a)' stroke-width='4' points='"+pts.join(" ")+"'/>";
 curRows.forEach(function(r,i){let val=N(r[field]),live=isLiveRow(r);z+="<circle class='trend-dot' data-trend-index='"+i+"' cx='"+xp(i)+"' cy='"+yp(val)+"' r='"+(live?6:5)+"' fill='"+(live?"#f47b20":"var(--a)")+"'/><text x='"+xp(i)+"' y='"+(H-8)+"' text-anchor='middle' font-size='9' fill='#667085'>"+r.report_date.slice(5)+"</text>";if(curRows.length<=14)z+="<text x='"+xp(i)+"' y='"+Math.max(12,yp(val)-9)+"' text-anchor='middle' font-size='9' font-weight='700'>"+(mode==="gmv"?Math.round(val/1000)+"k":Math.round(val))+"</text>";if(live&&r.report_date===liveRows.at(-1)?.report_date)z+="<text x='"+xp(i)+"' y='13' text-anchor='middle' font-size='8' font-weight='800' fill='#c4320a'>LIVE</text>"});
 E("trend").setAttribute("viewBox","0 0 "+W+" "+H);E("trend").innerHTML=z;globalThis._trendCur=curRows;globalThis._trendClosedCount=closedRows.length;
 E("trendPeriodNote").textContent="Итог за "+closedRows.length+" закрытых дней"+(liveRows.length>1?" • "+(liveRows.length-1)+" дней ожидают закрытия и показаны оранжевыми точками; в итог не включены":"");E("trendDayDetail").innerHTML="<span class='neu'>Нажми на точку, чтобы посмотреть выбранный день.</span>";renderTrendSummary(closedDates,previousDates)
}
globalThis.showTrendPoint=function(i){
 let c=(globalThis._trendCur||[])[i];if(!c)return;let live=isLiveRow(c),closedDays=globalThis._trendClosedCount||periodDates(0).length,currentTotal=trendStatsFor(periodDates(0)),comparison=calculateTrendDayComparison(c,currentTotal,closedDays,live);
 let markets=trendVisibleMarkets(),dayMarkets=markets.map(mk=>{let rows=dailyFor([c.report_date],mk),day=rows.length?aggregateDaily(rows):blankTrendStats(),total=trendStatsFor(periodDates(0),mk),marketComparison=calculateTrendDayComparison(day,total,closedDays,live);return trendMarketCardHtml(mk,day,marketComparison.average,!live,true)}).join("");
 E("trendDayDetail").innerHTML="<div class='trend-day-head'><b>"+(live?"LIVE за ":"Данные за ")+X(c.report_date)+"</b><span class='badge "+(live?"bg-live":"bg-fact")+"'>"+(live?"Оперативные данные":"Закрытый день")+"</span></div><div class='trend-day-content'><div class='trend-day-total'>"+trendMetricsHtml(c,comparison.average,!live)+"</div><div class='trend-day-markets'>"+dayMarkets+"</div></div>"+(live?"<div class='trend-live-note'>LIVE: показан только факт, без дельт.</div>":"<div class='trend-average-note'>Дельта к среднему закрытому дню выбранного периода.</div>")
}
function allMarketAvgDailySales14d(a){
 let rows=(D&&Array.isArray(D.sku_daily))?D.sku_daily:[],art=normArticle(a&&a.article);if(!art)return 0;
 let maxDate=dates().at(-1)||"";if(!maxDate)return 0;
 let end=new Date(maxDate+"T00:00:00Z"),start=new Date(end);start.setUTCDate(start.getUTCDate()-13);
 let startS=start.toISOString().slice(0,10),units=0;
 for(const x of (rows.length?skuRowsByArticle(art):[])){
   let d=String(x.report_date||"");
   if(d<startS||d>maxDate||isLiveRow(x))continue;
   if(normArticle(x.article)!==art)continue;
   units+=N(x.units);
 }
 return units/14
}
function avgContentScore(a,f=currentFilters()){
 let art=normArticle(a.article),sku=String(a.sku||"");
 // Candidates = rows matching (art&&normArticle(offer_id)===art)||(sku&&String(sku)===sku), in CONTENT order.
 let idx=contentIndex(),ids=[...new Set([...(art?idx.byArticle.get(art)||[]:[]),...(sku?idx.bySku.get(sku)||[]:[])])].sort((x,y)=>x-y);
 let arr=ids.map(i=>CONTENT[i]).filter(c=>{
   if(f.marketplace!=="ALL"&&String(c.marketplace||"").toUpperCase()!==f.marketplace)return false;
   if(f.cab!=="ALL"&&c.cabinet!==f.cab)return false;
   return true
 });
 if(!arr.length)return null;
 return arr.reduce((s,c)=>s+N(c.content_score),0)/arr.length
}
function riskFor(a,pm,f=currentFilters()){
 let p0=pm.get(a.key)||{},gmvPrev=N(p0.gmv),gmvPct=gmvPrev?((N(a.gmv)/gmvPrev)-1)*100:null;
 let pricePrev=N(p0.price),pricePct=pricePrev?((N(a.price)/pricePrev)-1)*100:null;
 let st=stockFor(a),stockQty=st?N(st.total_stock):null,contentScore=avgContentScore(a,f),level=0,reasons=[];
 if(st&&stockQty<=0){level=3;reasons.push("нет остатка")}
 if(gmvPct!=null&&gmvPct<=-30){level=Math.max(level,2);reasons.push("GMV "+gmvPct.toFixed(0)+"%")}
 else if(gmvPct!=null&&gmvPct<=-15){level=Math.max(level,1);reasons.push("GMV "+gmvPct.toFixed(0)+"%")}
 if(pricePct!=null&&pricePct>=15&&gmvPct!=null&&gmvPct<0){level=Math.max(level,2);reasons.push("цена +"+pricePct.toFixed(0)+"%")}
 else if(pricePct!=null&&pricePct>=10&&gmvPct!=null&&gmvPct<0){level=Math.max(level,1);reasons.push("цена +"+pricePct.toFixed(0)+"%")}
 if(contentScore!=null&&contentScore<60){level=Math.max(level,2);reasons.push("контент "+contentScore.toFixed(0))}
 else if(contentScore!=null&&contentScore<75){level=Math.max(level,1);reasons.push("контент "+contentScore.toFixed(0))}
 let label=level===3?"Критично":level===2?"Проблема":level===1?"Внимание":"Норма",cls=level===3?"critical":level===2?"problem":level===1?"watch":"normal";
 return{level,label,cls,reasons:reasons.slice(0,2),gmvPct,pricePct,stockQty,contentScore}
}
function tableRow(a){
 let st=stockFor(a),qty=st?N(st.total_stock):null,avg14=allMarketAvgDailySales14d(a),days=(st&&avg14>0)?qty/avg14:null;
 let stockText="—";
 if(qty!=null){
   if(days==null)stockText=I(qty)+" шт";
   else{
     let cls=days<14?"stock-days-red":days<=30?"stock-days-orange":"stock-days-green";
     stockText=I(qty)+" шт · "+days.toFixed(1)+" дн";
   }
 }
 return"<tr class='click' data-key='"+X(a.key)+"' onclick='openSku(this.dataset.key)'><td><div class='sku'>"+X(a.article||a.sku)+"</div></td><td class='r'>"+R(a.gmv)+"</td><td class='r'>"+I(a.units)+"</td><td class='r'>"+R(a.price)+"</td><td class='r' style='white-space:nowrap'>"+stockText+"</td><td class='r' style='white-space:nowrap'>"+X(channelShareText(a))+"</td></tr>";
}
globalThis.setMoverMode=function(mode,btn){let box=E("moverMode");box.dataset.value=mode;box.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===btn));render()}

function mergeOzonEconomics(base,oz){
 const om=new Map();
 for(const x of (oz.sku_daily||[]))om.set([x.report_date,x.cabinet,String(x.sku||"")].join("|"),x);
 for(const x of (base.sku_daily||[])){
   if(rowMarketplace(x)!=="OZON")continue;
   const o=om.get([x.report_date,x.cabinet,String(x.sku||"")].join("|"));if(!o)continue;

   x.ref_month=o.ref_month;
   x.current_price=o.current_price;

   const units=N(x.units),gmv=N(x.gmv);
   const cp=(o.commission_pct===null||o.commission_pct===undefined)?null:N(o.commission_pct);
   const lp=(o.logistics_per_unit===null||o.logistics_per_unit===undefined)?null:N(o.logistics_per_unit);

   x.commission_pct=cp;
   x.commission_amount=cp==null?null:gmv*cp/100;
   x.finance_commission_units=0;
   x.posting_commission_units=0;
   x.tariff_commission_units=cp==null?0:units;
   x.finance_commission_amount=0;
   x.posting_commission_amount=0;
   x.tariff_commission_amount=x.commission_amount==null?0:x.commission_amount;
   x.commission_status=o.commission_status||"current";

   x.logistics_per_unit=lp;
   const logAmount=lp==null?null:units*lp;
   const sourceWasActual=N(o.actual_logistics_units)>0&&N(o.forecast_logistics_units)===0;
   x.actual_logistics_units=sourceWasActual?units:0;
   x.forecast_logistics_units=lp==null?0:(sourceWasActual?0:units);
   x.actual_logistics_amount=sourceWasActual&&logAmount!=null?logAmount:0;
   x.forecast_logistics_amount=!sourceWasActual&&logAmount!=null?logAmount:0;
   x.logistics_status=o.logistics_status;
   x.logistics_amount=logAmount;

   x.expected_received=(x.commission_amount==null||logAmount==null)?null:gmv-x.commission_amount-logAmount;
 }
 base.stocks=[...(Array.isArray(base.stocks)?base.stocks:[]),...(Array.isArray(oz.stocks)?oz.stocks:[])];
 base.positions=Array.isArray(oz.positions)&&oz.positions.length?oz.positions:(Array.isArray(base.positions)?base.positions:[]);
 base.ads=[...(Array.isArray(base.ads)?base.ads:[]),...(Array.isArray(oz.ads)?oz.ads:[])];
 base.ozon_current=Array.isArray(oz.ozon_current)?oz.ozon_current:[];
 base.ozon_ads_campaigns=Array.isArray(oz.ozon_ads_campaigns)?oz.ozon_ads_campaigns:[];
 base.content=[...(Array.isArray(base.content)?base.content:[]),...(Array.isArray(oz.content)?oz.content:[])];
 return base
}
function channelShareText(a,f=currentFilters()){
 const allowed=new Set(periodDates(0)),tot={OZON:0,YANDEX:0,WB:0};let sum=0;
 for(const x of skuRowsByKey(a.key)){
   let k=canonicalKey(x);
   if(k!==a.key||!allowed.has(x.report_date))continue;
   if(f.cab!=="ALL"&&x.cabinet!==f.cab)continue;
   if(f.marketplace!=="ALL"&&rowMarketplace(x)!==f.marketplace)continue;
   let d=dimFor(x.cabinet,x.sku),master=d.master_category||"Прочие",cat=d.category||"Без категории",brand=d.brand||"Без бренда";
   if(f.masterCategory!=="ALL"&&master!==f.masterCategory)continue;
   if(f.category!=="ALL"&&cat!==f.category)continue;
   if(f.brand!=="ALL"&&brand!==f.brand)continue;
   if(!textMatch(x.article,x.product_name,x.sku,f.q))continue;
   let m=rowMarketplace(x),g=N(x.gmv);tot[m]=(tot[m]||0)+g;sum+=g;
 }
 if(!sum)return"—";
 const parts=[];
 if(tot.OZON)parts.push("OZ "+Math.round(tot.OZON/sum*100)+"%");
 if(tot.YANDEX)parts.push("YA "+Math.round(tot.YANDEX/sum*100)+"%");
 if(tot.WB)parts.push("WB "+Math.round(tot.WB/sum*100)+"%");
 return parts.join(" · ")
}
// Result depends only on the snapshot (sku_daily, closed dates, dimensions), not on filters or the period,
// so it is computed once per SKU and marketplace per snapshot. Callers get a shallow copy, as before.
function operationalEconomicsFor(key,mk){
 mk=String(mk||"").toUpperCase();if(mk!=="WB"&&mk!=="YANDEX")return null;
 let memo=perfCache("operationalEconomics",D,()=>new Map()),ck=String(key)+"\u0000"+mk;
 if(!memo.has(ck))memo.set(ck,computeOperationalEconomics(key,mk));
 let r=memo.get(ck);return r?{...r}:r
}
function computeOperationalEconomics(key,mk){
 let all=(D.sku_daily||[]),ds=dates(),d14=new Set(ds.slice(-14)),d30=new Set(ds.slice(-30));
 let own=skuRowsByKey(key).filter(x=>rowMarketplace(x)===mk);
 if(!own.length)return null;
 own.sort((a,b)=>String(b.report_date||"").localeCompare(String(a.report_date||"")));
 let latestPrice=own.find(x=>x.current_price!==null&&x.current_price!==undefined),currentPrice=latestPrice?N(latestPrice.current_price):null;
 let weightedUnits=own.reduce((s,x)=>s+N(x.units),0),weightedGmv=own.reduce((s,x)=>s+N(x.gmv),0);
 let calculationPrice=currentPrice!=null?currentPrice:(weightedUnits?weightedGmv/weightedUnits:null);
 let priceSource=currentPrice!=null?("master "+String(latestPrice.current_price_source||"кабинет")):"средняя цена продажи периода";
 let targetCat=null;for(const r of own){let dd=dimFor(r.cabinet,r.sku);if(dd&&dd.category){targetCat=dd.category;break}}
 function sumRows(rows,set){
   let cg=0,cu=0,ca=0,la=0;
   for(const x of rows){if(!set.has(String(x.report_date||"")))continue;cg+=N(x.cost_covered_gmv);cu+=N(x.cost_covered_units);ca+=N(x.commission_amount);la+=N(x.logistics_amount)}
   return{cg,cu,ca,la}
 }
 function categoryRows(){
   if(!targetCat)return[];
   let memo=perfCache("categoryRows",D,()=>new Map()),ck=mk+"\u0000"+targetCat;
   if(!memo.has(ck))memo.set(ck,all.filter(x=>rowMarketplace(x)===mk&&(dimFor(x.cabinet,x.sku).category||"Без категории")===targetCat));
   return memo.get(ck)
 }
 function pickMetric(kind){
   let candidates=[
     {rows:own,set:d14,label:"SKU • факт 14д"},
     {rows:own,set:d30,label:"SKU • факт 30д"},
     {rows:categoryRows(),set:d14,label:"категория • факт 14д"},
     {rows:perfCache("marketRows",D,()=>new Map()).get(mk)||perfCache("marketRows",D,()=>new Map()).set(mk,all.filter(x=>rowMarketplace(x)===mk)).get(mk),set:d14,label:"маркет • факт 14д"}
   ];
   for(const c of candidates){let s=sumRows(c.rows,c.set);if(kind==="commission"&&s.cg>0&&s.ca>=0)return{value:s.ca/s.cg*100,source:c.label};if(kind==="logistics"&&s.cu>0&&s.la>=0)return{value:s.la/s.cu,source:c.label}}
   return{value:null,source:"нет данных"}
 }
 let commission,commissionSource;
 if(mk==="WB"){
   let t=own.find(x=>x.commission_pct!==null&&x.commission_pct!==undefined);
   commission=t?N(t.commission_pct):null;commissionSource=t?"тариф сегодня":"нет данных"
 }else{
   let c=pickMetric("commission");commission=c.value;commissionSource=c.source
 }
 let l=pickMetric("logistics"),logistics=l.value;
 let received=(calculationPrice!=null&&commission!=null&&logistics!=null)?calculationPrice*(1-commission/100)-logistics:null;
 return{current_price:currentPrice,calculation_price:calculationPrice,price_source:priceSource,commission_pct:commission,commission_source:commissionSource,logistics_per_unit:logistics,logistics_source:l.source,received_per_unit:received,has_ref:commission!=null&&logistics!=null}
}
function marketBreakdownFor(key){
 const allowed=new Set(periodDates(0)),f=currentFilters(),m=new Map();
 for(const x of (D.sku_daily||[])){
   let k=canonicalKey(x);
   if(k!==key||!allowed.has(x.report_date))continue;
   if(f.cab!=="ALL"&&x.cabinet!==f.cab)continue;
   let d=dimFor(x.cabinet,x.sku),master=d.master_category||"Прочие",cat=d.category||"Без категории",brand=d.brand||"Без бренда";
   if(f.masterCategory!=="ALL"&&master!==f.masterCategory)continue;
   if(f.category!=="ALL"&&cat!==f.category)continue;
   if(f.brand!=="ALL"&&brand!==f.brand)continue;
   if(!textMatch(x.article,x.product_name,x.sku,f.q))continue;
   let mk=rowMarketplace(x),a=m.get(mk)||{marketplace:mk,units:0,gmv:0,commission_amount:0,logistics_amount:0,storage_amount:0,other_amount:0,expected_received:0,cost_units:0,cost_gmv:0,current_price:null,tariff_rate_pct:null,latest_date:"",sku:x.sku||"",article:x.article||"",cabinet:x.cabinet||""};
   a.units+=N(x.units);a.gmv+=N(x.gmv);
   if(String(x.report_date||"")>=a.latest_date){a.latest_date=String(x.report_date||"");a.sku=x.sku||a.sku;a.article=x.article||a.article;a.cabinet=x.cabinet||a.cabinet;if(x.current_price!==null&&x.current_price!==undefined)a.current_price=N(x.current_price)}
   if(mk==="WB"&&x.commission_pct!==null&&x.commission_pct!==undefined)a.tariff_rate_pct=N(x.commission_pct);
   if(x.expected_received!==null&&x.expected_received!==undefined){
     let cu=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_units):N(x.units),cg=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_gmv):N(x.gmv);
     a.commission_amount+=N(x.commission_amount);a.logistics_amount+=N(x.logistics_amount);a.storage_amount+=N(x.storage_amount);a.other_amount+=N(x.other_amount);a.expected_received+=N(x.expected_received);a.cost_units+=cu;a.cost_gmv+=cg
   }
   m.set(mk,a)
 }
 for(const a of m.values()){
   a.avg_price=a.units?a.gmv/a.units:0;
   a.commission_pct=(a.marketplace==="WB"&&a.tariff_rate_pct!=null)?a.tariff_rate_pct:(a.cost_gmv?a.commission_amount/a.cost_gmv*100:null);
   a.logistics_per_unit=a.cost_units?a.logistics_amount/a.cost_units:null;
   a.received_per_unit=a.cost_units?a.expected_received/a.cost_units:null;
   a.coverage_pct=a.units?a.cost_units/a.units*100:0;
   let op=operationalEconomicsFor(key,a.marketplace);
   if(op){if(op.current_price!=null)a.current_price=op.current_price;a.commission_pct=op.commission_pct;a.logistics_per_unit=op.logistics_per_unit;a.received_per_unit=op.received_per_unit;a.econ_source=op;a.has_ref=op.has_ref}
 }
 return m
}
function allSkuHeader(){
 const m=E("marketplace").value;
 if(m==="ALL")return"<th>SKU</th><th class='r'>Шт</th><th class='r'>GMV</th><th class='r'>Ср. цена</th><th class='r'>Каналы</th>";
 if(m==="OZON"||m==="YANDEX")return"<th>SKU</th><th class='r'>Шт</th><th class='r'>GMV</th><th class='r'>Ср. цена</th><th class='r'>Комиссия</th><th class='r'>Логистика/шт</th><th class='r'>Получено/шт</th>";
 return"<th>SKU</th><th class='r'>Шт</th><th class='r'>GMV</th><th class='r'>Ср. цена</th>";
}
function econCell(a,type){
 if(!a.has_ref)return"—";
 let v=type==="commission"?P(a.commission_pct):type==="logistics"?R(a.logistics_per_unit):R(a.received_per_unit);
 let note=a.econ_source?(type==="commission"?a.econ_source.commission_source:type==="logistics"?a.econ_source.logistics_source:(a.econ_source.price_source+" − комиссия − логистика")):a.cost_partial?"Факт по "+a.cost_coverage_pct.toFixed(0)+"% проданных шт.":"Факт по выбранному периоду";
 return"<span title='"+X(note)+"'>"+v+(a.cost_partial?" *":"")+"</span>"
}
function tables(){
 let sk=aggregateSku(periodDates(0)),pm=prevMap();
 let risks=sk.map(a=>({a,r:riskFor(a,pm)})).filter(x=>x.r.level>0).sort((x,y)=>y.r.level-x.r.level||N(x.r.gmvPct)-N(y.r.gmvPct));
 let riskLim=E("riskLimit").value;if(riskLim!=="all")risks=risks.slice(0,Number(riskLim));
 E("risks").innerHTML=risks.length?risks.map(x=>{
   let priceCls=x.r.pricePct==null?"neu":x.r.pricePct>0?"neg":x.r.pricePct<0?"pos":"neu";
   let priceText=x.r.pricePct==null?"—":S(x.r.pricePct)+x.r.pricePct.toFixed(1)+"%";
   let gmvText=x.r.gmvPct==null?"—":S(x.r.gmvPct)+x.r.gmvPct.toFixed(1)+"%";
   let stockText=x.r.stockQty==null?"—":I(x.r.stockQty)+" шт";
   let contentText=x.r.contentScore==null?"—":x.r.contentScore.toFixed(0)+" / 100";
   let reasons=x.r.reasons.length?"<span class='risk-reasons'>"+X(x.r.reasons.join(" · "))+"</span>":"";
   return"<tr class='click' data-key='"+X(x.a.key)+"' onclick='openSku(this.dataset.key)'><td><div class='sku'>"+X(x.a.article||x.a.sku)+"</div></td><td class='r "+priceCls+"'>"+priceText+"</td><td class='r "+C(x.r.gmvPct)+"'>"+gmvText+"</td><td class='r'>"+stockText+"</td><td class='r'>"+contentText+"</td><td>"+reasons+"</td></tr>"
 }).join(""):"<tr><td colspan='6' class='neu'>Проблемных SKU по текущим правилам нет.</td></tr>";
 let top=[...sk].filter(a=>N(a.units)>=2).sort((a,b)=>b.gmv-a.gmv),lim=E("topLimit").value;
 if(lim!=="all")top=top.slice(0,Number(lim));
 E("topGmv").innerHTML=top.map(tableRow).join("");
 let mode=E("moverMode").dataset.value||"all";
 let mv=sk.map(a=>{let p=pm.get(a.key)||{},pricePct=N(p.price)?((N(a.price)/N(p.price))-1)*100:null,contentScore=avgContentScore(a);return{a,du:N(a.units)-N(p.units),dg:N(a.gmv)-N(p.gmv),pricePct,contentScore}})
   .filter(z=>mode==="up"?z.dg>0:mode==="down"?z.dg<0:true);
 if(mode==="up")mv.sort((a,b)=>b.dg-a.dg);
 else if(mode==="down")mv.sort((a,b)=>a.dg-b.dg);
 else mv.sort((a,b)=>Math.abs(b.dg)-Math.abs(a.dg));
 let moverLim=E("moverLimit").value;if(moverLim!=="all")mv=mv.slice(0,Number(moverLim));
 E("movers").innerHTML=mv.map(z=>{let priceCls=z.pricePct==null?"neu":z.pricePct>0?"neg":z.pricePct<0?"pos":"neu",priceText=z.pricePct==null?"—":S(z.pricePct)+z.pricePct.toFixed(1)+"%",contentText=z.contentScore==null?"—":z.contentScore.toFixed(0)+" / 100";return"<tr class='click' data-key='"+X(z.a.key)+"' onclick='openSku(this.dataset.key)'><td><div class='sku'>"+X(z.a.article||z.a.sku)+"</div></td><td class='r'>"+I(z.a.units)+"</td><td class='r "+C(z.du)+"'>"+S(z.du)+I(z.du)+"</td><td class='r "+priceCls+"'>"+priceText+"</td><td class='r'>"+R(z.a.gmv)+"</td><td class='r "+C(z.dg)+"'>"+S(z.dg)+R(z.dg)+"</td><td class='r'>"+contentText+"</td><td class='r' style='white-space:nowrap'>"+X(channelShareText(z.a))+"</td></tr>"}).join("");
 E("cnt").textContent=sk.length+" SKU";E("allSkuHead").innerHTML=allSkuHeader();let selectedMarket=E("marketplace").value,allRows=[...sk].sort((a,b)=>b.gmv-a.gmv),allLim=E("allSkuLimit").value;if(allLim!=="all")allRows=allRows.slice(0,Number(allLim));E("rows").innerHTML=allRows.map(a=>{let base="<tr class='click' data-key='"+X(a.key)+"' onclick='openSku(this.dataset.key)'><td><div class='sku'>"+X(a.article||a.sku)+"</div><div class='nm' title='"+X(a.product_name)+"'>"+X(a.product_name)+"</div></td><td class='r'>"+I(a.units)+"</td><td class='r'>"+R(a.gmv)+"</td><td class='r'>"+R(a.price)+"</td>";if(selectedMarket==="ALL")return base+"<td class='r'>"+X(channelShareText(a))+"</td></tr>";if(selectedMarket==="OZON"||selectedMarket==="YANDEX")return base+"<td class='r'>"+econCell(a,"commission")+"</td><td class='r'>"+econCell(a,"logistics")+"</td><td class='r'>"+econCell(a,"received")+"</td></tr>";return base+"</tr>"}).join("");if(selected)openSku(selected)}
globalThis.setDetailTab=function(tab){detailTab=tab;document.querySelectorAll(".detail-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".tab-pane").forEach(p=>p.classList.toggle("active",p.dataset.tab===tab))}


let skuOverviewKey=null,skuOverviewMarket="ALL";
function skuMarketStatsForDates(key,ds){
 let allowed=new Set(ds),f=currentFilters(),m=new Map();
 for(const x of (D.sku_daily||[])){
   let k=canonicalKey(x);
   if(k!==key||!allowed.has(x.report_date))continue;
   if(f.cab!=="ALL"&&x.cabinet!==f.cab)continue;
   let d=dimFor(x.cabinet,x.sku),master=d.master_category||"Прочие",cat=d.category||"Без категории",brand=d.brand||"Без бренда";
   if(f.masterCategory!=="ALL"&&master!==f.masterCategory)continue;
   if(f.category!=="ALL"&&cat!==f.category)continue;
   if(f.brand!=="ALL"&&brand!==f.brand)continue;
   if(!textMatch(x.article,x.product_name,x.sku,f.q))continue;
   let mk=rowMarketplace(x),a=m.get(mk)||{marketplace:mk,units:0,gmv:0,commission_amount:0,logistics_amount:0,expected_received:0,cost_units:0,cost_gmv:0,current_price:null,tariff_rate_pct:null,latest_date:"",sku:x.sku||"",article:x.article||"",cabinet:x.cabinet||""};
   a.units+=N(x.units);a.gmv+=N(x.gmv);
   if(String(x.report_date||"")>=a.latest_date){a.latest_date=String(x.report_date||"");a.sku=x.sku||a.sku;a.article=x.article||a.article;a.cabinet=x.cabinet||a.cabinet;if(x.current_price!==null&&x.current_price!==undefined)a.current_price=N(x.current_price)}
   if(mk==="WB"&&x.commission_pct!==null&&x.commission_pct!==undefined)a.tariff_rate_pct=N(x.commission_pct);
   if(x.expected_received!==null&&x.expected_received!==undefined){
     let cu=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_units):N(x.units),cg=(mk==="YANDEX"||mk==="WB")?N(x.cost_covered_gmv):N(x.gmv);
     a.commission_amount+=N(x.commission_amount);a.logistics_amount+=N(x.logistics_amount);a.expected_received+=N(x.expected_received);a.cost_units+=cu;a.cost_gmv+=cg
   }
   m.set(mk,a)
 }
 for(const a of m.values()){
   a.avg_price=a.units?a.gmv/a.units:null;
   a.commission_pct=(a.marketplace==="WB"&&a.tariff_rate_pct!=null)?a.tariff_rate_pct:(a.cost_gmv?a.commission_amount/a.cost_gmv*100:null);
   a.logistics_per_unit=a.cost_units?a.logistics_amount/a.cost_units:null;
   a.received_per_unit=a.cost_units?a.expected_received/a.cost_units:null;
   a.coverage_pct=a.units?a.cost_units/a.units*100:0;
   let op=operationalEconomicsFor(key,a.marketplace);
   if(op){if(op.current_price!=null)a.current_price=op.current_price;a.commission_pct=op.commission_pct;a.logistics_per_unit=op.logistics_per_unit;a.received_per_unit=op.received_per_unit;a.econ_source=op;a.has_ref=op.has_ref}
 }
 let out=new Map();
 for(const mk of ["OZON","YANDEX","WB"]){
   let row=m.get(mk)||{marketplace:mk,units:0,gmv:0,avg_price:null,commission_pct:null,logistics_per_unit:null,received_per_unit:null,current_price:null,cost_units:0,coverage_pct:0,sku:"",article:"",cabinet:""};
   let regs=(D.marketplace_products||[]).filter(p=>String(p.marketplace||"").toUpperCase()===mk&&canonicalKey(p)===key&&p.is_active!==false);
   if(regs.length){
     let reg=regs.find(p=>p.current_price!=null)||regs[0];
     row.exists=true;row.registry=regs;
     if(row.current_price==null&&reg.current_price!=null)row.current_price=N(reg.current_price);
     if(row.commission_pct==null){
       let cr=regs.find(p=>p.commission_pct!==null&&p.commission_pct!==undefined);
       if(cr){row.commission_pct=N(cr.commission_pct);row.econ_source={...(row.econ_source||{}),commission_source:cr.commission_source||"категория"}}
     }
     if(!row.article)row.article=reg.canonical_sku||reg.offer_id||reg.external_sku||"";
     if(!row.sku)row.sku=reg.marketplace_product_id||reg.external_sku||"";
     if(!row.cabinet)row.cabinet=reg.cabinet||"";
   }else row.exists=!!m.get(mk);
   out.set(mk,row)
 }
 return out
}
function skuMarketStats(key){return skuMarketStatsForDates(key,periodDates(0))}
function skuPrevMarketStats(key){return skuMarketStatsForDates(key,prevPeriodDates())}
function deltaPct(cur,prev){return prev?((N(cur)/N(prev))-1)*100:null}
function metricMain(value,cur,prev,mode,invert){
 let d=mode==="abs"?N(cur)-N(prev):deltaPct(cur,prev),cls="neu";
 if(d!==null&&isFinite(d)&&Math.abs(d)>=0.0001){if(invert)d=-d;cls=C(d)}
 return"<span class='metric-main "+cls+"'>"+value+"</span>"
}
function positionMain(pos){
 let p=N(pos),cls=p<=50?"pos":p<=150?"warn":"neg";
 return"<span class='metric-main "+cls+"'>№ "+I(p)+"</span>"
}
function deltaHtml(cur,prev,mode){
 let d=mode==="abs"?N(cur)-N(prev):deltaPct(cur,prev);
 if(d===null||!isFinite(d))return"";
 if(Math.abs(d)<0.0001)return"<span class='metric-delta neu'>—</span>";
 let arrow=d>0?"↑ ":"↓ ";
 let txt=mode==="abs"?(arrow+S(d)+I(d)+" шт"):(arrow+S(d)+d.toFixed(1)+"%");
 return"<span class='metric-delta'>"+txt+"</span>"
}
function stockStatusHtml(st,a){
 if(!st)return"<span class='metric-note'>нет данных</span>";
 let avg14=allMarketAvgDailySales14d(a),days=avg14>0?N(st.total)/avg14:null;
 if(days==null)return"<span class='metric-note'>нет продаж 14д</span>";
 let cls=days<7?"critical":days<14?"low":"ok",label=days<7?"Критичный":days<14?"Низкий":"Норма";
 return"<span class='stock-tag "+cls+"'>"+label+" • "+days.toFixed(1)+" дн.</span>"
}
function skuOverallStatus(key){
 let cur=skuMarketStats(key),prev=skuPrevMarketStats(key),cg=0,pg=0;
 for(const x of cur.values())cg+=N(x.gmv);for(const x of prev.values())pg+=N(x.gmv);
 let d=deltaPct(cg,pg);
 if(d==null)return{cls:"flat",label:"нет базы сравнения",delta:null};
 if(d>5)return{cls:"up",label:"растёт",delta:d};
 if(d<-5)return{cls:"down",label:"падает",delta:d};
 return{cls:"flat",label:"стабильно",delta:d}
}
function skuMarketStock(a,mk){
 let art=normArticle(a.article),sku=String(marketSkuFor(mk,a)||a.sku||"");
 let arr=STOCK.filter(x=>String(x.source_marketplace||"OZON").toUpperCase()===mk&&((art&&normArticle(x.offer_id)===art)||(sku&&String(x.sku||"")===sku)));
 if(!arr.length)return null;
 let pri=mk==="OZON"?["Market IPT","PSK","IPCH","BOND"]:["IPT","IPP","IPU","PSK","IPCH","BOND"];
 arr.sort((x,y)=>{let px=pri.indexOf(x.cabinet),py=pri.indexOf(y.cabinet);px=px<0?999:px;py=py<0?999:py;return px!==py?px-py:String(y.captured_at||"").localeCompare(String(x.captured_at||""))});
 let cab=arr[0].cabinet,chosen=arr.filter(x=>x.cabinet===cab);
 return chosen.reduce((z,x)=>{z.total+=N(x.total_stock);z.fbo+=N(x.fbo_stock);z.fbs+=N(x.fbs_stock);z.cabinet=z.cabinet||x.cabinet;return z},{total:0,fbo:0,fbs:0,cabinet:null})
}
function skuOzonPosition(a){
 let art=normArticle(a.article),sku=String(marketSkuFor("OZON",a)||a.sku||""),cab=E("cabinet").value;
 let arr=POSITION.filter(p=>((sku&&String(p.sku||"")===sku)||(art&&normArticle(p.offer_id)===art))&&(cab==="ALL"||p.cabinet===cab)&&N(p.position)>0);
 if(!arr.length&&cab!=="ALL")arr=POSITION.filter(p=>((sku&&String(p.sku||"")===sku)||(art&&normArticle(p.offer_id)===art))&&N(p.position)>0);
 arr.sort((x,y)=>String(y.snapshot_date||y.period_to||"").localeCompare(String(x.snapshot_date||x.period_to||"")));
 return arr[0]||null
}
function skuMarketContent(mk,a){
 mk=String(mk||"").toUpperCase();
 let art=normArticle(a.article),sku=String(marketSkuFor(mk,a)||a.sku||""),cab=E("cabinet").value;
 let arr=CONTENT.filter(c=>rowMarketplace(c)===mk&&((sku&&String(c.sku||"")===sku)||(art&&normArticle(c.offer_id)===art))&&(cab==="ALL"||c.cabinet===cab));
 if(!arr.length&&cab!=="ALL")arr=CONTENT.filter(c=>rowMarketplace(c)===mk&&((sku&&String(c.sku||"")===sku)||(art&&normArticle(c.offer_id)===art)));
 arr.sort((x,y)=>String(y.snapshot_date||y.captured_at||"").localeCompare(String(x.snapshot_date||x.captured_at||"")));
 return arr[0]||null
}
function skuOzonContent(a){return skuMarketContent("OZON",a)}
function skuYandexVisibility(a,offset){
 let art=normArticle(a.article),sku=String(marketSkuFor("YANDEX",a)||a.sku||""),cab=E("cabinet").value,datesSet=new Set(periodDates(offset||0));
 let arr=VISIBILITY.filter(v=>datesSet.has(String(v.report_date||""))&&((art&&normArticle(v.offer_id)===art)||(sku&&String(v.offer_id||"")===sku))&&(cab==="ALL"||String(v.cabinet||"")===cab));
 if(!arr.length&&cab!=="ALL")arr=VISIBILITY.filter(v=>datesSet.has(String(v.report_date||""))&&((art&&normArticle(v.offer_id)===art)||(sku&&String(v.offer_id||"")===sku)));
 if(!arr.length)return null;
 let w=0,s=0,n=0;for(const v of arr){if(v.visibility_index===null||v.visibility_index===undefined||v.visibility_index==="")continue;let x=Number(v.visibility_index);if(!isFinite(x))continue;let ww=Math.max(0,N(v.by_msku_shows));if(ww){s+=x*ww;w+=ww}else{s+=x;n++}}
 return w?s/w:(n?s/n:null)
}
function skuYandexAds(a){
 let art=normArticle(a.article),sku=String(marketSkuFor("YANDEX",a)||a.sku||""),cab=E("cabinet").value;
 let arr=ADS.filter(x=>String(x.marketplace||"YANDEX")==="YANDEX"&&((art&&normArticle(x.offer_id)===art)||(sku&&String(x.offer_id||"")===sku))&&(cab==="ALL"||String(x.cabinet||"")===cab));
 if(!arr.length&&cab!=="ALL")arr=ADS.filter(x=>String(x.marketplace||"YANDEX")==="YANDEX"&&((art&&normArticle(x.offer_id)===art)||(sku&&String(x.offer_id||"")===sku)));
 if(!arr.length)return null;
 let latest=arr.reduce((m,x)=>String(x.period_to||"")>m?String(x.period_to||""):m,"");arr=arr.filter(x=>String(x.period_to||"")===latest);
 let spend=0,orders=0,revenue=0,shows=0,clicks=0,from="";for(const x of arr){spend+=N(x.spend);orders+=N(x.ad_orders);revenue+=N(x.ad_revenue);shows+=N(x.shows);clicks+=N(x.clicks);if(!from||String(x.period_from||"")<from)from=String(x.period_from||"")}
 return{spend,orders,revenue,shows,clicks,drr:revenue?spend/revenue*100:null,period_from:from,period_to:latest}
}
function skuWBAds(a){
 let art=normArticle(a.article),cab=E("cabinet").value,allowed=new Set(periodDates(0));
 let ids=new Set((D.sku_daily||[]).filter(x=>rowMarketplace(x)==="WB"&&art&&normArticle(x.article)===art&&(cab==="ALL"||x.cabinet===cab)).map(x=>String(x.cabinet)+"|"+String(x.sku)));
 let arr=ADS.filter(x=>String(x.marketplace||"")==="WB"&&ids.has(String(x.cabinet)+"|"+String(x.offer_id))&&allowed.has(String(x.period_to||"")));
 if(!arr.length)return null;
 let spend=0,orders=0,revenue=0,shows=0,clicks=0;for(const x of arr){spend+=N(x.spend);orders+=N(x.ad_orders);revenue+=N(x.ad_revenue);shows+=N(x.shows);clicks+=N(x.clicks)}
 return {spend,orders,revenue,shows,clicks,drr:revenue?spend/revenue*100:null};
}
function fmtMaybe(v,type){
 if(v===null||v===undefined||!isFinite(Number(v)))return"<span class='ov-empty'>—</span>";
 return type==="money"?R(v):type==="pct"?P(v):type==="int"?I(v):String(v)
}
function overviewMetric(stats,prev,a,mk,name){
 let x=stats.get(mk),p=prev.get(mk),st=skuMarketStock(a,mk),pos=mk==="OZON"?skuOzonPosition(a):null,ct=(mk==="OZON"||mk==="YANDEX"||mk==="WB")?skuMarketContent(mk,a):null,yv=mk==="YANDEX"?skuYandexVisibility(a,0):null,yp=mk==="YANDEX"?skuYandexVisibility(a,1):null,ya=mk==="YANDEX"?skuYandexAds(a):mk==="WB"?skuWBAds(a):null;
 if(name==="units")return (x.units?metricMain(I(x.units)+" шт",x.units,p.units,"abs"):"—")+(x.units||p.units?deltaHtml(x.units,p.units,"abs"):"");
 if(name==="gmv")return (x.gmv?metricMain(R(x.gmv),x.gmv,p.gmv,"pct"):"—")+(x.gmv||p.gmv?deltaHtml(x.gmv,p.gmv,"pct"):"");
 if(name==="avg")return (x.avg_price?metricMain(R(x.avg_price),x.avg_price,p.avg_price,"pct"):"—")+(x.avg_price||p.avg_price?deltaHtml(x.avg_price,p.avg_price,"pct"):"");
 if(name==="current")return (x.current_price?metricMain(R(x.current_price),x.current_price,p.current_price,"pct"):"—")+(x.current_price?("<span class='metric-note'>"+X(x.econ_source?.price_source||"master cabinet")+"</span>"):"")+(x.current_price&&p.current_price?deltaHtml(x.current_price,p.current_price,"pct"):"");
 if(name==="commission")return x.commission_pct!=null?("<span class='metric-main neu'>"+P(x.commission_pct)+"</span><span class='metric-note'>"+X(x.econ_source?.commission_source||"факт")+"</span>"):"—<span class='metric-note'>нет данных</span>";
 if(name==="logistics")return x.logistics_per_unit!=null?(metricMain(R(x.logistics_per_unit),x.logistics_per_unit,null,"pct",true)+"<span class='metric-note'>"+X(x.econ_source?.logistics_source||"факт")+"</span>"):"—<span class='metric-note'>нет данных</span>";
 if(name==="storage")return mk==="WB"?(x.cost_units&&x.storage_amount?R(x.storage_amount):"—<span class='metric-note'>без привязки к SKU</span>"):"—";
 if(name==="other")return mk==="WB"?(x.cost_units?R(x.other_amount):"—<span class='metric-note'>нет данных</span>"):"—";
 if(name==="received")return x.received_per_unit!=null?(metricMain(R(x.received_per_unit),x.received_per_unit,null,"pct")+"<span class='metric-note'>"+X(x.econ_source?.price_source||"цена")+" − комиссия − логистика</span>"):"—<span class='metric-note'>нет данных</span>";
 if(name==="position"){
   if(mk==="YANDEX"){
     if(yv==null)return"—<span class='metric-note'>нет данных</span>";
     let d=yp==null?null:yv-yp;
     return"<span class='metric-main "+(d==null?"neu":C(d))+"'>"+Number(yv).toFixed(1)+"%</span><span class='metric-note'>видимость</span>"+(d==null?"":("<span class='metric-delta'>"+(d>0?"↑ ":"↓ ")+S(d)+d.toFixed(1)+" п.п.</span>"))
   }
   if(mk!=="OZON")return"—<span class='metric-note'>не подключено</span>";
   if(!pos)return"—<span class='metric-note'>нет данных</span>";
   let cur=N(pos.position),pr=N(pos.previous_position),imp=pr&&cur?pr-cur:null;
   return positionMain(cur)+(imp==null?"":("<span class='metric-delta'>"+(imp>0?"↑ ":"↓ ")+I(Math.abs(imp))+"</span>"))
 }
 function adWindowLabel(z){if(!z||!z.period_from||!z.period_to)return"выбранный период";let a=new Date(z.period_from+"T00:00:00"),b=new Date(z.period_to+"T00:00:00"),n=Math.round((b-a)/86400000)+1;return n+"д • "+String(z.period_from).slice(5)+"–"+String(z.period_to).slice(5)}
 if((name==="ads"||name==="drr")&&mk==="OZON"){let oa=skuMarketAds(a,"OZON",periodDates(0));if(!oa)return"—<span class='metric-note'>нет данных по SKU</span>";return name==="ads"?R(oa.spend)+"<span class='metric-note'>выбранный период</span>":(oa.drr_ads!=null?P(oa.drr_ads)+"<span class='metric-note'>выбранный период</span>":"—<span class='metric-note'>нет выручки рекламы</span>")}
 if(name==="ads")return (mk==="YANDEX"||mk==="WB")?(ya?R(ya.spend)+"<span class='metric-note'>"+X(mk==="WB"?"выбранный период":adWindowLabel(ya))+"</span>":"—<span class='metric-note'>нет данных</span>"):"—<span class='metric-note'>не подключено</span>";
 if(name==="drr")return (mk==="YANDEX"||mk==="WB")?(ya&&ya.drr!=null?P(ya.drr)+"<span class='metric-note'>"+X(mk==="WB"?"выбранный период":adWindowLabel(ya))+"</span>":"—<span class='metric-note'>нет данных</span>"):"—<span class='metric-note'>не подключено</span>";
 if(name==="content")return (mk==="OZON"||mk==="YANDEX"||mk==="WB")?(ct?(I(ct.content_score)+" / 100"+(mk==="WB"?"<span class='metric-note'>наш расчёт</span>":"")):"—<span class='metric-note'>нет данных</span>"):"—<span class='metric-note'>не подключено</span>";
 if(name==="stock")return st?(I(st.total)+" шт"+stockStatusHtml(st,a)):"—<span class='metric-note'>"+("нет данных")+"</span>";
 return"—"
}
function ozonCurrentFor(a,cab){
 let sku=String(marketSkuFor("OZON",a)||a.sku||""),art=normArticle(a.article),pageCab=E("cabinet")?E("cabinet").value:"ALL";
 let arr=(D.ozon_current||[]).filter(r=>(sku&&String(r.sku||"")===sku)||(art&&normArticle(r.offer_id)===art));
 for(const c of [cab,pageCab!=="ALL"?pageCab:null]){if(!c)continue;let f=arr.filter(r=>r.cabinet===c);if(f.length){arr=f;break}}
 arr=[...arr].sort((x,y)=>N(y.logistics_units)-N(x.logistics_units)||String(y.price_date||"").localeCompare(String(x.price_date||"")));
 return arr[0]||null
}
function priceAtPeriodStart(key,mk){
 let ds=periodDates(0),set=new Set(ds);
 let rows=skuRowsByKey(key).filter(x=>rowMarketplace(x)===mk&&set.has(String(x.report_date||""))&&x.current_price!=null&&N(x.current_price)>0).sort((x,y)=>String(x.report_date).localeCompare(String(y.report_date)));
 return rows.length?{price:N(rows[0].current_price),date:String(rows[0].report_date)}:null
}
function dm(v){v=String(v||"");return v.length>=10?v.slice(8,10)+"."+v.slice(5,7):v}
function monthShort(ym){let m=Number(String(ym||"").slice(5,7));return["","янв.","февр.","март","апр.","май","июнь","июль","авг.","сент.","окт.","нояб.","дек."][m]||String(ym||"")}
function Pd(v){return v==null||!isFinite(Number(v))?"—":(Number(v)>0&&Number(v)<0.1?"<0,1%":Number(v).toFixed(1)+"%")}
function skuMarketAds(a,mk,ds){
 ds=ds||periodDates(0);let set=new Set(ds),first=ds[0]||"",last=ds.at(-1)||"",art=normArticle(a.article),sku=String(marketSkuFor(mk,a)||a.sku||"");
 let arr=ADS.filter(x=>rowMarketplace(x)===mk&&((art&&normArticle(x.offer_id)===art)||(sku&&String(x.offer_id||"")===sku)));
 let daily=arr.filter(x=>String(x.period_from||"")===String(x.period_to||"")&&set.has(String(x.period_to||"")));
 let periods=arr.filter(x=>String(x.period_from||"")!==String(x.period_to||"")&&String(x.period_from||"")>=first&&String(x.period_to||"")<=last);
 let use=daily.concat(periods);if(!use.length)return null;
 let z={spend:0,orders:0,revenue:0,shows:0,clicks:0,from:"",to:""};
 for(const x of use){z.spend+=N(x.spend);z.orders+=N(x.ad_orders);z.revenue+=N(x.ad_revenue);z.shows+=N(x.shows);z.clicks+=N(x.clicks);if(!z.from||String(x.period_from)<z.from)z.from=String(x.period_from);if(String(x.period_to)>z.to)z.to=String(x.period_to)}
 z.ctr=z.shows?z.clicks/z.shows*100:null;z.drr_ads=z.revenue?z.spend/z.revenue*100:null;return z
}
function skuOzonPositionStats(a){
 let art=normArticle(a.article),sku=String(marketSkuFor("OZON",a)||a.sku||""),cab=E("cabinet").value;
 let arr=POSITION.filter(p=>((sku&&String(p.sku||"")===sku)||(art&&normArticle(p.offer_id)===art))&&(cab==="ALL"||p.cabinet===cab));
 if(!arr.length)return null;
 let oneDay=arr.filter(p=>!p.period_from||String(p.period_from)===String(p.period_to));if(oneDay.length)arr=oneDay;
 let byDate=new Map();for(const p of arr){let d=String(p.snapshot_date||p.period_to||"");let b=byDate.get(d)||{pos:[],search:0,view:0};if(N(p.position)>0)b.pos.push(N(p.position));b.search+=N(p.unique_search_users);b.view+=N(p.unique_view_users);byDate.set(d,b)}
 let ds=[...byDate.keys()].sort(),last=ds.slice(-7),prev=ds.slice(-14,-7);
 const avg=list=>{let v=list.flatMap(d=>byDate.get(d).pos);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};
 let search=0,view=0;for(const d of last){search+=byDate.get(d).search;view+=byDate.get(d).view}
 return{position:avg(last),previous:avg(prev),from:last[0],to:last.at(-1),days:last.length,search,view,conversion:search?view/search*100:null}
}
function skuContentDate(ct){return ct?(ct.snapshot_date||String(ct.captured_at||"").slice(0,10)):""}
globalThis.setSkuOverviewMarket=function(mk){skuOverviewMarket=mk;detailTab="overview";if(selected)openSku(selected)}
function buildSkuOverview(key,a){
 let stats=skuMarketStats(key),prev=skuPrevMarketStats(key),markets=["OZON","YANDEX","WB"],allUnits=0,allGmv=0,prevUnits=0,prevGmv=0;
 for(const x of stats.values()){allUnits+=N(x.units);allGmv+=N(x.gmv)}
 for(const x of prev.values()){prevUnits+=N(x.units);prevGmv+=N(x.gmv)}
 let avg=allUnits?allGmv/allUnits:0,pavg=prevUnits?prevGmv/prevUnits:null,st=stockFor(a),avg14=allMarketAvgDailySales14d(a),days=st&&avg14>0?N(st.total_stock)/avg14:null;
 let du=allUnits-prevUnits,dgp=deltaPct(allGmv,prevGmv),dap=deltaPct(avg,pavg);
 if(!skuOverviewMarket)skuOverviewMarket="ALL";
 let buttons=["ALL"].concat(markets).map(mk=>{let cls=mk==="OZON"?"ozon":mk==="YANDEX"?"yandex":mk==="WB"?"wb":"";return"<button type='button' data-overview-market='"+mk+"' class='market-tab "+cls+" "+(skuOverviewMarket===mk?"active":"")+"'>"+X(mk==="ALL"?"Все":marketLabel(mk))+"</button>"}).join("");
 let stockStatus=st?(days==null?"нет продаж 14д":days<7?"Критичный":days<14?"Низкий":"Норма"):"нет данных",stockCls=!st?"neu":days==null?"neu":days<7?"neg":days<14?"neu":"pos";
 let top="<div class='kpi4' style='grid-template-columns:repeat(5,1fr)'><div class='kpi-mini'><div class='mn'>Продано</div><div class='mv'>"+I(allUnits)+" шт</div><div class='kpi-sub "+C(du)+"'>"+(du===0?"—":S(du)+I(du)+" шт")+"</div></div>"+
   "<div class='kpi-mini'><div class='mn'>Оборот</div><div class='mv'>"+R(allGmv)+"</div><div class='kpi-sub "+C(dgp)+"'>"+(dgp==null?"—":S(dgp)+dgp.toFixed(1)+"%")+"</div></div>"+
   "<div class='kpi-mini'><div class='mn'>Средняя цена продажи</div><div class='mv'>"+R(avg)+"</div><div class='kpi-sub neu'>"+(dap==null?"—":S(dap)+dap.toFixed(1)+"%")+"</div></div>"+
   "<div class='kpi-mini'><div class='mn'>Остаток</div><div class='mv'>"+(st?I(st.total_stock)+" шт":"—")+"</div><div class='kpi-sub neu'>"+(st&&st.source_cabinet?X("источник: "+(st.source_marketplace==="YANDEX"?"Яндекс ":"")+st.source_cabinet):"нет данных")+"</div></div>"+
   "<div class='kpi-mini'><div class='mn'>Запас</div><div class='mv'>"+(days==null?"—":days.toFixed(1)+" дн.")+"</div><div class='kpi-sub "+stockCls+"'>"+X(stockStatus)+"</div></div></div>";
 let badge=skuOverviewMarket==="OZON"?"<span class='market-badge ozon'>Ozon</span>":skuOverviewMarket==="YANDEX"?"<span class='market-badge yandex'>Яндекс</span>":skuOverviewMarket==="WB"?"<span class='market-badge wb'>WB</span>":"";
 let toolbar="<div class='ov-toolbar'><div><div class='ov-market-title'><div class='section-title'>Маркетплейс</div>"+badge+"</div><div class='desc'>Карточка независима от фильтра страницы.</div></div><div class='seg market-seg'>"+buttons+"</div></div>";
 if(skuOverviewMarket==="ALL"){
   let rows=[
    ["Продано","units"],["GMV","gmv"],["Средняя цена","avg"],["Текущая цена","current"],
    ["Комиссия","commission"],["Логистика / шт","logistics"],["Получено / шт","received"],
    ["Позиция / видимость","position"],["Реклама","ads"],["ДРР","drr"],["Контент","content"]
   ];
   let head="<thead><tr><th>Показатель</th>"+markets.map(m=>"<th>"+X(marketLabel(m))+"</th>").join("")+"</tr></thead>";
   let body=rows.map(r=>"<tr><th>"+r[0]+"</th>"+markets.map(m=>"<td>"+overviewMetric(stats,prev,a,m,r[1])+"</td>").join("")+"</tr>").join("");
   return"<div class='tab-pane' data-tab='overview'>"+top+toolbar+"<table class='ov-matrix'>"+head+"<tbody>"+body+"</tbody></table><div class='ov-source'>Δ — изменение к предыдущему сопоставимому периоду. «Нет данных» означает, что источник подключён, но значения нет; «не подключено» — интеграция ещё отсутствует. Расходы WB показаны только по заказам, связанным с финансовым отчётом; хранение и общие удержания без артикула не распределяются.</div></div>"
 }
 let mk=skuOverviewMarket,x=stats.get(mk),p=prev.get(mk),ct=skuMarketContent(mk,a),yv=mk==="YANDEX"?skuYandexVisibility(a,0):null,yp=mk==="YANDEX"?skuYandexVisibility(a,1):null,ds=periodDates(0);
 const card=(title,value,sub,cls)=>"<div class='pass'><div class='pass-title'>"+X(title)+"</div><div class='pass-value "+(value==="—"?"pass-empty":"")+"'>"+value+"</div><div class='pass-sub "+(cls||"neu")+"'>"+sub+"</div></div>";
 const group=(title,note,cards,cols)=>"<section class='ov-group'><div class='ov-group-head'><div class='ov-group-title'>"+X(title)+"</div><div class='ov-group-note'>"+X(note)+"</div></div><div class='ov-grid' style='grid-template-columns:repeat("+(cols||cards.length)+",minmax(0,1fr))'>"+cards.join("")+"</div></section>";
 const dPct=(c,pv)=>{let d=deltaPct(c,pv);return d==null?null:d};
 const signCls=(d,invert)=>d==null||Math.abs(d)<0.0001?"neu":((invert?-d:d)>0?"pos":"neg");
 // Sales for the selected period
 let dUnits=N(x.units)-N(p.units),dg=dPct(x.gmv,p.gmv),da=dPct(x.avg_price,p.avg_price);
 let sales=[
   card("Продано",x.units?I(x.units)+" шт":"—",(x.units||p.units)?(dUnits===0?"Без изменений":S(dUnits)+I(dUnits)+" шт"):"Нет базы сравнения",signCls(dUnits)),
   card("Оборот",x.gmv?R(x.gmv):"—",dg==null?"Нет базы сравнения":S(dg)+dg.toFixed(1)+"%",signCls(dg)),
   card("Средняя цена продажи",x.avg_price?R(x.avg_price):"—",da==null?"Нет базы сравнения":S(da)+da.toFixed(1)+"%","neu")
 ];
 let mst=skuMarketStock(a,mk),mavg=allMarketAvgDailySales14d(a),mdays=mst&&mavg>0?N(mst.total)/mavg:null;
 sales.push(card("Остаток",mst?I(mst.total)+" шт":"—",mst?(mst.cabinet?"склад "+X(mst.cabinet):""):"Нет данных","neu"));
 sales.push(card("Запас",mdays==null?"—":mdays.toFixed(1)+" дн.",mdays==null?(mst?"нет продаж 14д":"Нет данных"):mdays<7?"Критичный":mdays<14?"Низкий":"Норма",mdays==null?"neu":mdays<7?"neg":mdays<14?"warn":"pos"));
 // Price and economics as of today (independent of the period)
 let econ=[],oc=mk==="OZON"?ozonCurrentFor(a,x.cabinet):null,start=priceAtPeriodStart(key,mk);
 if(mk==="OZON"){
   let price=oc&&oc.price!=null?N(oc.price):(x.current_price!=null?N(x.current_price):null),pd=start&&price!=null?deltaPct(price,start.price):null;
   econ.push(card("Текущая цена",price!=null?R(price):"—",price==null?"Нет данных":(oc&&oc.price_date?"на "+dm(oc.price_date):"")+(pd==null?"":" · "+(Math.abs(pd)<0.05?"без изменений":S(pd)+pd.toFixed(1)+"%")+" к "+dm(start.date)),"neu"));
   let mcom=oc&&oc.month_commission_pct!=null?" · факт "+monthShort(oc.month)+" "+P(oc.month_commission_pct):"";
   econ.push(card("Комиссия Ozon",oc&&oc.commission_pct!=null?P(oc.commission_pct):"—",oc&&oc.commission_pct!=null?"тариф на "+dm(oc.commission_date)+mcom:"Нет данных","neu"));
   let ls=oc?oc.logistics_status:null,lsub=!oc||oc.logistics_per_unit==null?"Нет данных":ls==="avg7"||ls==="avg14"?"факт "+dm(oc.logistics_from)+"–"+dm(oc.logistics_to)+" · "+I(oc.logistics_units)+" шт":ls==="stale"?"устар. факт "+dm(oc.logistics_from)+"–"+dm(oc.logistics_to):ls==="month"?"факт "+monthShort(oc.month):ls==="estimate"?"оценка по категории":"";
   econ.push(card("Логистика / шт",oc&&oc.logistics_per_unit!=null?R(oc.logistics_per_unit):"—",X(lsub),ls==="stale"||ls==="estimate"?"warn":"neu"));
   let mr=oc&&oc.month_received_per_unit!=null?"факт "+monthShort(oc.month)+" "+R(oc.month_received_per_unit):"факт прошлого месяца: нет данных";
   econ.push(card("≈ К получению / шт",oc&&oc.received_per_unit!=null?R(oc.received_per_unit):"—","после прямых расходов МП · "+mr,"neu"));
 }else{
   let op=operationalEconomicsFor(key,mk)||{},price=op.current_price!=null?N(op.current_price):(x.current_price!=null?N(x.current_price):null),pd=start&&price!=null?deltaPct(price,start.price):null;
   econ.push(card("Текущая цена",price!=null?R(price):"—",price==null?"Нет данных":X(op.price_source||"последняя известная")+(pd==null?"":" · "+(Math.abs(pd)<0.05?"без изменений":S(pd)+pd.toFixed(1)+"%")+" к "+dm(start.date)),"neu"));
   econ.push(card("Комиссия",op.commission_pct!=null?P(op.commission_pct):"—",op.commission_pct!=null?X(op.commission_source||""):"Нет данных","neu"));
   econ.push(card("Логистика / шт",op.logistics_per_unit!=null?R(op.logistics_per_unit):"—",op.logistics_per_unit!=null?X(op.logistics_source||""):"Нет данных","neu"));
   econ.push(card("≈ К получению / шт",op.received_per_unit!=null?R(op.received_per_unit):"—","после прямых расходов МП","neu"));
 }
 // Promotion for the selected period
 let promo=[];
 if(mk==="OZON"){
   let ps=skuOzonPositionStats(a);
   let pdlt=ps&&ps.position!=null&&ps.previous!=null?ps.previous-ps.position:null;
   promo.push(card("Позиция в поиске",ps&&ps.position!=null?"№ "+I(ps.position):"—",ps&&ps.position!=null?"средняя за "+ps.days+" дн · "+(pdlt==null?"нет базы сравнения":(Math.abs(pdlt)<0.5?"без изменений":(pdlt>0?"↑ ":"↓ ")+I(Math.abs(pdlt))+" к прошлой неделе")):"Нет данных",signCls(pdlt)));
   promo.push(card("Видели в поиске → открыли",ps&&ps.search?I(ps.search)+" → "+I(ps.view):"—",ps&&ps.search?"конверсия в просмотр "+P(ps.conversion):"Нет данных","neu"));
 }else if(mk==="YANDEX"){
   promo.push(card("Видимость",yv!=null?Number(yv).toFixed(1)+"%":"—",yv==null?"Нет данных":(yp==null?"индекс видимости Яндекс":"Δ "+S(yv-yp)+(yv-yp).toFixed(1)+" п.п."),signCls(yv!=null&&yp!=null?yv-yp:null)));
 }
 let ad=mk==="YANDEX"?skuYandexAds(a):mk==="WB"?skuWBAds(a):skuMarketAds(a,"OZON",ds);
 if(ad&&mk!=="OZON"){ad={...ad,drr_ads:ad.drr,ctr:ad.shows?ad.clicks/ad.shows*100:null}}
 let drrAll=ad&&x.gmv?ad.spend/N(x.gmv)*100:null,adShare=ad&&x.units?Math.min(100,N(ad.orders)/N(x.units)*100):null;
 let adWin=ad&&mk==="YANDEX"&&ad.period_from?" · окно "+dm(ad.period_from)+"–"+dm(ad.period_to):"";
 promo.push(card("Реклама",ad?R(ad.spend):"—",ad?"ДРР общий "+Pd(drrAll)+" · рекламный "+Pd(ad.drr_ads)+(ad.ctr!=null?" · CTR "+P(ad.ctr):"")+adWin:(mk==="OZON"?"Нет данных по SKU":"Нет данных"),"neu"));
 promo.push(card("Рекламные заказы",ad?I(ad.orders):"—",ad?(adShare==null?"":P(adShare)+" от всех заказов SKU"):"Нет данных","neu"));
 // Marketplace card
 let cDate=skuContentDate(ct);
 let content=[card("Контент",ct?I(ct.content_score)+" / 100":"—",ct?((mk==="YANDEX"?"Content Rating Яндекс":mk==="WB"?"Content Score WB · наш расчёт":"Content Score Ozon")+(cDate?" · на "+dm(cDate):"")):"Нет данных","neu")];
 let html=group("Продажи · за выбранный период","Δ к предыдущему такому же периоду",sales,5)
   +group("Цена и экономика · на сегодня","Не зависит от периода · под каждой цифрой дата и источник",econ,4)
   +group("Продвижение · за выбранный период",mk==="OZON"?"Позиции и охват — Ozon Seller API, реклама — Ozon Performance":"",promo,promo.length)
   +group("Карточка на маркетплейсе","",content,3);
 return"<div class='tab-pane' data-tab='overview'>"+toolbar+html+(mk==="WB"?"<div class='ov-source'>Подтверждённые расходы: "+I(x.cost_units)+"/"+I(x.units)+" шт. Комиссия — фактические услуги WB и эквайринг в % от оборота заказов. «≈ К получению / шт» — оборот минус привязанные расходы МП, не сумма выплаты. Реклама не входит в «К получению».</div>":"")+"</div>"
}

let skuDynKey=null,skuDynMarket=null,skuDynMetric="PRICE";
function skuDynMarkets(key){
 let allowed=new Set(periodDates(0)),out=new Set();
 for(const x of (D.sku_daily||[])){
   let xkey=canonicalKey(x);
   if(xkey===key&&allowed.has(x.report_date)&&N(x.units)!==0)out.add(rowMarketplace(x))
 }
 let pri={OZON:1,YANDEX:2,WB:3};
 return [...out].sort((a,b)=>(pri[a]||99)-(pri[b]||99)||String(a).localeCompare(String(b),"ru"))
}
function skuDynRows(key,mk){
 let ds=periodDates(0),m=new Map(ds.map(d=>[d,{report_date:d,units:0,gmv:0,is_live:false}]));
 for(const x of (D.sku_daily||[])){
   let xkey=canonicalKey(x);
   if(xkey!==key||!m.has(x.report_date)||(mk!=="ALL"&&rowMarketplace(x)!==mk))continue;
   let a=m.get(x.report_date);a.units+=N(x.units);a.gmv+=N(x.gmv);a.is_live=a.is_live||!!x.is_live
 }
 return ds.map(d=>{let a=m.get(d);a.price=a.units?a.gmv/a.units:null;return a})
}
function skuDynPositionHistory(a){
 let art=String(a.article||"").toLowerCase(),sku=String(a.sku||""),arr=POSITION.filter(p=>((art&&String(p.offer_id||"").toLowerCase()===art)||(sku&&String(p.sku||"")===sku))&&N(p.position)>0);
 if(!arr.length)return[];
 let groups=new Map();for(const p of arr){let c=String(p.cabinet||"");if(!groups.has(c))groups.set(c,[]);groups.get(c).push(p)}
 let wanted=E("cabinet").value,chosen=(wanted!=="ALL"&&groups.has(wanted))?groups.get(wanted):[...groups.values()].sort((x,y)=>y.length-x.length)[0];
 let byDate=new Map();for(const p of chosen||[]){let d=String(p.snapshot_date||p.period_to||p.period_from||"").slice(0,10);if(d)byDate.set(d,N(p.position))}
 return [...byDate].map(([report_date,position])=>({report_date,position})).sort((x,y)=>x.report_date.localeCompare(y.report_date))
}
globalThis.setSkuDynMarket=function(mk){skuDynMarket=mk;detailTab="dynamics";if(selected)openSku(selected)}
globalThis.setSkuDynMetric=function(metric){skuDynMetric=metric;detailTab="dynamics";if(selected)openSku(selected)}
globalThis.showSkuDynPoint=function(i){
 let r=(globalThis._skuDynRows||[])[i];if(!r)return;
 let sec=(globalThis._skuDynSec||[])[i],metric=globalThis._skuDynMetric||"PRICE",secText=metric==="POSITION"?(sec==null?"—":"№ "+I(sec)):(sec==null?"—":R(sec));
 let box=E("skuDynPoint");if(!box)return;
 box.innerHTML="<b>"+X(r.report_date)+"</b> • "+I(r.units)+" шт • "+R(r.gmv)+" • "+(metric==="POSITION"?"позиция ":"ср. цена ")+secText
}
function buildSkuDynamics(key,a){
 let markets=skuDynMarkets(key),ctx=E("marketplace").value;
 if(!markets.length)markets=[rowMarketplace(a)||"OZON"];
 if(!skuDynMarket||(!markets.includes(skuDynMarket)&&skuDynMarket!=="ALL"))skuDynMarket=(ctx!=="ALL"&&markets.includes(ctx))?ctx:(markets.length>1?"ALL":markets[0]);
 if(skuDynMarket==="ALL"&&markets.length<2)skuDynMarket=markets[0];

 let posHist=skuDynMarket==="OZON"?skuDynPositionHistory(a):[],posAvailable=posHist.length>=2;
 if(skuDynMetric==="POSITION"&&!posAvailable)skuDynMetric="PRICE";
 if(skuDynMetric==="ADS")skuDynMetric="PRICE";

 let rows=skuDynRows(key,skuDynMarket),posMap=new Map(posHist.map(x=>[x.report_date,x.position]));
 let sec=rows.map(r=>skuDynMetric==="POSITION"?(posMap.has(r.report_date)?posMap.get(r.report_date):null):r.price);
 let W=620,H=235,pl=44,pr=72,pt=28,pb=34,umax=Math.max.apply(null,[1].concat(rows.map(r=>N(r.units))));
 let valid=sec.filter(v=>v!==null&&v!==undefined&&isFinite(Number(v))),smin=valid.length?Math.min.apply(null,valid):0,smax=valid.length?Math.max.apply(null,valid):1;
 if(smax===smin){let pad=Math.max(1,Math.abs(smax)*.03);smin=Math.max(0,smin-pad);smax+=pad}else{let pad=(smax-smin)*.12;smin=Math.max(0,smin-pad);smax+=pad}
 function xp(i){return rows.length===1?(pl+W-pr)/2:pl+i*(W-pl-pr)/Math.max(1,rows.length-1)}
 function yu(v){return H-pb-(N(v)/umax)*(H-pt-pb)}
 function ys(v){if(v==null)return null;return skuDynMetric==="POSITION"?pt+(N(v)-smin)/(smax-smin||1)*(H-pt-pb):H-pb-(N(v)-smin)/(smax-smin||1)*(H-pt-pb)}
 let z="",ticks=4;
 for(let t=0;t<=ticks;t++){let uv=umax*t/ticks,y=yu(uv),sv=skuDynMetric==="POSITION"?(smin+(smax-smin)*t/ticks):(smin+(smax-smin)*t/ticks);z+="<line x1='"+pl+"' y1='"+y+"' x2='"+(W-pr)+"' y2='"+y+"' stroke='#eef0f3'/><text x='"+(pl-7)+"' y='"+(y+3)+"' text-anchor='end' font-size='9' fill='#667085'>"+Math.round(uv)+"</text><text x='"+(W-pr+7)+"' y='"+(y+3)+"' text-anchor='start' font-size='9' fill='#667085'>"+(skuDynMetric==="POSITION"?"№"+Math.round(sv):Math.round(sv).toLocaleString("ru-RU"))+"</text>"}
 z+="<text x='5' y='14' class='axis-label'>ШТ.</text><text x='"+(W-4)+"' y='14' text-anchor='end' class='axis-label'>"+(skuDynMetric==="POSITION"?"ПОЗИЦИЯ":"ЦЕНА, ₽")+"</text>";
 let up=rows.map((r,i)=>xp(i)+","+yu(r.units));if(up.length>1)z+="<polyline fill='none' stroke='#6097e8' stroke-width='2.8' points='"+up.join(" ")+"'/>";
 let segments=[],seg=[];sec.forEach((v,i)=>{if(v==null){if(seg.length){segments.push(seg);seg=[]}}else seg.push(xp(i)+","+ys(v))});if(seg.length)segments.push(seg);
 for(const p of segments)if(p.length>1)z+="<polyline fill='none' stroke='#98a2b3' stroke-width='2.5' points='"+p.join(" ")+"'/>";
 rows.forEach(function(r,i){z+="<circle cx='"+xp(i)+"' cy='"+yu(r.units)+"' r='4' fill='#6097e8' class='trend-dot' data-sku-dyn-index='"+i+"'/>";if(sec[i]!=null)z+="<circle cx='"+xp(i)+"' cy='"+ys(sec[i])+"' r='3' fill='#fff' stroke='#98a2b3' stroke-width='2'/>";z+="<text x='"+xp(i)+"' y='"+(H-8)+"' text-anchor='middle' font-size='8' fill='#667085'>"+r.report_date.slice(5)+"</text>"});

 let totalUnits=rows.reduce((q,r)=>q+N(r.units),0),totalGmv=rows.reduce((q,r)=>q+N(r.gmv),0),avg=totalUnits?totalGmv/totalUnits:0;
 let marketButtons=(markets.length>1?["ALL"].concat(markets):markets).map(mk=>"<button type='button' data-dyn-market='"+mk+"' class='"+(skuDynMarket===mk?"active":"")+"'>"+X(mk==="ALL"?"Все":marketLabel(mk))+"</button>").join("");
 let metricButtons="<button type='button' data-dyn-metric='PRICE' class='"+(skuDynMetric==="PRICE"?"active":"")+"'>Цена</button>"+
   "<button type='button' data-dyn-metric='POSITION' class='"+(skuDynMetric==="POSITION"?"active":"")+"' "+(posAvailable?"":"disabled title='Истории позиции пока недостаточно'")+">Позиция</button>"+
   "<button type='button' disabled title='Источник рекламы ещё не подключён'>Реклама</button>";
 let desc=skuDynMarket==="ALL"?"Все маркетплейсы • цена взвешена по проданным штукам":marketLabel(skuDynMarket)+" • продажи и "+(skuDynMetric==="POSITION"?"поисковая позиция":"средняя цена");
 let rowsHtml=rows.map((r,i)=>"<tr><td>"+r.report_date+(r.is_live?" <span class='badge bg-live'>LIVE</span>":"")+"</td><td class='r'>"+I(r.units)+"</td><td class='r'>"+R(r.gmv)+"</td><td class='r'>"+(r.price==null?"—":R(r.price))+"</td>"+(skuDynMetric==="POSITION"?"<td class='r'>"+(sec[i]==null?"—":"№ "+I(sec[i]))+"</td>":"")+"</tr>").join("");
 globalThis._skuDynRows=rows;globalThis._skuDynSec=sec;globalThis._skuDynMetric=skuDynMetric;
 return "<div class='tab-pane' data-tab='dynamics'><div class='history' style='margin-top:12px;padding-top:0;border-top:0'>"+
   "<div class='section-title'>Продажи и динамика</div><div class='desc'>"+X(desc)+"</div>"+
   "<div class='dyn-toolbar'><div class='dyn-group'><span class='dyn-label'>Маркет</span><div class='seg'>"+marketButtons+"</div></div><div class='dyn-group'><span class='dyn-label'>Вторая метрика</span><div class='seg'>"+metricButtons+"</div></div></div>"+
   "<div class='dyn-summary'><div class='kpi-mini'><div class='mn'>Продано</div><div class='mv'>"+I(totalUnits)+" шт</div></div><div class='kpi-mini'><div class='mn'>GMV</div><div class='mv'>"+R(totalGmv)+"</div></div><div class='kpi-mini'><div class='mn'>Средняя цена</div><div class='mv'>"+R(avg)+"</div></div></div>"+
   "<svg viewBox='0 0 "+W+" "+H+"'>"+z+"</svg><div id='skuDynPoint' class='trend-point'><span class='neu'>Нажми на точку продаж — покажу значения за день.</span></div>"+
   "<div class='tw' style='max-height:220px'><table><thead><tr><th>Дата</th><th class='r'>Шт</th><th class='r'>GMV</th><th class='r'>Цена</th>"+(skuDynMetric==="POSITION"?"<th class='r'>Позиция</th>":"")+"</tr></thead><tbody>"+rowsHtml+"</tbody></table></div>"+
   (skuDynMetric==="POSITION"?"<div class='dyn-note'>Для позиции используется доступная история Ozon по выбранному SKU.</div>":"")+
   "</div></div>"
}
globalThis.openSku=function(key){
 if(skuOverviewKey!==key){skuOverviewKey=key;skuOverviewMarket=E("marketplace").value||"ALL"}
 if(skuDynKey!==key){skuDynKey=key;skuDynMetric="PRICE";skuDynMarket=E("marketplace").value||"ALL"}
 selected=key;collapseSkuSearch();
 document.querySelectorAll("tr.click").forEach(function(row){row.classList.toggle("active-row",row.dataset.key===key)});
 let a=aggregateSku(periodDates(0)).find(function(x){return x.key===key});if(!a)return;
 let allowed=new Set(periodDates(0)),cab=E("cabinet").value,hmap=new Map();
 for(const x of (D.sku_daily||[])){
   let xkey=canonicalKey(x);
   if(xkey!==key||!allowed.has(x.report_date)||(cab!=="ALL"&&x.cabinet!==cab)||(E("marketplace").value!=="ALL"&&rowMarketplace(x)!==E("marketplace").value))continue;
   let h=hmap.get(x.report_date)||{report_date:x.report_date,units:0,gmv:0,expected_received:0,cost_units:0,is_live:false};
   h.units+=N(x.units);h.gmv+=N(x.gmv);if(x.expected_received!==null&&x.expected_received!==undefined){h.expected_received+=N(x.expected_received);h.cost_units+=rowMarketplace(x)==="YANDEX"?N(x.cost_covered_units):N(x.units)}h.is_live=h.is_live||!!x.is_live;hmap.set(x.report_date,h)
 }
 let hist=[...hmap.values()].sort(function(x,y){return x.report_date.localeCompare(y.report_date)});
 hist.forEach(function(x){x.avg_order_price=x.units?x.gmv/x.units:0});
 function priceOf(x){return N(x.avg_order_price||(N(x.units)?N(x.gmv)/N(x.units):0))}
 let prices=hist.map(priceOf).filter(v=>v>0),W=620,H=220,pl=48,pr=66,pt=28,pb=34;
 let pmin=prices.length?Math.min.apply(null,prices):0,pmax=prices.length?Math.max.apply(null,prices):1;
 if(pmax===pmin){pmin=pmin*0.97;pmax=pmax*1.03||1}else{let pad=(pmax-pmin)*.12;pmin=Math.max(0,pmin-pad);pmax+=pad}
 let umax=Math.max.apply(null,[1].concat(hist.map(x=>N(x.units))));
 function xp(i){return hist.length===1?(pl+W-pr)/2:pl+i*(W-pl-pr)/(hist.length-1)}
 function yu(v){return H-pb-(N(v)/umax)*(H-pt-pb)}
 function yp(v){return H-pb-(N(v)-pmin)/(pmax-pmin||1)*(H-pt-pb)}
 let z="",ticks=4;
 for(let t=0;t<=ticks;t++){let uv=umax*t/ticks,pv=pmin+(pmax-pmin)*t/ticks,y=yu(uv);z+="<line x1='"+pl+"' y1='"+y+"' x2='"+(W-pr)+"' y2='"+y+"' stroke='#eef0f3'/><text x='"+(pl-7)+"' y='"+(y+3)+"' text-anchor='end' font-size='9' fill='#667085'>"+Math.round(uv)+"</text><text x='"+(W-pr+7)+"' y='"+(y+3)+"' text-anchor='start' font-size='9' fill='#667085'>"+Math.round(pv).toLocaleString("ru-RU")+"</text>"}
 z+="<text x='5' y='14' class='axis-label'>ШТ.</text><text x='"+(W-4)+"' y='14' text-anchor='end' class='axis-label'>ЦЕНА, ₽</text>";
 let pp=[],up=[];hist.forEach(function(row,i){pp.push(xp(i)+","+yp(priceOf(row)));up.push(xp(i)+","+yu(row.units))});
 if(pp.length>1)z+="<polyline fill='none' stroke='#98a2b3' stroke-width='2.5' points='"+pp.join(" ")+"'/><polyline fill='none' stroke='#6097e8' stroke-width='2.5' points='"+up.join(" ")+"'/>";
 hist.forEach(function(row,i){z+="<circle cx='"+xp(i)+"' cy='"+yp(priceOf(row))+"' r='3' fill='#fff' stroke='#98a2b3' stroke-width='2'/><text x='"+xp(i)+"' y='"+(H-8)+"' text-anchor='middle' font-size='8' fill='#667085'>"+row.report_date.slice(5)+"</text>"});

 let firstPrice=hist.length?priceOf(hist[0]):0,lastPrice=hist.length?priceOf(hist[hist.length-1]):0,pd=firstPrice?((lastPrice/firstPrice)-1)*100:null;
 let pm=prevMap(),p0=pm.get(key)||{},du=N(a.units)-N(p0.units),dg=N(a.gmv)-N(p0.gmv);
 let commPct=a.commission_pct==null?null:N(a.commission_pct),logPU=a.logistics_per_unit==null?null:N(a.logistics_per_unit),avgPrice=N(a.price),receivedPU=a.received_per_unit==null?null:N(a.received_per_unit);
 let econPrice=a.known_cost_units?a.known_cost_gmv/a.known_cost_units:avgPrice,commPU=a.known_cost_units?a.commission_amount/a.known_cost_units:0,directPU=commPU+N(logPU),directPct=econPrice?directPU/econPrice*100:null,marginPct=econPrice&&receivedPU!=null?receivedPU/econPrice*100:null;
 let currentPrice=a.current_price==null?null:N(a.current_price),currentVsAvg=(currentPrice&&avgPrice)?(currentPrice/avgPrice-1)*100:null;
 let cabSel=E("cabinet").value,dim=dimFor(cabSel==="ALL"?(a.cabinet||""):cabSel,a.sku),ozonUrl=productLinkFor("OZON",a),wbUrl=productLinkFor("WB",a),yaUrl=productLinkFor("YANDEX",a);
 let st=stockFor(a),stockQty=st?N(st.total_stock):null,fbo=st?N(st.fbo_stock):null,fbs=st?N(st.fbs_stock):null,avg14=allMarketAvgDailySales14d(a);
 let stockDays=(st&&avg14>0)?stockQty/avg14:null,stockStatus="Нет данных",stockClass="pass-empty";
 if(st){if(stockQty<=0){stockStatus="Критичный";stockClass="stock-critical"}else if(avg14<=0){stockStatus="Нет продаж 14д";stockClass="neu"}else if(stockDays<7){stockStatus="Критичный";stockClass="stock-critical"}else if(stockDays<14){stockStatus="Низкий";stockClass="stock-low"}else{stockStatus="Норма";stockClass="stock-ok"}}
 let pos=positionFor(a),posNow=pos&&N(pos.position)>0?N(pos.position):null,posPrev=pos&&N(pos.previous_position)>0?N(pos.previous_position):null,posImprove=(posNow!=null&&posPrev!=null)?posPrev-posNow:null;
 let posClass=posImprove==null?"neu":(posImprove>0?"pos":(posImprove<0?"neg":"neu"));
 let posDelta=posImprove==null?"":(" • <span class='"+posClass+"'>"+(posImprove>0?"↑ ":"↓ ")+Math.abs(posImprove).toFixed(0)+"</span>");
 let priceDelta=pd==null?"—":(S(pd)+pd.toFixed(1)+"%");
 let curDelta=currentVsAvg==null?"—":(S(currentVsAvg)+currentVsAvg.toFixed(1)+"% к средней");
 let ct=contentFor(a),contentScore=ct?N(ct.content_score):null;
 let contentClass=contentScore==null?"pass-empty":contentScore>=80?"stock-ok":contentScore>=60?"stock-low":"stock-critical";
 let contentIssues=ct&&Array.isArray(ct.issues)?ct.issues:[];
 let contentScope=ct&&E("cabinet").value==="ALL"&&ct.cabinet?(" • "+ct.cabinet):"";
 let contentParts=ct?("Фото "+I(ct.images_count)+" • Видео "+(ct.has_video||ct.has_video_cover?"есть":"нет")+" • Rich "+(ct.has_rich?"есть":"нет")+contentScope):"Источник ещё не загружен";
 let contentBreakdown=ct?("Фото "+I(ct.photo_score)+"/25 • Видео "+I(ct.video_score)+"/15 • Rich "+I(ct.rich_score)+"/15 • Описание "+I(ct.description_score)+"/15 • Характеристики "+I(ct.attributes_score)+"/20 • SEO "+I(ct.seo_score)+"/10"):"";

 let skuState=skuOverallStatus(key),skuStateDelta=skuState.delta==null?"":(" "+S(skuState.delta)+skuState.delta.toFixed(0)+"%");
 let body="<div class='sku-head'><div class='sku-photo'>Фото товара<br>подключим из Ozon</div><div><div class='sku-title'>"+X(a.article||a.sku)+(a.live?" <span class='badge bg-live'>LIVE</span>":"")+" <span class='sku-state "+skuState.cls+"'>"+X(skuState.label+skuStateDelta)+"</span></div><div class='sku-name'>"+X(a.product_name)+"</div><div class='sku-links'>";
 let urls={OZON:ozonUrl,WB:wbUrl,YANDEX:yaUrl};
 for(const mk of availableMarketplaces()){let u=urls[mk],lbl=marketLabel(mk);body+=u?"<a class='market-link on' href='"+X(u)+"' target='_blank' rel='noopener'>"+X(lbl)+" ↗</a>":"<span class='market-link off'>"+X(lbl)+"</span>"}
 body+="</div><div class='sku-meta'>Категория: "+X(a.category||"—")+" • Бренд: "+X(a.brand||"—")+"</div></div></div>";
 body+="<div class='detail-tabs'><button type='button' data-tab='overview'>Обзор</button><button type='button' data-tab='dynamics'>Динамика</button></div>";
 body+=buildSkuOverview(key,a);
body+=buildSkuDynamics(key,a);
 E("detail").innerHTML=body;setDetailTab(detailTab)
}

// Ad spend per canonical SKU for the selected period (Ozon daily SKU stats + pay-per-order periods inside the period, WB daily).
function adsByKeyForPeriod(){
 let ds=periodDates(0),first=ds[0]||"",last=ds.at(-1)||"";
 return perfCache("adsByKey:"+first+":"+last,ADS,()=>{
   let set=new Set(ds),out=new Map();
   let keyMap=perfCache("adsKeyMap",D,()=>{let m=new Map();for(const x of D.sku_daily||[]){let k=canonicalKey(x),mk=rowMarketplace(x),art=normArticle(x.article);if(art&&!m.has(mk+"|art|"+art))m.set(mk+"|art|"+art,k);let s=mk+"|"+String(x.cabinet||"")+"|"+String(x.sku||"");if(!m.has(s))m.set(s,k)}return m});
   for(const r of ADS){
     let mk=rowMarketplace(r);if(mk==="YANDEX")continue;
     let from=String(r.period_from||""),to=String(r.period_to||""),daily=from===to;
     if(daily?!set.has(to):!(from>=first&&to<=last))continue;
     let k=mk==="WB"?keyMap.get("WB|"+String(r.cabinet||"")+"|"+String(r.offer_id||"")):(keyMap.get(mk+"|art|"+normArticle(r.offer_id))||keyMap.get(mk+"|"+String(r.cabinet||"")+"|"+String(r.offer_id||"")));
     if(!k)continue;
     let z=out.get(k)||{spend:0,revenue:0,orders:0,shows:0,clicks:0};z.spend+=N(r.spend);z.revenue+=N(r.ad_revenue);z.orders+=N(r.ad_orders);z.shows+=N(r.shows);z.clicks+=N(r.clicks);out.set(k,z)
   }
   return out
 })
}
globalThis.getSkuAdsByKey=adsByKeyForPeriod;
// Tenant-level advertising for the period: Ozon campaign totals (all campaign types) + WB SKU rows.
function periodAdTotals(){
 let ds=periodDates(0),set=new Set(ds),spend=0,sources=new Set();
 for(const c of D.ozon_ads_campaigns||[]){if(set.has(String(c.date||"")))spend+=N(c.spend),sources.add("Ozon")}
 for(const r of ADS){if(rowMarketplace(r)==="WB"&&String(r.period_from||"")===String(r.period_to||"")&&set.has(String(r.period_to||"")))spend+=N(r.spend),sources.add("WB")}
 return{spend,sources:[...sources]}
}
globalThis.getPeriodAdTotals=periodAdTotals;
function dailySkuWorkspace(local={}){
 const f={
   cab:"ALL",
   marketplace:local.marketplace||"ALL",
   masterCategory:local.masterCategory||"ALL",
   category:"ALL",
   brand:local.brand||"ALL",
   q:""
 };
 const ds=periodDates(0),prev=prevPeriodDates();
 const currentSku=aggregateSku(ds,f),pm=new Map(aggregateSku(prev,f).map(a=>[a.key,a])),currentMap=new Map(currentSku.map(a=>[a.key,a]));
 const enrich=a=>{
   let p=pm.get(a.key)||{},previousGmv=N(p.gmv),previousUnits=N(p.units),lostGmv=Math.max(0,previousGmv-N(a.gmv)),growthGmv=Math.max(0,N(a.gmv)-previousGmv);
   let stock=stockFor(a),stockQty=stock?N(stock.total_stock):null,avg14=allMarketAvgDailySales14d(a),stockDays=stock&&avg14>0?stockQty/avg14:null;
   let ad=adsByKeyForPeriod().get(a.key)||null,adSpend=ad?ad.spend:null,drr=ad&&N(a.gmv)?ad.spend/N(a.gmv)*100:null,previousPrice=N(p.price)||null,pricePct=previousPrice&&N(a.price)?(N(a.price)/previousPrice-1)*100:null;
   return {...a,risk:riskFor(a,pm,f),stock,stockQty,stockDays,channels:channelShareText(a,f),previousGmv,previousUnits,lostGmv,growthGmv,problemImpact:Math.max(N(a.gmv),lostGmv),adSpend,drr,previousPrice,pricePct}
 };
 const skus=currentSku.map(enrich);
 const declineSkus=[...pm.values()].filter(p=>N(p.units)>=2).map(p=>{
   let base=currentMap.get(p.key)||{...p,gmv:0,units:0,orders:0,latest_gmv:0,latest_units:0},a=enrich(base);
   return {...a,previousGmv:N(p.gmv),previousUnits:N(p.units),lostGmv:Math.max(0,N(p.gmv)-N(base.gmv)),growthGmv:0,problemImpact:Math.max(N(base.gmv),Math.max(0,N(p.gmv)-N(base.gmv)))}
 }).filter(a=>a.lostGmv>0).sort((a,b)=>b.lostGmv-a.lostGmv);
 const growthSkus=skus.filter(a=>a.previousUnits>=2&&a.growthGmv>0).sort((a,b)=>b.growthGmv-a.growthGmv);
 const problemMap=new Map(skus.map(a=>[a.key,a]));for(const a of declineSkus)if(!problemMap.has(a.key))problemMap.set(a.key,a);
 const problemSkus=[...problemMap.values()].filter(a=>a.risk.level>0).sort((a,b)=>b.problemImpact-a.problemImpact||b.risk.level-a.risk.level||b.gmv-a.gmv);
 const orgFilter={cab:"ALL",marketplace:"ALL",masterCategory:"ALL",category:"ALL",brand:"ALL",q:""};
 const orgGmv=aggregateSku(ds,orgFilter).reduce((sum,a)=>sum+N(a.gmv),0);
 return{skus,declineSkus,growthSkus,problemSkus,orgGmv};
}
globalThis.getDailySkuWorkspace=dailySkuWorkspace;

function render(){if(!CONFIG?.onRender){kpis();tables()}else if(selected){openSku(selected)}trend();if(CONFIG?.onRender){
 let ds=periodDates(0),prev=prevPeriodDates(),pm=prevMap(),currentSku=aggregateSku(ds),currentMap=new Map(currentSku.map(a=>[a.key,a]));
 let enrichedCurrent=currentSku.map(a=>{
   let p=pm.get(a.key)||{},previousGmv=N(p.gmv),previousUnits=N(p.units),lostGmv=Math.max(0,previousGmv-N(a.gmv)),growthGmv=Math.max(0,N(a.gmv)-previousGmv);
   return {...a,risk:riskFor(a,pm),stock:stockFor(a),channels:channelShareText(a),previousGmv,previousUnits,lostGmv,growthGmv,problemImpact:Math.max(N(a.gmv),lostGmv)}
 });
 let declineSkus=[...pm.values()].filter(p=>N(p.units)>=2).map(p=>{
   let a=currentMap.get(p.key)||{...p,gmv:0,units:0,orders:0,latest_gmv:0,latest_units:0};
   let risk=riskFor(a,pm),lostGmv=Math.max(0,N(p.gmv)-N(a.gmv));
   return {...a,risk,stock:stockFor(a),channels:channelShareText(a),previousGmv:N(p.gmv),previousUnits:N(p.units),lostGmv,growthGmv:0,problemImpact:Math.max(N(a.gmv),lostGmv)}
 }).filter(a=>a.lostGmv>0).sort((a,b)=>b.lostGmv-a.lostGmv);
 let growthSkus=enrichedCurrent.filter(a=>a.previousUnits>=2&&a.growthGmv>0).sort((a,b)=>b.growthGmv-a.growthGmv);
 let problemMap=new Map(enrichedCurrent.map(a=>[a.key,a]));
 for(const a of declineSkus)if(!problemMap.has(a.key))problemMap.set(a.key,a);
 let problemSkus=[...problemMap.values()].filter(a=>a.risk.level>0).sort((a,b)=>b.problemImpact-a.problemImpact||b.risk.level-a.risk.level||b.gmv-a.gmv);
 CONFIG.onRender({payload:D,currentDates:ds,previousDates:prev,current:aggregateDaily(dailyFor(ds)),previous:aggregateDaily(dailyFor(prev)),skuRows:skuFor(ds),previousSkuRows:skuFor(prev),live:dailyFor(chartLiveDates()),skus:enrichedCurrent,declineSkus,growthSkus,problemSkus,filters:currentFilters(),marketTotals:availableMarketplaces().map(marketplace=>({marketplace,...aggregateDaily(dailyFor(ds,marketplace))}))})
}}function setup(){
 PERF={};rebuildDimMap();rebuildStockMap();rebuildLinkMap();rebuildPositionMap();rebuildContentMap();rebuildYandexAnalytics();E("q").value="";E("q").setAttribute("autocomplete","off");populateMarketplaceFilter();populateCabinetFilter();populateDimensionFilters();refreshQuickSkuList();E("skuQuickSearch").onkeydown=function(e){if(e.key==="Enter"){e.preventDefault();openQuickSku()}};
 E("cabinet").onchange=()=>{populateDimensionFilters();render()};
 E("marketplace").onchange=()=>{applyMarketplacePageTheme();populateCabinetFilter();populateDimensionFilters();refreshQuickSkuList();render()};
 E("masterCategory").onchange=()=>{populateDimensionFilters();render()};["category","brand","riskLimit","topLimit","moverLimit","allSkuLimit","trendMode"].forEach(id=>E(id).onchange=render);E("days").onchange=function(){refreshQuickSkuList();render()};
 E("q").oninput=render;
 E("status").textContent=" • заказы до "+(D.meta.raw_max_date||"—")+" • WB финансы до "+(D.meta.wb_finance_through||"—")+" • WB реклама до "+(D.meta.wb_ads_through||"—");applyMarketplacePageTheme();render()
}
function installInteractions(root){
 root.addEventListener("click",function(event){
   let target=event.target&&event.target.closest?event.target.closest("[data-trend-index],[data-sku-dyn-index],[data-key],[data-mode],[data-tab],[data-overview-market],[data-dyn-market],[data-dyn-metric],[data-action]"):null;
   if(!target||!root.contains(target))return;
   event.preventDefault();event.stopPropagation();
   if(target.dataset.trendIndex!=null)return globalThis.showTrendPoint(Number(target.dataset.trendIndex));
   if(target.dataset.skuDynIndex!=null)return globalThis.showSkuDynPoint(Number(target.dataset.skuDynIndex));
   if(target.dataset.key!=null)return globalThis.openSku(target.dataset.key);
   if(target.dataset.mode!=null)return globalThis.setMoverMode(target.dataset.mode,target);
   if(target.dataset.tab!=null)return globalThis.setDetailTab(target.dataset.tab);
   if(target.dataset.overviewMarket!=null)return globalThis.setSkuOverviewMarket(target.dataset.overviewMarket);
   if(target.dataset.dynMarket!=null)return globalThis.setSkuDynMarket(target.dataset.dynMarket);
   if(target.dataset.dynMetric!=null&&!target.disabled)return globalThis.setSkuDynMetric(target.dataset.dynMetric);
   if(target.dataset.action==="toggle-sku-search")return globalThis.toggleSkuSearch();
   if(target.dataset.action==="open-quick-sku")return globalThis.openQuickSku();
 },true)
}
export function expandDashboardTransport(payload){
 if(payload?._transport!=="columnar-v1")return payload;
 const expand=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=="_transport").map(([key,item])=>[
 key,item&&Array.isArray(item.columns)&&Array.isArray(item.rows)
 ? item.rows.map(row=>Array.isArray(row)?Object.fromEntries(item.columns.map((name,i)=>[name,row[i]])):Object.fromEntries(Object.entries(row).map(([i,v])=>[item.columns[Number(i)],v])))
 : key==="_ozon_enrichment"?expand(item):item
 ]));
 return expand(payload);
}

export async function startDashboard(config){
 validateConfig(config);CONFIG=config;document.title=config.display_name+" — Orders Control 2.3";
 const root=document.getElementById("app");root.innerHTML=dashboardLayout(config);installInteractions(root);
 try{const response=await (config.data_response||fetch(config.data_url,{cache:"no-cache",headers:config.data_headers||{}}));if(!response.ok)throw new Error("Snapshot HTTP "+response.status);let payload=expandDashboardTransport(await response.json());let merged=mergeOzonEconomics(payload,payload._ozon_enrichment||{});if(Array.isArray(payload.meta?.accounts)){config.accounts=[...payload.meta.accounts.map(a=>({...a,cabinet:a.cabinet||config.accounts.find(b=>b.account_id===a.account_id)?.cabinet||""})),...config.accounts.filter(a=>!payload.meta.accounts.some(b=>a.account_id===b.account_id||(a.marketplace===b.marketplace&&a.cabinet===b.cabinet)))]}D=normalizeDashboardPayload(merged,config);setup();E("load").classList.add("hide")}
 catch(e){E("load").classList.add("hide");E("err").classList.remove("hide");E("err").textContent="Ошибка загрузки: "+e.message;throw e}
}

function validateConfig(config){for(const key of ["tenant_id","display_name","data_url","accounts","sku_aliases","theme"])if(config[key]==null)throw new Error("Tenant config is missing "+key)}
function normalizeDashboardPayload(payload,config){
 const resolve=createCanonicalSkuResolver(config.sku_aliases||[]),accounts=config.accounts||[];
 const masterCategoryFallback=(row)=>{if(row.master_category)return row.master_category;let c=String(row.category||"").trim();if(config.tenant_id==="W"&&c==="Зеркала")return"Зеркала";if(config.tenant_id==="CPR"&&c==="Мебель для ванной")return"Мебель";return row.master_category};
 const normalize=(row)=>{let account=resolveRowAccount(row,accounts),marketplace=String(row.marketplace||row.source_marketplace||account.marketplace||"").toUpperCase(),cabinet=String(row.cabinet||account.cabinet||"");let external_sku=String(row.external_sku??row.article??row.sku??row.offer_id??""),account_id=row.account_id||account.account_id||cabinet;return{...row,master_category:masterCategoryFallback(row),marketplace,cabinet,account_id,external_sku,canonical_sku:resolveRowCanonicalSku(row,resolve,{marketplace,account_id,external_sku}),report_date:row.report_date?String(row.report_date).slice(0,10):row.report_date,is_live:isLiveValue(row)}};
 const out={...payload};for(const key of ["daily","sku_daily","lines","dimensions","stocks","content","positions","visibility","ads","product_links","refs","search_queries","marketplace_products"])out[key]=Array.isArray(payload[key])?payload[key].map(normalize):[];out.meta={...(payload.meta||{}),tenant_id:config.tenant_id};return out
}
function isLiveValue(row){return row?.is_live===true||String(row?.is_live).toLowerCase()==="true"}

export function resolveRowCanonicalSku(row,resolveCanonical,context){return row?.canonical_sku?String(row.canonical_sku):resolveCanonical(context)||String(context.external_sku??"")}
export function normalizeRows(rows,config,resolveCanonical,payload={}){const accounts=config.accounts||[];return rows.map(row=>{let marketplace=String(row.marketplace||row.source_marketplace||"").toUpperCase(),cabinet=String(row.cabinet||""),account=resolveRowAccount({...row,marketplace,cabinet},accounts);let external_sku=String(row.external_sku??row.article??row.sku??""),account_id=row.account_id||account.account_id||cabinet;return{...row,tenant_id:config.tenant_id,marketplace,cabinet,account_id,external_sku,canonical_sku:resolveRowCanonicalSku(row,resolveCanonical,{marketplace,account_id,external_sku}),report_date:String(row.report_date||"").slice(0,10),is_live:isLiveValue(row)}})}
export function normalizeCalendarRows(dailyRows,skuRows=[]){return(dailyRows.length?dailyRows:skuRows).map(row=>({report_date:String(row.report_date||"").slice(0,10),is_live:isLiveValue(row)}))}
export function buildPeriodSelection(rows,calendarRows,period){let calendar=calendarRows?.length?calendarRows:normalizeCalendarRows([],rows),live=new Set([...calendar,...rows].filter(isLiveValue).map(r=>r.report_date)),closed=[...new Set(calendar.map(r=>r.report_date))].filter(d=>!live.has(d)).sort(),current;if(period==="MONTH"){let last=closed.at(-1)||"";current=closed.filter(d=>d.startsWith(last.slice(0,7)))}else if(period==="ALL"||Number(period)>=999)current=closed;else current=closed.slice(-Number(period));let first=current.length?closed.indexOf(current[0]):closed.length,previous=(period==="ALL"||Number(period)>=999)?[]:closed.slice(Math.max(0,first-current.length),first),cs=new Set(current),ps=new Set(previous),currentRows=rows.filter(r=>cs.has(r.report_date)&&!live.has(r.report_date)),previousRows=rows.filter(r=>ps.has(r.report_date)&&!live.has(r.report_date)),liveRows=rows.filter(r=>live.has(r.report_date));return{currentDates:current,previousDates:previous,liveDates:[...live].sort(),currentRows,previousRows,liveRows,trendRows:[...currentRows,...liveRows]}}
function aggregateSkuForTests(currentRows,previousRows=[]){let map=new Map;for(const row of currentRows){let item=map.get(row.canonical_sku)||{canonical_sku:row.canonical_sku,product_name:row.product_name||"—",orders:0,units:0,gmv:0,stock:0,markets:new Set,previous:0};item.orders+=N(row.orders);item.units+=N(row.units);item.gmv+=N(row.gmv);item.stock=Math.max(item.stock,N(row.stock));item.markets.add(row.marketplace);map.set(row.canonical_sku,item)}for(const row of previousRows){let item=map.get(row.canonical_sku);if(item)item.previous+=N(row.gmv)}return[...map.values()].map(item=>({...item,markets:[...item.markets],delta:item.previous?(item.gmv/item.previous-1)*100:null})).sort((a,b)=>b.gmv-a.gmv)}
export { aggregateSkuForTests as aggregateSku };
export function calculateKpis(rows,closedDayCount){let gmv=rows.reduce((s,r)=>s+N(r.gmv),0),units=rows.reduce((s,r)=>s+N(r.units),0),orders=rows.reduce((s,r)=>s+N(r.orders),0);return{gmv,units,orders,averagePrice:units?gmv/units:0,gmvPerDay:closedDayCount?gmv/closedDayCount:0}}
export function buildTrendSeries(rows){let map=new Map;for(const row of rows){let p=map.get(row.report_date)||{report_date:row.report_date,gmv:0,units:0,orders:0,is_live:false};p.gmv+=N(row.gmv);p.units+=N(row.units);p.orders+=N(row.orders);p.is_live||=isLiveValue(row);map.set(row.report_date,p)}return[...map.values()].sort((a,b)=>a.report_date.localeCompare(b.report_date))}
export function calculateTrendPeriodTotals(currentRows,previousRows=[],closedDayCount=0){
 const sum=rows=>rows.reduce((a,row)=>{a.gmv+=N(row.gmv);a.units+=N(row.units);a.orders=a.orders===null||row.orders===null?null:a.orders+N(row.orders);return a},{gmv:0,units:0,orders:0});
 const group=rows=>{let out={};for(const row of rows){let mk=String(row.marketplace||row.market||row.source_marketplace||"ALL").toUpperCase(),a=out[mk]||(out[mk]={gmv:0,units:0,orders:0});a.gmv+=N(row.gmv);a.units+=N(row.units);a.orders=a.orders===null||row.orders===null?null:a.orders+N(row.orders)}return out};
 return{closedDayCount,total:{current:sum(currentRows),previous:sum(previousRows)},markets:{current:group(currentRows),previous:group(previousRows)}}
}
export function calculateTrendDayComparison(day,periodTotal,closedDayCount,isLive=false){
 let count=Math.max(0,N(closedDayCount)),average={gmv:count?N(periodTotal.gmv)/count:0,units:count?N(periodTotal.units)/count:0,orders:periodTotal.orders===null?null:count?N(periodTotal.orders)/count:0};
 let deltas={};for(const key of ["gmv","units","orders"])deltas[key]=isLive?null:dp(day[key],average[key]);return{average,deltas,isLive:!!isLive}
}

// Show every unclosed day without treating it as a closed financial report.
export function selectUnclosedChartDates(all,live,closed,period){
 const values=all.filter(d=>live.has(d)).sort();
 if(/^\d{4}-\d{2}$/.test(period))return values.filter(d=>d.startsWith(period));
 if(period==="MONTH")return values.filter(d=>d.startsWith((all.at(-1)||"").slice(0,7)));
 const first=closed[0];return first?values.filter(d=>d>=first):values;
}

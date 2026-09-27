import { createCanonicalSkuResolver } from "./canonical-sku.js";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[ch]));
const n = (value) => Number(value || 0);
const pct = (value) => Number.isFinite(Number(value)) ? `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)}%` : "—";
const cls = (value) => n(value) > 0 ? "pos" : n(value) < 0 ? "neg" : "neu";
const sum = (rows, key) => rows.reduce((total, row) => total + n(row[key]), 0);
const isLive = (row) => row?.is_live === true || String(row?.is_live).toLowerCase() === "true";

export async function startDashboard(config) {
  validateConfig(config);
  document.documentElement.style.setProperty("--accent", config.theme.accent);
  document.title = `${config.display_name} — Orders Control DEV 2.2`;
  const root = document.querySelector("#app");
  root.innerHTML = layout(config);
  const $ = (id) => document.getElementById(id);
  try {
    const response = await fetch(config.data_url, { cache: "no-store", headers: config.data_headers || {} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const resolveCanonical = createCanonicalSkuResolver(config.sku_aliases);
    const rows = normalizeRows(payload.sku_daily || [], config, resolveCanonical, payload);
    const calendarRows = normalizeCalendarRows(payload.daily || [], rows);
    const state = { payload, rows, calendarRows, config, selected: null, metric: "gmv" };
    setupFilters(state, $); bind(state, $); render(state, $); $("load").classList.add("hide");
  } catch (error) {
    $("load").classList.add("hide"); $("err").classList.remove("hide");
    $("err").textContent = `Ошибка загрузки DEV snapshot: ${error.message}`;
  }
}

function validateConfig(config) {
  for (const key of ["tenant_id", "display_name", "data_url", "accounts", "sku_aliases", "theme"]) if (config[key] == null) throw new Error(`Tenant config is missing ${key}`);
}

function layout(config) {
  const nav = ["orange", "w", "cpr"].map((tenant) => `<a class="${tenant === config.slug ? "current" : ""}" href="../${tenant}/">${tenant.toUpperCase()}</a>`).join("");
  return `<div id="load" class="load">Загружаю ${esc(config.display_name)} DEV…</div><div class="shell">
    <div class="header"><div><div class="brandline"><span class="brandmark"></span><h1>${esc(config.display_name)} — Orders Control 2.2</h1></div><div class="sub">Единый Dashboard Core • tenant ${esc(config.tenant_id)} • isolated DEV</div><div class="devnav">${nav}</div></div><span class="badge demo">DEV 2.2</span></div>
    <div id="err" class="err hide"></div>
    <div class="toolbar"><div><label>Кабинет</label><select id="cabinet"></select></div><div><label>Период</label><select id="days"><option value="7">7 дней</option><option value="14">14 дней</option><option value="30" selected>30 дней</option><option value="MONTH">Текущий месяц</option><option value="ALL">Весь период</option></select></div><div><label>Маркетплейс</label><select id="marketplace"></select></div><div><label>Категория</label><select id="category"></select></div><div><label>Бренд</label><select id="brand"></select></div><div><label>Поиск canonical SKU / название</label><input id="query" autocomplete="off" placeholder="SKU или название"></div></div>
    <div id="kpis" class="grid5"></div>
    <div class="card pad market-accent trend-card"><div class="section-head"><div><div class="ttl">Динамика заказов</div><div class="desc">Закрытые дни выбранного периода и оперативная LIVE-точка.</div></div><div class="mode"><button data-metric="gmv" class="active">Оборот</button><button data-metric="units">Штуки</button></div></div><svg id="trend" class="trend" viewBox="0 0 760 240" preserveAspectRatio="none"></svg><div id="trendPoint" class="trend-point hide"></div></div>
    <div class="workbench"><div class="work-left">
      <div class="card pad market-accent"><div class="section-head"><div><div class="ttl">Проблемные SKU</div><div class="desc">Сигналы по обороту и остатку.</div></div></div><div class="tw"><table><thead><tr><th>Canonical SKU</th><th class="r">Оборот</th><th class="r">Δ</th><th class="r">Остаток</th><th>Сигнал</th></tr></thead><tbody id="risks"></tbody></table></div></div>
      <div class="card pad market-accent"><div class="section-head"><div><div class="ttl">TOP по обороту</div><div class="desc">SKU выбранного периода.</div></div></div><div class="tw"><table><thead><tr><th>Canonical SKU</th><th>Название</th><th class="r">Шт.</th><th class="r">Оборот</th></tr></thead><tbody id="top"></tbody></table></div></div>
      <div class="card pad market-accent"><div class="section-head"><div><div class="ttl">Все SKU</div><div class="desc">Одна строка на canonical SKU.</div></div></div><div class="tw"><table><thead><tr><th>Canonical SKU</th><th>Маркетплейсы</th><th class="r">Заказы</th><th class="r">Шт.</th><th class="r">Оборот</th></tr></thead><tbody id="all"></tbody></table></div></div>
    </div><div class="work-right"><div id="detail" class="card pad"><div class="empty">Выберите SKU слева.</div></div></div></div>
    <div class="footer">${esc(config.footer_note)} • Core ${esc(config.core_version)} • PROD endpoints не используются.</div>
  </div>`;
}

function payloadIndex(records = []) {
  const exact = new Map(), fallback = new Map();
  for (const row of records) {
    const identifiers = [...new Set([row.external_sku, row.article, row.article_key, row.offer_id, row.sku].filter((value) => value != null && String(value) !== "").map(String))];
    for (const sku of identifiers) {
      exact.set(`${String(row.marketplace ?? row.source_marketplace ?? "").toUpperCase()}|${row.cabinet ?? ""}|${sku}`, row);
      fallback.set(sku, row);
    }
  }
  return { exact, fallback };
}
function payloadLookup(index, row, externalSku) { return index.exact.get(`${String(row.marketplace || "OZON").toUpperCase()}|${row.cabinet ?? ""}|${externalSku}`) || index.fallback.get(externalSku) || {}; }

export function normalizeRows(rows, config, resolveCanonical, payload = {}) {
  const accountByCabinet = new Map(config.accounts.map((a) => [`${a.marketplace}|${a.cabinet}`, a.account_id]));
  const dimensions = payloadIndex(payload.dimensions), stocks = payloadIndex(payload.stocks);
  return rows.map((row) => {
    const marketplace = String(row.marketplace || "OZON").toUpperCase(), cabinet = String(row.cabinet || "");
    const external_sku = String(row.external_sku ?? row.article ?? row.sku ?? "");
    const account_id = row.account_id || accountByCabinet.get(`${marketplace}|${cabinet}`) || cabinet;
    const dimension = payloadLookup(dimensions, row, external_sku), stock = payloadLookup(stocks, row, external_sku);
    return { ...row, tenant_id: config.tenant_id, marketplace, cabinet, account_id, external_sku,
      canonical_sku: resolveCanonical({ marketplace, account_id, external_sku }), report_date: String(row.report_date).slice(0, 10), is_live: isLive(row),
      category: row.category || dimension.category || dimension.master_category || "Без категории", brand: row.brand || dimension.brand || "Без бренда", stock: row.stock ?? stock.total_stock ?? 0 };
  }).filter((row) => row.report_date && row.external_sku);
}

export function normalizeCalendarRows(dailyRows, skuRows = []) {
  const source = dailyRows.length ? dailyRows : skuRows;
  return source.map((row) => ({ report_date: String(row.report_date).slice(0, 10), is_live: isLive(row) })).filter((row) => row.report_date);
}

function setupFilters(state, $) {
  const options = (values, all) => `<option value="ALL">${all}</option>` + [...new Set(values)].sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  $("cabinet").innerHTML = options(state.rows.map((r) => r.cabinet), "Все кабинеты"); $("marketplace").innerHTML = options(state.rows.map((r) => r.marketplace), "Все маркетплейсы");
  $("category").innerHTML = options(state.rows.map((r) => r.category), "Все категории"); $("brand").innerHTML = options(state.rows.map((r) => r.brand), "Все бренды");
}

function bind(state, $) {
  for (const id of ["cabinet", "days", "marketplace", "category", "brand"]) $(id).addEventListener("change", () => render(state, $));
  $("query").addEventListener("input", () => render(state, $));
  document.querySelectorAll("[data-metric]").forEach((button) => button.addEventListener("click", () => { state.metric = button.dataset.metric; document.querySelectorAll("[data-metric]").forEach((b) => b.classList.toggle("active", b === button)); render(state, $); }));
  document.addEventListener("click", (event) => { const sku = event.target.closest("[data-sku]")?.dataset.sku; if (sku) { state.selected = sku; const view = getView(state, $); renderDetail(state, $, aggregateSku(view.currentRows, view.previousRows)); } });
}

export function buildPeriodSelection(rows, calendarRows, period) {
  const calendar = calendarRows?.length ? calendarRows : normalizeCalendarRows([], rows);
  const liveDates = new Set([...calendar, ...rows].filter(isLive).map((row) => row.report_date));
  const closedDates = [...new Set(calendar.map((row) => row.report_date))].filter((date) => !liveDates.has(date)).sort();
  let currentDates;
  if (period === "MONTH") { const lastClosed = closedDates.at(-1) || ""; currentDates = closedDates.filter((date) => date.slice(0, 7) === lastClosed.slice(0, 7)); }
  else if (period === "ALL") currentDates = closedDates;
  else currentDates = closedDates.slice(-Math.max(0, n(period)));
  const firstIndex = currentDates.length ? closedDates.indexOf(currentDates[0]) : closedDates.length;
  const previousDates = period === "ALL" ? [] : closedDates.slice(Math.max(0, firstIndex - currentDates.length), firstIndex);
  const currentSet = new Set(currentDates), previousSet = new Set(previousDates);
  const currentRows = rows.filter((row) => currentSet.has(row.report_date) && !liveDates.has(row.report_date));
  const previousRows = rows.filter((row) => previousSet.has(row.report_date) && !liveDates.has(row.report_date));
  const liveRows = rows.filter((row) => liveDates.has(row.report_date));
  return { closedDates, currentDates, previousDates, liveDates: [...liveDates].sort(), currentRows, previousRows, liveRows, trendRows: [...currentRows, ...liveRows] };
}

function applyDimensionFilters(rows, $) {
  const q = $("query").value.trim().toLowerCase();
  return rows.filter((row) => ($("cabinet").value === "ALL" || row.cabinet === $("cabinet").value) && ($("marketplace").value === "ALL" || row.marketplace === $("marketplace").value)
    && ($("category").value === "ALL" || row.category === $("category").value) && ($("brand").value === "ALL" || row.brand === $("brand").value)
    && (!q || `${row.canonical_sku} ${row.product_name || ""}`.toLowerCase().includes(q)));
}
function getView(state, $) {
  const selection = buildPeriodSelection(state.rows, state.calendarRows, $("days").value);
  const currentRows = applyDimensionFilters(selection.currentRows, $), previousRows = applyDimensionFilters(selection.previousRows, $), liveRows = applyDimensionFilters(selection.liveRows, $);
  return { ...selection, currentRows, previousRows, liveRows, trendRows: [...currentRows, ...liveRows] };
}

export function aggregateSku(currentRows, previousRows = []) {
  const map = new Map();
  for (const row of currentRows) {
    const item = map.get(row.canonical_sku) || { canonical_sku: row.canonical_sku, product_name: row.product_name || "—", orders: 0, units: 0, gmv: 0, stock: 0, markets: new Set(), previous: 0 };
    item.orders += n(row.orders); item.units += n(row.units); item.gmv += n(row.gmv); item.stock = Math.max(item.stock, n(row.stock)); item.markets.add(row.marketplace); map.set(row.canonical_sku, item);
  }
  for (const row of previousRows) { const item = map.get(row.canonical_sku); if (item) item.previous += n(row.gmv); }
  return [...map.values()].map((item) => ({ ...item, markets: [...item.markets], delta: item.previous ? (item.gmv / item.previous - 1) * 100 : null })).sort((a,b) => b.gmv-a.gmv);
}

export function calculateKpis(rows, closedDayCount) {
  const gmv = sum(rows, "gmv"), units = sum(rows, "units"), orders = sum(rows, "orders");
  return { gmv, units, orders, averagePrice: units ? gmv / units : 0, gmvPerDay: closedDayCount ? gmv / closedDayCount : 0 };
}

function render(state, $) {
  const view = getView(state, $), sku = aggregateSku(view.currentRows, view.previousRows), total = calculateKpis(view.currentRows, view.currentDates.length);
  $("kpis").innerHTML = [["GMV заказов", `${money.format(total.gmv)} ₽`], ["Заказано, шт", `${integer.format(total.units)} шт.`], ["Заказов", integer.format(total.orders)], ["Средняя цена", `${money.format(total.averagePrice)} ₽`], ["GMV / день", `${money.format(total.gmvPerDay)} ₽`]]
    .map(([label,value]) => `<div class="card pad"><div class="kl">${label}</div><div class="kv">${value}</div></div>`).join("");
  $("top").innerHTML = sku.filter((x) => x.units >= 2).slice(0,10).map((x)=>`<tr><td class="sku" data-sku="${esc(x.canonical_sku)}">${esc(x.canonical_sku)}</td><td>${esc(x.product_name)}</td><td class="r">${integer.format(x.units)}</td><td class="r"><b>${money.format(x.gmv)} ₽</b></td></tr>`).join("") || emptyRow(4);
  const risks = sku.filter((x)=>x.delta < -10 || x.stock < 8).sort((a,b)=>(a.delta??0)-(b.delta??0)).slice(0,12);
  $("risks").innerHTML = risks.map((x)=>{const bad=x.stock<5||x.delta<-25; return `<tr><td class="sku" data-sku="${esc(x.canonical_sku)}">${esc(x.canonical_sku)}</td><td class="r">${money.format(x.gmv)} ₽</td><td class="r ${cls(x.delta)}">${pct(x.delta)}</td><td class="r">${integer.format(x.stock)}</td><td><span class="signal ${bad?"bad":"warn"}">${x.stock<8?"низкий остаток":"снижение"}</span></td></tr>`}).join("") || emptyRow(5,"Сигналов нет");
  $("all").innerHTML = sku.map((x)=>`<tr><td class="sku" data-sku="${esc(x.canonical_sku)}">${esc(x.canonical_sku)}</td><td>${x.markets.join(" · ")}</td><td class="r">${integer.format(x.orders)}</td><td class="r">${integer.format(x.units)}</td><td class="r">${money.format(x.gmv)} ₽</td></tr>`).join("") || emptyRow(5);
  renderTrend(view.trendRows, state.metric, $("trend"), $("trendPoint")); renderDetail(state, $, sku);
}

export function buildTrendSeries(rows) {
  const map = new Map();
  for (const row of rows) { const point = map.get(row.report_date) || { report_date: row.report_date, gmv: 0, units: 0, orders: 0, is_live: false }; point.gmv += n(row.gmv); point.units += n(row.units); point.orders += n(row.orders); point.is_live ||= isLive(row); map.set(row.report_date, point); }
  return [...map.values()].sort((a,b) => a.report_date.localeCompare(b.report_date));
}

function renderTrend(rows, metric, svg, detail) {
  const points = buildTrendSeries(rows); if (!points.length) { svg.innerHTML = ""; detail.classList.add("hide"); return; }
  const max = Math.max(...points.map((point) => point[metric]), 1), w=760, h=240, p=28;
  const coords = points.map((point,i) => ({ ...point, x:p+i*(w-p*2)/Math.max(points.length-1,1), y:h-p-point[metric]/max*(h-p*2) }));
  const path=coords.map((point,i)=>`${i?"L":"M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "), area=`${path} L${coords.at(-1).x},${h-p} L${coords[0].x},${h-p} Z`;
  svg.innerHTML=`<line class="axis" x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}"/><path class="area" d="${area}"/><path class="line" d="${path}"/>${coords.map((point,i)=>`<circle class="point ${point.is_live?"live":""}" data-date="${point.report_date}" cx="${point.x}" cy="${point.y}" r="${point.is_live?5:3}"><title>${point.report_date}: ${metric==="gmv"?money.format(point[metric])+" ₽":integer.format(point[metric])+" шт."}${point.is_live?" · LIVE":""}</title></circle>${point.is_live?`<text class="live-label" x="${point.x-7}" y="${Math.max(point.y-10,12)}">LIVE</text>`:""}${(i===0||i===coords.length-1)?`<text class="axis-label" x="${point.x}" y="${h-8}" text-anchor="${i?"end":"start"}">${point.report_date.slice(5)}</text>`:""}`).join("")}`;
  svg.querySelectorAll("[data-date]").forEach((node) => node.addEventListener("click", () => { const point = points.find((item) => item.report_date === node.dataset.date); detail.classList.remove("hide"); detail.innerHTML = `<b>${point.is_live?"LIVE · ":""}${esc(point.report_date)}</b><span>GMV: ${money.format(point.gmv)} ₽</span><span>Штуки: ${integer.format(point.units)}</span><span>Заказы: ${integer.format(point.orders)}</span>${point.is_live?"<em>Δ не рассчитывается: день ещё не закрыт.</em>":""}`; }));
}

function renderDetail(state, $, sku) {
  if (!state.selected && sku[0]) state.selected=sku[0].canonical_sku; const x=sku.find((row)=>row.canonical_sku===state.selected);
  if(!x){$("detail").innerHTML='<div class="empty">Выберите SKU слева.</div>';return;}
  const unique=[...new Set(state.rows.filter((r)=>r.canonical_sku===x.canonical_sku).map((r)=>r.external_sku))];
  $("detail").innerHTML=`<div class="ttl">${esc(x.canonical_sku)}</div><div class="desc">${esc(x.product_name)}</div><div class="detail-grid"><div class="detail-box"><span class="kl">Оборот</span><b>${money.format(x.gmv)} ₽</b></div><div class="detail-box"><span class="kl">Динамика</span><b class="${cls(x.delta)}">${pct(x.delta)}</b></div><div class="detail-box"><span class="kl">Продано</span><b>${integer.format(x.units)} шт.</b></div><div class="detail-box"><span class="kl">Остаток</span><b>${integer.format(x.stock)} шт.</b></div></div><div class="desc" style="margin-top:14px"><b>Маркетплейсы:</b> ${x.markets.join(" · ")}<br><b>External SKU:</b> ${unique.map(esc).join(" · ")}</div>`;
}
function emptyRow(columns, text="Нет данных для выбранных фильтров") { return `<tr><td colspan="${columns}" class="empty">${text}</td></tr>`; }

import { MONTHLY_API_URL, MONTHS, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, TENANTS } from "./config.js";
import { decimalMoney, escapeHtml, money, monthLabel, numberOrNull, percent, sumExpenseRows, units, viewModel } from "./core.js";

const state = { payload: null, model: null, session: null };
const query = new URLSearchParams(location.search);
const localDemo = ["localhost", "127.0.0.1"].includes(location.hostname) && query.get("demo") === "1";
let supabase = null;
if (!localDemo) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}

const $ = selector => document.querySelector(selector);
const tenantSelect = $("#tenantSelect");
const monthSelect = $("#monthSelect");
const dashboard = $("#dashboard");
const authPanel = $("#authPanel");

function currentTenant() { return TENANTS[tenantSelect.value] ? tenantSelect.value : "W"; }
function currentMonth() { return MONTHS.includes(monthSelect.value) ? monthSelect.value : MONTHS[0]; }

function populateControls() {
  tenantSelect.innerHTML = Object.entries(TENANTS).map(([id, cfg]) => `<option value="${id}">${escapeHtml(cfg.label)}</option>`).join("");
  monthSelect.innerHTML = MONTHS.map(month => `<option value="${month}">${escapeHtml(monthLabel(month))}</option>`).join("");
  tenantSelect.value = TENANTS[query.get("tenant")?.toUpperCase()] ? query.get("tenant").toUpperCase() : "W";
  monthSelect.value = MONTHS.includes(query.get("month")) ? query.get("month") : MONTHS[0];
}

function setUrl() {
  const next = new URL(location.href);
  next.searchParams.set("tenant", currentTenant());
  next.searchParams.set("month", currentMonth());
  if (localDemo) next.searchParams.set("demo", "1");
  history.replaceState(null, "", next);
}

function showAuth() {
  authPanel.hidden = false; dashboard.hidden = true; $("#userBox").hidden = true;
}

function showDashboard() {
  authPanel.hidden = true; dashboard.hidden = false;
  $("#userBox").hidden = localDemo;
  $("#userEmail").textContent = state.session?.user?.email || "";
}

async function fetchMonthly() {
  if (localDemo) {
    const { fixtureFor } = await import("./tests/fixtures.js");
    return fixtureFor(currentTenant(), currentMonth());
  }
  if (!state.session?.access_token) throw new Error("AUTH_REQUIRED");
  const url = new URL(MONTHLY_API_URL);
  url.searchParams.set("tenant", currentTenant());
  url.searchParams.set("month", currentMonth());
  url.searchParams.set("marketplace", "OZON");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${state.session.access_token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body.error || `HTTP_${response.status}`;
    if (response.status === 401) throw new Error("AUTH_REQUIRED");
    if (response.status === 403) throw new Error("TENANT_ACCESS_DENIED");
    throw new Error(code);
  }
  return body;
}

function renderBanner(model) {
  const m = model.metadata;
  const banner = $("#stateBanner");
  if (model.isClosed) {
    banner.className = "state-banner closed";
    banner.textContent = `Закрытый месяц · immutable snapshot revision ${m.base_close_revision}. Marketplace-экономика защищена от последующих изменений.`;
  } else if (model.financeWaiting) {
    banner.className = "state-banner live";
    banner.textContent = "LIVE месяц подготовлен, но Finance за выбранный период ещё не поступил. Значения не заменяются ложными нулями.";
  } else {
    banner.className = "state-banner live";
    banner.textContent = "LIVE месяц · данные обновляются из текущего prepared shadow по мере поступления Finance.";
  }
}

function renderStatus(model) {
  const m = model.metadata;
  $("#sourceLayer").textContent = m.source_layer || "—";
  $("#closeStatus").textContent = m.marketplace_close_status || "—";
  $("#readiness").textContent = m.overall_readiness || "—";
  $("#financeStatus").textContent = m.finance_data_status || "—";
  $("#refreshedAt").textContent = m.refreshed_at ? new Date(m.refreshed_at).toLocaleString("ru-RU") : "—";
  $("#revisionBadge").textContent = `REV ${m.base_close_revision ?? 0}`;
}

function renderKpis(model) {
  const f = model.financial;
  const u = model.units;
  const cards = [
    ["Net sales", money(f.net_sales), `Продажи ${money(f.sales)} · возвраты ${money(f.returns)}`],
    ["Расходы МП", money(f.marketplace_expenses), percent(f.marketplace_expenses, f.sales) + " от продаж"],
    ["Результат МП", money(f.result_without_compensation), "без компенсаций"],
    ["COGS", money(f.cogs), model.metadata.cost_status || "—"],
    ["После COGS", money(f.result_after_cogs), "результат после себестоимости"],
    ["Fin. units", units(u.financial_net_units), `продажи ${units(u.financial_sale_units)} · возвраты ${units(u.financial_return_units)}`],
  ];
  $("#kpiGrid").innerHTML = cards.map(([label, value, meta]) => `<article class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-meta">${escapeHtml(meta)}</div></article>`).join("");
}

function renderFunnel(model) {
  const f = model.financial;
  const rows = [
    ["Продажи", f.sales, null, ""],
    ["Возвраты", f.returns, f.sales, ""],
    ["Net sales", f.net_sales, f.sales, ""],
    ["Расходы маркетплейса", f.marketplace_expenses, f.sales, ""],
    ["Результат без компенсаций", f.result_without_compensation, f.sales, "result"],
    ["Компенсации", f.compensation, f.sales, ""],
    ["Результат с компенсациями", f.result_with_compensation, f.sales, ""],
    ["Себестоимость", f.cogs == null ? null : -Math.abs(f.cogs), f.sales, ""],
    ["Результат после COGS", f.result_after_cogs, f.sales, "result"],
    ["Финальный бизнес-результат", f.final_business_result, f.sales, "result"],
  ];
  $("#funnel").innerHTML = rows.map(([name, value, base, cls]) => `<div class="funnel-row ${cls}"><span class="name">${escapeHtml(name)}</span><span class="ratio">${escapeHtml(base == null ? "" : percent(value, base))}</span><span class="amount">${escapeHtml(money(value))}</span></div>`).join("");
}

function groupTotal(group) {
  if (!group) return null;
  const values = ["commission", "logistics", "storage", "promotion", "other"].map(key => numberOrNull(group[key]));
  return values.every(value => value == null) ? null : values.reduce((sum, value) => sum + Math.abs(value || 0), 0);
}

function renderExpenses(model) {
  const total = sumExpenseRows(model.expenseRows);
  const max = Math.max(1, ...model.expenseRows.map(row => Math.abs(row.value || 0)));
  $("#expenseTotal").textContent = total || model.expenseRows.some(row => row.value != null) ? money(-total) : "—";
  $("#expenseBars").innerHTML = model.expenseRows.map(row => `<div class="expense-line"><span class="expense-name">${escapeHtml(row.label)}</span><span class="expense-track"><span class="expense-fill" style="width:${row.value == null ? 0 : Math.max(2, Math.abs(row.value) / max * 100)}%"></span></span><span class="expense-value">${escapeHtml(money(row.value))}</span></div>`).join("");
  $("#directTotal").textContent = money(groupTotal(state.payload.expense_structure?.direct));
  $("#sharedTotal").textContent = money(groupTotal(state.payload.expense_structure?.allocated_shared));
}

function renderSku(model) {
  const needle = $("#skuSearch").value.trim().toLowerCase();
  const rows = model.skuRows.filter(row => !needle || [row.canonical_sku, row.article, row.product_name].some(value => String(value || "").toLowerCase().includes(needle)));
  $("#skuBody").innerHTML = rows.map(row => {
    const resultClass = numberOrNull(row.result_after_cogs) >= 0 ? "positive" : "negative";
    return `<tr><td><div class="sku-id">${escapeHtml(row.article || row.canonical_sku)}</div><div class="sku-name">${escapeHtml(row.product_name || row.canonical_sku)}</div></td><td>${escapeHtml(money(row.net_sales))}</td><td>${escapeHtml(units(row.financial_net_units))}</td><td>${escapeHtml(money(row.commission))}</td><td>${escapeHtml(money(row.logistics))}</td><td>${escapeHtml(money(row.promotion))}</td><td>${escapeHtml(money(row.other))}</td><td>${escapeHtml(money(row.result_without_compensation))}</td><td>${escapeHtml(money(row.cogs))}</td><td class="${resultClass}">${escapeHtml(decimalMoney(row.result_after_cogs))}</td></tr>`;
  }).join("");
  $("#skuEmpty").hidden = rows.length > 0;
  $("#skuEmpty").textContent = model.financeWaiting ? "SKU появятся после первой Finance-загрузки." : needle ? "По запросу ничего не найдено." : "В выбранном периоде нет SKU-строк.";
}

function render(payload) {
  state.payload = payload; state.model = viewModel(payload);
  document.documentElement.style.setProperty("--accent", TENANTS[currentTenant()].accent);
  renderBanner(state.model); renderStatus(state.model); renderKpis(state.model); renderFunnel(state.model); renderExpenses(state.model); renderSku(state.model);
  $("#contractVersion").textContent = payload.contract_version;
}

function renderError(error) {
  const banner = $("#stateBanner"); banner.className = "state-banner error";
  banner.textContent = error.message === "TENANT_ACCESS_DENIED" ? "Нет доступа к выбранному кабинету. Проверьте tenant membership." : `Monthly v2 недоступен: ${error.message}`;
}

async function load() {
  showDashboard(); dashboard.classList.add("loading"); setUrl();
  try { render(await fetchMonthly()); } catch (error) {
    if (error.message === "AUTH_REQUIRED" && !localDemo) { state.session = null; showAuth(); return; }
    renderError(error);
  } finally { dashboard.classList.remove("loading"); }
}

async function initAuth() {
  if (localDemo) { showDashboard(); await load(); return; }
  const { data: { session } } = await supabase.auth.getSession(); state.session = session;
  if (session) await load(); else showAuth();
  supabase.auth.onAuthStateChange((_event, nextSession) => { state.session = nextSession; if (nextSession) load(); else showAuth(); });
}

populateControls();
tenantSelect.addEventListener("change", load); monthSelect.addEventListener("change", load);
$("#refreshButton").addEventListener("click", load);
$("#skuSearch").addEventListener("input", () => state.model && renderSku(state.model));
$("#signOutButton").addEventListener("click", () => supabase.auth.signOut());
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault(); $("#authError").textContent = "";
  const { error } = await supabase.auth.signInWithPassword({ email: $("#emailInput").value.trim(), password: $("#passwordInput").value });
  if (error) $("#authError").textContent = "Не удалось войти. Проверьте email, пароль и доступ.";
});

initAuth().catch(renderError);

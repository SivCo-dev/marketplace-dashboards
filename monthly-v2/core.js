export const numberOrNull = value => value == null || value === "" ? null : Number(value);

export function money(value) {
  const n = numberOrNull(value);
  return n == null || !Number.isFinite(n)
    ? "—"
    : `${n.toLocaleString("ru-RU", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} ₽`;
}

export function decimalMoney(value) {
  const n = numberOrNull(value);
  return n == null || !Number.isFinite(n)
    ? "—"
    : `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

export function units(value) {
  const n = numberOrNull(value);
  return n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("ru-RU");
}

export function percent(value, base) {
  const n = numberOrNull(value);
  const d = numberOrNull(base);
  return n == null || !d ? "—" : `${(Math.abs(n) / Math.abs(d) * 100).toFixed(1)}%`;
}

export function monthLabel(value) {
  const [year, month] = String(value).split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function validatePayload(payload) {
  if (!payload || payload.contract_version !== "monthly-api-v2.0") {
    throw new Error("Неподдерживаемая версия Monthly API");
  }
  for (const key of ["metadata", "financial_economics", "units", "expense_structure", "sku_rows"]) {
    if (!(key in payload)) throw new Error(`Monthly API: отсутствует ${key}`);
  }
  if (!Array.isArray(payload.sku_rows)) throw new Error("Monthly API: sku_rows должен быть массивом");
  return payload;
}

export function viewModel(payload) {
  const p = validatePayload(payload);
  const m = p.metadata;
  const f = p.financial_economics;
  const expense = p.expense_structure?.total || {};
  const expenseRows = [
    ["Комиссия", expense.commission],
    ["Логистика", expense.logistics],
    ["Хранение", expense.storage],
    ["Продвижение", expense.promotion],
    ["Прочее", expense.other],
  ].map(([label, value]) => ({ label, value: numberOrNull(value) }));

  return {
    metadata: m,
    financial: f,
    units: p.units,
    expenseRows,
    skuRows: p.sku_rows,
    warnings: p.warnings || [],
    isClosed: m.marketplace_close_status === "CLOSED",
    isLive: m.marketplace_close_status === "LIVE",
    financeWaiting: m.finance_data_status === "WAITING_FOR_FINANCE",
  };
}

export function sumExpenseRows(rows) {
  return rows.reduce((sum, row) => sum + Math.abs(numberOrNull(row.value) || 0), 0);
}

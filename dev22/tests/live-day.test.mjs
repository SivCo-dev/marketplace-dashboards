import test from "node:test";
import assert from "node:assert/strict";
import { aggregateSku, buildPeriodSelection, buildTrendSeries, calculateKpis, calculateTrendDayComparison, calculateTrendPeriodTotals } from "../core/dashboard-core.js";

function date(offset) {
  const value = new Date("2026-08-15T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

const closed = Array.from({ length: 75 }, (_, index) => ({
  report_date: date(index), canonical_sku: index % 2 ? "A" : "B", external_sku: index % 2 ? "A" : "B",
  marketplace: "OZON", product_name: "Closed", orders: 1, units: 2, gmv: 100, stock: 20, is_live: false
}));
const live = { report_date: date(75), canonical_sku: "LIVE-ONLY", external_sku: "LIVE-ONLY", marketplace: "OZON", product_name: "Live", orders: 999, units: 999, gmv: 999999, stock: 0, is_live: true };
const rows = [...closed, live];
const calendar = rows.map(({ report_date, is_live }) => ({ report_date, is_live }));

test("LIVE is excluded from current and previous calculation samples but remains in trend", () => {
  const view = buildPeriodSelection(rows, calendar, "7");
  assert.equal(view.currentDates.length, 7);
  assert.equal(view.previousDates.length, 7);
  assert.ok(view.currentRows.every((row) => !row.is_live));
  assert.ok(view.previousRows.every((row) => !row.is_live));
  assert.deepEqual(view.liveDates, [live.report_date]);
  assert.ok(view.trendRows.some((row) => row.is_live));
});

test("7, 14 and 30 periods contain only the requested number of closed days", () => {
  for (const period of ["7", "14", "30"]) {
    const view = buildPeriodSelection(rows, calendar, period);
    assert.equal(view.currentDates.length, Number(period));
    assert.equal(view.previousDates.length, Number(period));
    assert.ok(!view.currentDates.includes(live.report_date));
  }
});

test("current month ends on the last closed day and comparison has equal closed-day count", () => {
  const view = buildPeriodSelection(rows, calendar, "MONTH");
  const lastClosed = closed.at(-1).report_date;
  assert.ok(view.currentDates.every((value) => value.startsWith(lastClosed.slice(0, 7))));
  assert.equal(view.currentDates.at(-1), lastClosed);
  assert.equal(view.previousDates.length, view.currentDates.length);
  assert.ok(!view.currentDates.includes(live.report_date));
});

test("LIVE does not change KPI including GMV per closed day", () => {
  const view = buildPeriodSelection(rows, calendar, "7");
  const actual = calculateKpis(view.currentRows, view.currentDates.length);
  assert.deepEqual(actual, { gmv: 700, units: 14, orders: 7, averagePrice: 50, gmvPerDay: 100 });
  assert.notEqual(actual.gmv, calculateKpis([...view.currentRows, live], view.currentDates.length).gmv);
});

test("LIVE-only SKU cannot enter TOP, movers, risks or all-SKU aggregate", () => {
  const view = buildPeriodSelection(rows, calendar, "7");
  const sku = aggregateSku(view.currentRows, view.previousRows);
  assert.deepEqual(sku.map((item) => item.canonical_sku).sort(), ["A", "B"]);
  assert.ok(!sku.some((item) => item.canonical_sku === "LIVE-ONLY"));
});

test("LIVE remains an explicit graph point with GMV, units and orders", () => {
  const view = buildPeriodSelection(rows, calendar, "7");
  const point = buildTrendSeries(view.trendRows).find((item) => item.is_live);
  assert.deepEqual(point, { report_date: live.report_date, gmv: 999999, units: 999, orders: 999, is_live: true });
});

test("trend period totals and marketplace totals use closed days only", () => {
  const sample = [
    { report_date: "2026-09-01", marketplace: "OZON", gmv: 100, units: 2, orders: 1, is_live: false },
    { report_date: "2026-09-01", marketplace: "WB", gmv: 50, units: 1, orders: 1, is_live: false },
    { report_date: "2026-09-02", marketplace: "OZON", gmv: 300, units: 6, orders: 3, is_live: false },
    { report_date: "2026-09-03", marketplace: "OZON", gmv: 9999, units: 99, orders: 99, is_live: true }
  ];
  const view = buildPeriodSelection(sample, normalizeCalendar(sample), "2");
  const totals = calculateTrendPeriodTotals(view.currentRows, [], view.currentDates.length);
  assert.equal(totals.closedDayCount, 2);
  assert.deepEqual(totals.total.current, { gmv: 450, units: 9, orders: 5 });
  assert.deepEqual(totals.markets.current.OZON, { gmv: 400, units: 8, orders: 4 });
  assert.deepEqual(totals.markets.current.WB, { gmv: 50, units: 1, orders: 1 });
});

test("closed point compares with selected-period daily average while LIVE has no deltas", () => {
  const closedDay = { gmv: 300, units: 6, orders: 3 };
  const periodTotal = { gmv: 400, units: 8, orders: 4 };
  const closedComparison = calculateTrendDayComparison(closedDay, periodTotal, 2, false);
  assert.deepEqual(closedComparison.average, { gmv: 200, units: 4, orders: 2 });
  assert.deepEqual(closedComparison.deltas, { gmv: 50, units: 50, orders: 50 });
  const liveComparison = calculateTrendDayComparison({ gmv: 999, units: 9, orders: 9 }, periodTotal, 2, true);
  assert.deepEqual(liveComparison.deltas, { gmv: null, units: null, orders: null });
});

function normalizeCalendar(items) {
  return items.map(({ report_date, is_live }) => ({ report_date, is_live }));
}

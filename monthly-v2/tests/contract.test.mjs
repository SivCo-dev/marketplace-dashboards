import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { money, viewModel } from "../core.js";
import { fixtureFor } from "./fixtures.js";

const wSep = viewModel(fixtureFor("W", "2026-09"));
const cprSep = viewModel(fixtureFor("CPR", "2026-09"));
const wOct = viewModel(fixtureFor("W", "2026-10"));

assert.equal(wSep.metadata.source_layer, "CLOSED_IMMUTABLE");
assert.equal(wSep.financial.net_sales, 6387302);
assert.equal(wSep.financial.result_without_compensation, 2034525.91);
assert.equal(wSep.financial.cogs, 1958207);
assert.equal(wSep.financial.result_after_cogs, 76318.91);
assert.equal(money(wSep.financial.result_without_compensation), "2 034 525,91 ₽");

assert.equal(cprSep.metadata.source_layer, "CLOSED_IMMUTABLE");
assert.equal(cprSep.financial.net_sales, 7159659);
assert.equal(cprSep.financial.result_without_compensation, 2536482.50);
assert.equal(cprSep.financial.cogs, 1169100);
assert.equal(cprSep.financial.result_after_cogs, 1367382.50);
assert.equal(money(cprSep.financial.result_without_compensation), "2 536 482,50 ₽");

assert.equal(wOct.metadata.marketplace_close_status, "LIVE");
assert.equal(wOct.metadata.source_layer, "SHADOW_CURRENT");
assert.equal(wOct.metadata.data_available, true);
assert.equal(wOct.metadata.finance_data_status, "WAITING_FOR_FINANCE");
assert.equal(wOct.financial.net_sales, null);
assert.ok(wOct.warnings.includes("FINANCE_NOT_ARRIVED"));

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
assert.match(source, /monthly-data-v2|MONTHLY_API_URL/);
assert.doesNotMatch(source, /monthly-data-v1|get_monthly_[a-z]+_v1|sku_monthly_/i);
assert.doesNotMatch(source, /service[_-]?role/i);

console.log("Monthly Dashboard v2 contract tests: PASS");

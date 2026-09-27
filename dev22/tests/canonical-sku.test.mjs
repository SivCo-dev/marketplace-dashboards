import test from "node:test";
import assert from "node:assert/strict";
import { createCanonicalSkuResolver } from "../core/canonical-sku.js";
import { aggregateSku, normalizeRows } from "../core/dashboard-core.js";

test("external_sku is the default canonical_sku without normalization", () => {
  const resolve = createCanonicalSkuResolver([]);
  assert.equal(resolve({ marketplace: "OZON", account_id: "a", external_sku: " Ab-01_x " }), " Ab-01_x ");
});

test("an explicit account alias overrides the default", () => {
  const resolve = createCanonicalSkuResolver([
    { marketplace: "OZON", account_id: "ozon_orange", external_sku: "TU", canonical_sku: "TUW" }
  ]);
  assert.equal(resolve({ marketplace: "OZON", account_id: "ozon_orange", external_sku: "TU" }), "TUW");
  assert.equal(resolve({ marketplace: "OZON", account_id: "other", external_sku: "TU" }), "TU");
});

test("wildcard aliases are explicit and supported", () => {
  const resolve = createCanonicalSkuResolver([
    { marketplace: "*", account_id: "*", external_sku: "xxx_TUW", canonical_sku: "TUW" }
  ]);
  assert.equal(resolve({ marketplace: "WB", account_id: "wb_orange", external_sku: "xxx_TUW" }), "TUW");
});

test("duplicate aliases fail fast", () => {
  assert.throws(() => createCanonicalSkuResolver([
    { marketplace: "OZON", account_id: "a", external_sku: "X", canonical_sku: "A" },
    { marketplace: "ozon", account_id: "a", external_sku: "X", canonical_sku: "B" }
  ]), /Duplicate SKU alias/);
});

test("SKU alias matching does not fold case or normalize signs", () => {
  const resolve = createCanonicalSkuResolver([
    { marketplace: "OZON", account_id: "a", external_sku: "Ab-01_x", canonical_sku: "CANONICAL" }
  ]);
  assert.equal(resolve({ marketplace: "OZON", account_id: "a", external_sku: "Ab-01_x" }), "CANONICAL");
  assert.equal(resolve({ marketplace: "OZON", account_id: "a", external_sku: "ab-01_x" }), "ab-01_x");
  assert.equal(resolve({ marketplace: "OZON", account_id: "a", external_sku: "Ab01x" }), "Ab01x");
});

test("normalized frontend rows always contain external_sku and canonical_sku", () => {
  const config = {
    tenant_id: "ORANGE",
    accounts: [{ marketplace: "OZON", cabinet: "IPT", account_id: "ozon_orange_ipt" }]
  };
  const resolve = createCanonicalSkuResolver([
    { marketplace: "OZON", account_id: "ozon_orange_ipt", external_sku: "TU", canonical_sku: "TUW" }
  ]);
  const [aliased, untouched] = normalizeRows([
    { marketplace: "OZON", cabinet: "IPT", external_sku: "TU", report_date: "2026-09-26" },
    { marketplace: "OZON", cabinet: "IPT", external_sku: "Ab-01_x", report_date: "2026-09-26" }
  ], config, resolve);
  assert.deepEqual(
    { external_sku: aliased.external_sku, canonical_sku: aliased.canonical_sku },
    { external_sku: "TU", canonical_sku: "TUW" }
  );
  assert.deepEqual(
    { external_sku: untouched.external_sku, canonical_sku: untouched.canonical_sku },
    { external_sku: "Ab-01_x", canonical_sku: "Ab-01_x" }
  );
});

test("snapshot canonical_sku has priority over tenant alias and external_sku", () => {
  const config = {
    tenant_id: "ORANGE",
    accounts: [{ marketplace: "OZON", cabinet: "IPT", account_id: "ozon_orange_ipt" }]
  };
  const resolve = createCanonicalSkuResolver([
    { marketplace: "OZON", account_id: "ozon_orange_ipt", external_sku: "SOURCE-1", canonical_sku: "ALIAS-CANONICAL" }
  ]);
  const [row] = normalizeRows([
    { marketplace: "OZON", cabinet: "IPT", sku: "SOURCE-ID", external_sku: "SOURCE-1", canonical_sku: "SNAPSHOT-CANONICAL", report_date: "2026-09-26" }
  ], config, resolve);
  assert.equal(row.canonical_sku, "SNAPSHOT-CANONICAL");
  assert.equal(row.external_sku, "SOURCE-1");
  assert.equal(row.sku, "SOURCE-ID");
});

test("snapshot canonical_sku merges marketplace rows while source SKU stays intact", () => {
  const config = {
    tenant_id: "ORANGE",
    accounts: [
      { marketplace: "OZON", cabinet: "OZ", account_id: "oz" },
      { marketplace: "WB", cabinet: "WB", account_id: "wb" },
      { marketplace: "YANDEX", cabinet: "YA", account_id: "ya" }
    ]
  };
  const rows = normalizeRows([
    { marketplace: "OZON", cabinet: "OZ", sku: "10001", external_sku: "OZ-SOURCE", canonical_sku: "MASTER-01", units: 1, gmv: 100, report_date: "2026-09-25" },
    { marketplace: "WB", cabinet: "WB", sku: "20002", external_sku: "WB-SOURCE", canonical_sku: "MASTER-01", units: 2, gmv: 200, report_date: "2026-09-25" },
    { marketplace: "YANDEX", cabinet: "YA", sku: "30003", external_sku: "YA-SOURCE", canonical_sku: "MASTER-01", units: 3, gmv: 300, report_date: "2026-09-25" }
  ], config, createCanonicalSkuResolver([]));
  const grouped = aggregateSku(rows);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].canonical_sku, "MASTER-01");
  assert.equal(grouped[0].units, 6);
  assert.deepEqual(new Set(rows.map((row) => row.sku)), new Set(["10001", "20002", "30003"]));
  assert.deepEqual(new Set(rows.map((row) => row.external_sku)), new Set(["OZ-SOURCE", "WB-SOURCE", "YA-SOURCE"]));
});

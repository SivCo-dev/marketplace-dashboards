import test from "node:test";
import assert from "node:assert/strict";
import { createCanonicalSkuResolver } from "../core/canonical-sku.js";
import { normalizeRows } from "../core/dashboard-core.js";

test("external_sku is the default canonical_sku without normalization", () => {
  const resolve = createCanonicalSkuResolver([]);
  assert.equal(resolve({ marketplace: "OZON", account_id: "a", external_sku: " Ab-01_x " }), "Ab-01_x");
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
    { marketplace: "ozon", account_id: "a", external_sku: "x", canonical_sku: "B" }
  ]), /Duplicate SKU alias/);
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

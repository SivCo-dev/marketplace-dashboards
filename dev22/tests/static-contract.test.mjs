import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("all tenant entrypoints use the same Dashboard Core", async () => {
  for (const tenant of ["orange", "w", "cpr"]) {
    const html = await readFile(join(root, tenant, "index.html"), "utf8");
    assert.match(html, /core\/dashboard-core\.js/);
    assert.match(html, new RegExp(`config/${tenant}\\.js`));
    assert.match(html, /<main id="app"><\/main>/);
    assert.doesNotMatch(html, /<style|<table|class="toolbar"|function\s*\(/i);
    assert.ok(html.length < 700, `${tenant} entrypoint must stay thin`);
  }
});

test("tenant configs contain data only, not UI or business logic", async () => {
  for (const tenant of ["orange", "w", "cpr"]) {
    const config = await readFile(join(root, "config", `${tenant}.js`), "utf8");
    assert.doesNotMatch(config, /<(?:div|table|section)|innerHTML|document\.|function\s*\(|=>/i);
    assert.match(config, /accounts:/);
    assert.match(config, /sku_aliases:/);
    assert.match(config, /accent: "#f47b20"/);
  }
});

test("there is exactly one shared stylesheet and one UI implementation", async () => {
  const cssFiles = (await readdir(join(root, "core"))).filter((file) => file.endsWith(".css"));
  assert.deepEqual(cssFiles, ["dashboard.css"]);
  const core = await readFile(join(root, "core", "dashboard-core.js"), "utf8");
  for (const label of ["Динамика заказов", "Проблемные SKU", "TOP по обороту", "Все SKU"]) {
    assert.match(core, new RegExp(label));
  }
  assert.doesNotMatch(core, /Что изменилось|Ожидаемо получено/);
  for (const label of ["GMV заказов", "Заказано, шт", "Заказов", "Средняя цена", "GMV / день"]) assert.match(core, new RegExp(label));
});

test("runtime files contain no production n8n URL", async () => {
  for (const folder of ["core", "config", "orange", "w", "cpr", "data"]) {
    for (const file of await readdir(join(root, folder))) {
      const text = await readFile(join(root, folder, file), "utf8");
      assert.doesNotMatch(text, /mazagnom\.app\.n8n\.cloud|\/webhook\//);
    }
  }
});

test("fixtures identify their tenant", async () => {
  for (const tenant of ["orange", "w", "cpr"]) {
    const payload = JSON.parse(await readFile(join(root, "data", `${tenant}.json`), "utf8"));
    assert.equal(payload.meta.tenant_id, tenant.toUpperCase());
    assert.ok(payload.sku_daily.length > 0);
  }
});

test("fixtures are test data only and never a runtime source", async () => {
  for (const tenant of ["orange", "w", "cpr"]) {
    const config = await readFile(join(root, "config", `${tenant}.js`), "utf8");
    assert.doesNotMatch(config, /data\/(orange|w|cpr)\.json/);
    assert.match(config, /dashboard-data-dev22/);
  }
});

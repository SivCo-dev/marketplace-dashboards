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
  for (const label of ["Динамика заказов", "Проблемные SKU", "TOP по обороту", "Рост / падение SKU", "Все SKU"]) {
    assert.match(core, new RegExp(label));
  }
  assert.doesNotMatch(core, /Что изменилось|Ожидаемо получено/);
  for (const label of ["GMV заказов", "Заказано, шт", "Заказов", "Средняя цена", "GMV / день"]) assert.match(core, new RegExp(label));
});

test("order dynamics keeps the Orange PROD blue while LIVE stays orange", async () => {
  const core = await readFile(join(root, "core", "dashboard-core.js"), "utf8");
  const css = await readFile(join(root, "core", "dashboard.css"), "utf8");
  assert.match(css, /--a:#2563eb/);
  assert.doesNotMatch(core, /setProperty\(["']--a["']/);
  assert.match(core, /live\?"#f47b20":"var\(--a\)"/);
});

test("desktop filters stay in one row and period analytics render beside the chart", async () => {
  const core = await readFile(join(root, "core", "dashboard-core.js"), "utf8");
  const css = await readFile(join(root, "core", "dashboard.css"), "utf8");
  assert.match(core, /class="trend-layout"><div class="trend-chart-column"><svg id="trend"><\/svg>/);
  assert.match(core, /id="trendPeriodNote"/);
  assert.match(core, /id="trendDayDetail"/);
  assert.match(core, /id="trendSummary"/);
  assert.match(css, /\.toolbar\{display:grid;grid-template-columns:[^}]*minmax\(190px,1\.3fr\)/);
  assert.match(css, /\.trend-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 390px/);
  assert.match(css, /\.trend-value-line\{display:flex/);
  assert.match(css, /\.trend-day-total \.trend-value-line\{display:block/);
  assert.match(css, /\.trend-day-total \.trend-delta\{display:block/);
  assert.match(core, /Итог за ["+]\+?closedRows\.length\+?["]? закрытых дней/);
  assert.doesNotMatch(core, /LIVE показан отдельно/);
});

test("shared Core keeps the full Orange 2.0 parity surface", async () => {
  const core = await readFile(join(root, "core", "dashboard-core.js"), "utf8");
  for (const label of [
    "Кабинет", "Маркетплейс", "Мастер-категория", "Категория", "Бренд", "Поиск SKU / название",
    "Δ цены", "Δ оборота", "Остаток", "Контент", "Сигнал", "Доля маркетов",
    "Быстрый поиск SKU", "Обзор", "Динамика", "Текущая цена", "Остаток",
    "Позиция / видимость", "Реклама", "Комиссия", "Логистика"
  ]) assert.match(core, new RegExp(label, "i"), `missing Orange parity element: ${label}`);

  for (const contract of [
    /data-trend-index/, /data-sku-dyn-index/, /data-key/, /data-mode/, /data-tab/,
    /data-overview-market/, /data-dyn-market/, /data-dyn-metric/, /installInteractions/
  ]) assert.match(core, contract);
  assert.doesNotMatch(core, /function\s+summary\s*\(|\bsummary\(\)/);
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

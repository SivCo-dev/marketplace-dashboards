// Golden-master harness for Daily: runs a given dashboard-core.js source on a frozen snapshot
// inside a same-origin iframe and computes canonical hashes of all computed results.
(() => {
const BASE = location.origin + '/marketplace-dashboards/';
const H = window.__H = window.__H || {};
H.canon = v => Array.isArray(v) ? '[' + v.map(H.canon).join(',') + ']'
  : (v instanceof Set) ? H.canon([...v])
  : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + H.canon(v[k])).join(',') + '}'
  : (typeof v === 'number' && !Number.isFinite(v)) ? JSON.stringify(String(v)) : JSON.stringify(v === undefined ? null : v);
H.sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
H.snap = H.snap || {};
// Freeze one snapshot per tenant: exact bytes + sha256 + server revision (ETag).
H.freeze = async tenant => {
  const u = 'https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev23?tenant=' + tenant + '&format=columnar';
  const r = await fetch(u, { cache: 'no-store' }); const text = await r.text();
  const reg = await (await fetch('https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/dashboard-data-dev23?view=registry', { cache: 'no-store' })).text();
  H.snap[tenant] = { text, reg, etag: r.headers.get('etag'), sha: await H.sha(text), bytes: text.length };
  return { tenant, etag: H.snap[tenant].etag, sha: H.snap[tenant].sha.slice(0, 16), bytes: text.length };
};
H.src = H.src || {};
H.loadSrc = async (name, url) => { H.src[name] = await (await fetch(url, { cache: 'no-store' })).text(); return { name, bytes: H.src[name].length, sha: (await H.sha(H.src[name])).slice(0, 16) }; };
const HOOK = `\n;window.__hook={get D(){return D},get CONFIG(){return CONFIG},render,currentFilters,periodDates,prevPeriodDates,dates,allDates,liveDateSet,aggregateSku,aggregateDaily,dailyFor,riskFor,stockFor,avgContentScore,allMarketAvgDailySales14d,channelShareText,operationalEconomicsFor,prevMap,marketBreakdownFor,populateCabinetFilter,populateDimensionFilters,applyMarketplacePageTheme,refreshQuickSkuList,startDashboard};\n`;
// Create an isolated instance (iframe) running core source `srcName` on frozen snapshot(s).
// snapTexts: array of snapshot texts served on successive data requests (to test re-load / invalidation).
H.instance = (srcName, tenant, snapTexts) => new Promise((resolve, reject) => {
  const fr = document.createElement('iframe'); fr.style.cssText = 'width:1400px;height:900px;position:absolute;left:-5000px;top:0';
  fr.src = BASE + 'dev23/index.html?tenant=' + tenant + '&period=30&_=' + Math.random();
  fr.onload = async () => {
    try {
      const w = fr.contentWindow, d = fr.contentDocument;
      let n = 0; const reg = H.snap[tenant].reg, origFetch = w.fetch.bind(w);
      w.fetch = (url, opt) => {
        const s = String(url);
        if (s.includes('dashboard-data-dev23') && s.includes('view=registry')) return Promise.resolve(new w.Response(reg, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (s.includes('dashboard-data-dev23')) { const t = snapTexts[Math.min(n, snapTexts.length - 1)]; n++; return Promise.resolve(new w.Response(t, { status: 200, headers: { 'Content-Type': 'application/json' } })); }
        return origFetch(url, opt);
      };
      let core = H.src[srcName]
        .replace(/from\s+['"]\.\.\/\.\.\/core\/runtime-registry\.js[^'"]*['"]/, `from '${BASE}core/runtime-registry.js?v=20261004finish'`)
        .replace(/from\s+['"]\.\/canonical-sku\.js['"]/, `from '${BASE}daily/core/canonical-sku.js'`);
      const coreUrl = URL.createObjectURL(new Blob([core + HOOK], { type: 'text/javascript' }));
      let app = H.src.app
        .replace(/from\s+['"]\.\/core\/dashboard-core\.js[^'"]*['"]/, `from '${coreUrl}'`)
        .replace(/from\s+['"]\.\.\/config\/(\w+)\.js['"]/g, (m, f) => `from '${BASE}config/${f}.js'`)
        .replace(/from\s+['"]\.\.\/core\/runtime-registry\.js[^'"]*['"]/, `from '${BASE}core/runtime-registry.js?v=20261004finish'`);
      d.head.innerHTML = '<meta charset="utf-8"><link rel="stylesheet" href="' + BASE + 'daily/core/dashboard.css"><link rel="stylesheet" href="' + BASE + 'daily/styles.css">';
      d.body.removeAttribute('style'); d.body.innerHTML = '<main id="app"></main>';
      const t0 = w.performance.now();
      const appUrl = URL.createObjectURL(new Blob([app], { type: 'text/javascript' }));
      await w.eval('import(' + JSON.stringify(appUrl) + ')').catch(e => { throw e; });
      const start = Date.now();
      while (Date.now() - start < 600000) { const l = d.getElementById('load'); if (l && l.classList.contains('hide')) break; await new Promise(r => setTimeout(r, 50)); }
      const err = d.getElementById('err'); if (err && !err.classList.contains('hide')) throw new Error('page error: ' + err.textContent);
      resolve({ fr, w, d, readyMs: w.performance.now() - t0 });
    } catch (e) { reject(e); }
  };
  document.body.appendChild(fr);
});
// Apply a filter scenario through the same populate functions the UI handlers use, then render once.
H.apply = (inst, sc) => {
  const { d, w } = inst, h = w.__hook, E = id => d.getElementById(id);
  const setSel = (id, v) => { const el = E(id); if (!el) return false; const ok = [...el.options].some(o => o.value === v); el.value = ok ? v : el.value; return ok; };
  setSel('marketplace', sc.mk || 'ALL'); h.applyMarketplacePageTheme(); h.populateCabinetFilter(); h.populateDimensionFilters(); h.refreshQuickSkuList();
  setSel('cabinet', sc.cab || 'ALL'); h.populateDimensionFilters();
  setSel('masterCategory', sc.master || 'ALL'); h.populateDimensionFilters();
  setSel('category', sc.cat || 'ALL'); setSel('brand', sc.brand || 'ALL');
  E('q').value = sc.q || '';
  setSel('days', sc.days || '30'); h.refreshQuickSkuList();
  const t = w.performance.now(); h.render(); return w.performance.now() - t;
};
// Canonical state of everything the dashboard computes for the current filters.
H.state = async inst => {
  const { d, w } = inst, h = w.__hook;
  const f = h.currentFilters(), cur = h.periodDates(0), prev = h.prevPeriodDates();
  const skus = h.aggregateSku(cur), pm = h.prevMap();
  const perSku = {};
  for (const a of skus) {
    perSku[a.key] = await H.sha(H.canon({ a, risk: h.riskFor(a, pm), stock: h.stockFor(a), avg14: h.allMarketAvgDailySales14d(a), share: h.channelShareText(a), content: h.avgContentScore(a), econ: h.operationalEconomicsFor(a.key, a.marketplace) }));
  }
  const html = d.getElementById('app').innerHTML;
  const obj = { f, cur, prev, dates: h.dates(), allDates: h.allDates(), live: [...h.liveDateSet()].sort(), order: skus.map(a => a.key), kpiCur: h.aggregateDaily(h.dailyFor(cur)), kpiPrev: h.aggregateDaily(h.dailyFor(prev)), perSku };
  return { hash: await H.sha(H.canon(obj)), htmlHash: await H.sha(html), nSkus: skus.length, perSku, kpi: obj.kpiCur, html };
};
// Scenario matrix built from the snapshot's available filter values.
H.scenarios = (inst, mode) => {
  const { d, w } = inst, h = w.__hook, E = id => d.getElementById(id), D = h.D, out = [];
  const opts = id => [...E(id).options].map(o => o.value);
  const periods = ['7', '14', '30', 'MONTH', '999'];
  const mks = opts('marketplace');
  for (const days of periods) for (const mk of mks) out.push({ days, mk });
  for (const mk of mks) { E('marketplace').value = mk; h.populateCabinetFilter(); for (const cab of opts('cabinet').filter(v => v !== 'ALL')) out.push({ days: '30', mk, cab }); }
  E('marketplace').value = mks[0]; h.populateCabinetFilter(); h.populateDimensionFilters();
  const masters = opts('masterCategory').filter(v => v !== 'ALL'), cats = opts('category').filter(v => v !== 'ALL'), brands = opts('brand').filter(v => v !== 'ALL');
  const pickN = (a, n) => mode === 'full' ? a : a.slice(0, n);
  for (const m of pickN(masters, 2)) out.push({ days: '30', mk: mks[0], master: m });
  for (const c of pickN(cats, 2)) out.push({ days: '30', mk: mks[0], cat: c });
  for (const b of pickN(brands, 2)) out.push({ days: '7', mk: mks[0], brand: b });
  const sk = (D.sku_daily || [])[0]; if (sk) out.push({ days: '30', mk: mks[0], q: String(sk.article || sk.sku || '').slice(0, 4).toLowerCase() });
  out.push({ days: '30', mk: mks[0] }); // return to default at the end (stale-cache check)
  return out.map((s, i) => ({ id: i + ':' + Object.entries(s).map(([k, v]) => k + '=' + v).join('|'), ...s }));
};
// Run scenarios on an instance, collect results.
H.run = async (inst, scs, progress) => {
  const res = {};
  for (const sc of scs) { const ms = H.apply(inst, sc); const st = await H.state(inst); res[sc.id] = { hash: st.hash, htmlHash: st.htmlHash, nSkus: st.nSkus, renderMs: Math.round(ms), perSku: st.perSku, kpi: st.kpi }; if (progress) progress(sc.id); }
  return res;
};
H.compare = (a, b) => {
  const out = { total: 0, equal: 0, htmlEqual: 0, diffs: [] };
  for (const id of Object.keys(a)) {
    out.total++; const x = a[id], y = b[id];
    if (!y) { out.diffs.push({ id, missing: true }); continue; }
    if (x.hash === y.hash) out.equal++;
    if (x.htmlHash === y.htmlHash) out.htmlEqual++;
    if (x.hash !== y.hash || x.htmlHash !== y.htmlHash) {
      const keys = new Set([...Object.keys(x.perSku), ...Object.keys(y.perSku)]);
      const skuDiff = [...keys].filter(k => x.perSku[k] !== y.perSku[k]);
      out.diffs.push({ id, stateEq: x.hash === y.hash, htmlEq: x.htmlHash === y.htmlHash, nSkus: [x.nSkus, y.nSkus], skuDiff: skuDiff.slice(0, 10), skuDiffCount: skuDiff.length });
    }
  }
  return out;
};
return 'harness ready';
})();

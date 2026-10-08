// Full-page E2E: real prod page (daily/, current core) vs the same app with the new core, both on live network.
// Identical UI events are applied to both; #app and the SKU drawer HTML are compared after every step.
(() => {
const BASE = location.origin + '/marketplace-dashboards/';
const E2E = window.__E2E = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
E2E.waitReady = async (d, timeout = 180000) => { const st = Date.now(); while (Date.now() - st < timeout) { const l = d.getElementById('load'); if (l && l.classList.contains('hide')) return true; await sleep(30); } return false; };
E2E.openProd = tenant => new Promise(res => { const fr = document.createElement('iframe'); fr.style.cssText = 'width:1400px;height:900px;position:absolute;left:-5000px;top:0'; fr.src = BASE + 'daily/?tenant=' + tenant + '&period=30&_=' + Math.random(); fr.onload = async () => { const t0 = performance.now(); await E2E.waitReady(fr.contentDocument); res({ fr, w: fr.contentWindow, d: fr.contentDocument, readyMs: performance.now() - t0 }); }; document.body.appendChild(fr); });
E2E.openNew = async tenant => { const i = await __H.instanceNet('new', tenant); return i; };
E2E.snap = inst => { const d = inst.d, dr = d.getElementById('productDrawer'); return { app: d.getElementById('app').innerHTML, drawer: dr ? dr.innerHTML : '', open: !!(dr && dr.open), title: d.title }; };
const fire = (el, type) => el.dispatchEvent(new (el.ownerDocument.defaultView.Event)(type, { bubbles: true }));
const click = el => el.dispatchEvent(new (el.ownerDocument.defaultView.MouseEvent)('click', { bubbles: true, cancelable: true }));
// Build a deterministic action list from the prod page's controls (values chosen once, replayed on both).
E2E.actions = inst => {
  const d = inst.d, $ = id => d.getElementById(id), opts = id => $(id) ? [...$(id).options].map(o => o.value) : [];
  const A = [];
  for (const v of ['7', 'MONTH', '999', '14', '30']) A.push({ t: 'select', id: 'days', v });
  for (const v of opts('marketplace')) A.push({ t: 'select', id: 'marketplace', v });
  const cabs = opts('cabinet').filter(v => v !== 'ALL').slice(0, 3); for (const v of cabs) A.push({ t: 'select', id: 'cabinet', v }); if (cabs.length) A.push({ t: 'select', id: 'cabinet', v: 'ALL' });
  for (const id of ['masterCategory', 'category', 'brand']) { const v = opts(id).filter(x => x !== 'ALL')[0]; if (v) { A.push({ t: 'select', id, v }); A.push({ t: 'select', id, v: 'ALL' }); } }
  A.push({ t: 'input', id: 'q', v: 'a' }); A.push({ t: 'input', id: 'q', v: '' });
  for (const b of [...d.querySelectorAll('#focusTabs [data-focus]')].map(b => b.dataset.focus)) A.push({ t: 'clickSel', sel: '#focusTabs [data-focus="' + b + '"]' });
  for (const b of [...d.querySelectorAll('#breakdownSwitch [data-breakdown]')].map(b => b.dataset.breakdown)) A.push({ t: 'clickSel', sel: '#breakdownSwitch [data-breakdown="' + b + '"]' });
  for (const s of [...d.querySelectorAll('#allSkuHead [data-sort]')].map(b => b.dataset.sort).slice(0, 3)) { A.push({ t: 'clickSel', sel: '#allSkuHead [data-sort="' + s + '"]' }); A.push({ t: 'clickSel', sel: '#allSkuHead [data-sort="' + s + '"]' }); }
  A.push({ t: 'clickSel', sel: '#showMore' });
  for (const id of ['skuMarket', 'skuStock', 'skuMaster', 'skuBrand']) { const v = opts(id).filter(x => x !== 'ALL')[0]; if (v) { A.push({ t: 'select', id, v }); A.push({ t: 'select', id, v: 'ALL' }); } }
  A.push({ t: 'input', id: 'skuSearch', v: 'b' }); A.push({ t: 'input', id: 'skuSearch', v: '' });
  for (const mode of [...d.querySelectorAll('#moverMode [data-mode]')].map(b => b.dataset.mode)) A.push({ t: 'clickSel', sel: '#moverMode [data-mode="' + mode + '"]' });
  for (const k of [0, 1, 2]) { A.push({ t: 'openRow', k }); for (const tab of ['overview', 'dynamics', 'economics']) A.push({ t: 'clickSel', sel: '#productDrawer [data-tab="' + tab + '"]', optional: true }); A.push({ t: 'clickSel', sel: '#drawerClose' }); }
  A.push({ t: 'select', id: 'days', v: '7' }); A.push({ t: 'openRow', k: 0 }); A.push({ t: 'clickSel', sel: '#drawerClose' }); A.push({ t: 'select', id: 'days', v: '30' });
  return A;
};
E2E.apply = (inst, a) => {
  const d = inst.d, $ = id => d.getElementById(id);
  if (a.t === 'select') { const el = $(a.id); if (!el) return 'missing'; el.value = a.v; fire(el, 'change'); if (el.onchange && !el.__noOnchange) { } return 'ok'; }
  if (a.t === 'input') { const el = $(a.id); if (!el) return 'missing'; el.value = a.v; fire(el, 'input'); return 'ok'; }
  if (a.t === 'clickSel') { const el = d.querySelector(a.sel); if (!el) return a.optional ? 'skip' : 'missing'; click(el); return 'ok'; }
  if (a.t === 'openRow') { const rows = [...d.querySelectorAll('#app tr[data-key]')]; const r = rows[a.k]; if (!r) return 'missing'; click(r); return 'ok'; }
};
E2E.run = async (tenant, log) => {
  const prod = await E2E.openProd(tenant), neu = await E2E.openNew(tenant);
  const out = { tenant, prodReady: Math.round(prod.readyMs), newReady: Math.round(neu.readyMs), steps: 0, equal: 0, diffs: [] };
  const cmp = (label) => { const a = E2E.snap(prod), b = E2E.snap(neu); out.steps++; const eq = a.app === b.app && a.drawer === b.drawer && a.open === b.open; if (eq) out.equal++; else { let i = 0; const x = a.app === b.app ? a.drawer : a.app, y = a.app === b.app ? b.drawer : b.app; while (i < x.length && x[i] === y[i]) i++; out.diffs.push({ label, part: a.app === b.app ? 'drawer' : 'app', at: i, prod: x.slice(Math.max(0, i - 60), i + 80), neu: y.slice(Math.max(0, i - 60), i + 80), open: [a.open, b.open] }); } };
  cmp('initial');
  const acts = E2E.actions(prod); out.actions = acts.length;
  const tp = [], tn = [];
  for (const a of acts) {
    let s = performance.now(); const r1 = E2E.apply(prod, a); tp.push(performance.now() - s);
    s = performance.now(); const r2 = E2E.apply(neu, a); tn.push(performance.now() - s);
    await sleep(20);
    cmp(JSON.stringify(a) + ' ' + r1 + '/' + r2);
    if (log) log(out.steps);
  }
  out.actionMs = { prodTotal: Math.round(tp.reduce((x, y) => x + y, 0)), newTotal: Math.round(tn.reduce((x, y) => x + y, 0)), prodMax: Math.round(Math.max(...tp)), newMax: Math.round(Math.max(...tn)) };
  out.consoleErrors = { prod: prod.w.__errs || null, neu: neu.w.__errs || null };
  prod.fr.remove(); neu.fr.remove();
  return out;
};
return 'e2e ready';
})();

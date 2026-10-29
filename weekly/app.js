import { ensureSession, makeAuthedFetch, mountAuthBadge } from '../shared/auth-dev.js';
await ensureSession();
const authedFetch = makeAuthedFetch({ onAccessDenied: () => {} });
mountAuthBadge();
(function () {
  'use strict';
  var PAYOUT_LAG = 17; // days from week start to payout date, as in the agreed mockup (Н39 21 сен -> 8 окт)
  var ACCOUNTS = [
    { id: 'ozon_w', org: 'W', market: 'OZON', name: 'W · Ozon W' },
    { id: 'ozon_cpr', org: 'CPR', market: 'OZON', name: 'CPR · Ozon CPR' },
    { id: 'ozon_orange_ipt', org: 'ORANGE', market: 'OZON', name: 'Orange · Ozon · IPT' },
    { id: 'ozon_orange_bond', org: 'ORANGE', market: 'OZON', name: 'Orange · Ozon · BOND' },
    { id: 'ozon_orange_psk', org: 'ORANGE', market: 'OZON', name: 'Orange · Ozon · PSK' },
    { id: 'ozon_orange_ipch', org: 'ORANGE', market: 'OZON', name: 'Orange · Ozon · IPCH' }
  ];
  var ORGS = ['W', 'CPR', 'ORANGE'];
  var MARKET_LABELS = { OZON: 'Ozon', WB: 'WB', YANDEX: 'Яндекс.Маркет' };
  function marketOf(id) { return id.indexOf('wb_') === 0 ? 'WB' : (id.indexOf('yandex_') === 0 ? 'YANDEX' : 'OZON'); }
  function isOzon(id) { return marketOf(id) === 'OZON'; }
  function ozonOnly(accs) { return accs.filter(isOzon); }
  var EXP_GROUPS = ['commission', 'logistics', 'fbo', 'storage', 'promotion', 'other', 'unmapped'];
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var NOCAT = 'Без категории';
  // SKU row layout
  var X = { wk: 0, sku: 1, net: 2, dC: 3, dL: 4, dS: 5, dP: 6, dO: 7, aC: 8, aL: 9, aS: 10, aP: 11, aO: 12, unm: 13, total: 14, comp: 15, sa: 16, ra: 17, qs: 18, qr: 19, dF: 20, aF: 21 };
  var ART = [
    { n: 'Комиссия', d: X.dC, a: X.aC }, { n: 'Логистика', d: X.dL, a: X.aL }, { n: 'Услуги FBO', d: X.dF, a: X.aF }, { n: 'Хранение', d: X.dS, a: X.aS },
    { n: 'Продвижение', d: X.dP, a: X.aP }, { n: 'Прочее', d: X.dO, a: X.aO }
  ];

  var G = {}, weeks = [], T = [], CAT = {}, status = {}, MARKETS = ['OZON'];
  var rowsAcc = {};      // acc -> array of raw SKU rows (merged chunks)
  var loaded = {};       // acc -> true when all chunks arrived
  var flat = null;       // flat[week] = [row objects], built lazily
  var by = null;         // by[acc|sku][week] = row object
  var dirty = true, histInit = false;
  var state = { org: 'W', acc: 'ALL', market: 'ALL', cat: 'ALL', week: null, open: { promotion: true, other: false }, skuOpen: null, showAll: false, fatal: null };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(x) { return x.toFixed(1).replace('.', ',') + '%'; }
  function sgn(x) { return x > 0 ? '+' : (x < 0 ? '−' : ''); }
  function num(x) { return Math.round(Math.abs(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function rubS(x) { return (Math.round(x) < 0 ? '−' : '') + num(x); }
  function pp(d) { return sgn(Math.round(d * 10) / 10) + Math.abs(d).toFixed(1).replace('.', ',') + ' п.п.'; }
  function avg(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function parseD(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(s, n) { var d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dmon(s) { var d = parseD(s); return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  function range(ws) { return dmon(ws) + '–' + dmon(addDays(ws, 6)); }
  function isoWeek(s) {
    var d = parseD(s); var day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
    var first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  }
  function wlabel(ws) { return 'Н' + isoWeek(ws); }
  function longRange(ws) {
    var a = parseD(ws), b = parseD(addDays(ws, 6));
    var left = a.getUTCMonth() === b.getUTCMonth() ? String(a.getUTCDate()) : a.getUTCDate() + ' ' + MONTHS_FULL[a.getUTCMonth()];
    return left + '–' + b.getUTCDate() + ' ' + MONTHS_FULL[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }
  function tones(bad) {
    if (bad >= 1.5) return { bg: 'var(--bad-bg)', fg: 'var(--bad)', bar: '#a33a2a' };
    if (bad >= 0.5) return { bg: 'var(--warn-bg)', fg: 'var(--warn)', bar: '#c0773f' };
    if (bad <= -0.5) return { bg: 'var(--good-bg)', fg: 'var(--good)', bar: '#2f6b3f' };
    return { bg: 'var(--soft)', fg: 'var(--body)', bar: '#2f4a36' };
  }
  function accName(id) { if (id === 'ALL') return 'Все кабинеты'; for (var i = 0; i < ACCOUNTS.length; i++) if (ACCOUNTS[i].id === id) return ACCOUNTS[i].name; return id; }
  function orgAccs() { return ACCOUNTS.filter(function (a) { return a.org === state.org && (state.market === 'ALL' || a.market === state.market); }); }
  function scopeAccs() {
    var mine = orgAccs().map(function (a) { return a.id; });
    if (state.acc === 'ALL' || !state.acc || mine.indexOf(state.acc) < 0) return mine;
    return [state.acc];
  }
  function gval(acc, w, g) { var a = G[acc]; return a && a[w] && a[w][g] ? a[w][g] : 0; }
  function gsum(accs, w, g) { var s = 0; for (var i = 0; i < accs.length; i++) s += gval(accs[i], w, g); return s; }
  function skuReady(accs) { return accs.every(function (a) { return loaded[a]; }) && status.cats === 'ok'; }

  /* ---------- data access: authenticated weekly-data-auth-dev ---------- */
  var BASE = 'https://tcefrvybgulcwwsdarcw.supabase.co/functions/v1/weekly-data-auth-dev';
  var cache = {};
  function errText(e) {
    var c = e && e.code;
    if (c === 403) return 'Нет доступа к организации ' + state.org + '. Выберите другую организацию или попросите доступ';
    if (c === 400) return 'Некорректный запрос недельных данных';
    if (c === 404) return 'Недельные данные для этой организации не найдены';
    if (c === 'parse') return 'Ответ сервера не удалось разобрать';
    return 'Не удалось загрузить данные (' + (c || 'ошибка сети') + ')';
  }
  function applyData(d) {
    G = {}; var ws = {};
    d.groups.forEach(function (r) { var a = r[0], w = r[1]; ws[w] = 1; G[a] = G[a] || {}; G[a][w] = G[a][w] || {}; G[a][w][r[2]] = +r[3]; });
    weeks = Object.keys(ws).sort();
    if (!state.week || weeks.indexOf(state.week) < 0) state.week = weeks[weeks.length - 1] || null;
    T = d.types;
    CAT = {}; d.cats.forEach(function (r) { CAT[r[0] + '|' + r[1]] = { cat: r[2] || NOCAT, art: r[3] }; });
    MARKETS = (d.marketplaces && d.marketplaces.length) ? d.marketplaces : ['OZON'];
    rowsAcc = {}; loaded = {};
    d.accounts.forEach(function (a) {
      rowsAcc[a] = []; loaded[a] = true;
      if (!ACCOUNTS.some(function (x) { return x.id === a; })) {
        var mk = marketOf(a), cab = a.replace(/^(ozon|wb|yandex)_[a-z]+_/, '').toUpperCase();
        ACCOUNTS.push({ id: a, org: state.org, market: mk, name: state.org + ' · ' + MARKET_LABELS[mk] + ' · ' + cab });
      }
    });
    d.skus.forEach(function (r) { (rowsAcc[r[22]] = rowsAcc[r[22]] || []).push(r); });
    if (state.market !== 'ALL' && MARKETS.indexOf(state.market) < 0) state.market = 'ALL';
    var mine = orgAccs().map(function (a) { return a.id; });
    if (state.acc !== 'ALL' && mine.indexOf(state.acc) < 0) state.acc = 'ALL';
    status = { group: 'ok', types: 'ok', cats: 'ok' };
    ACCOUNTS.forEach(function (a) { if (a.org === state.org) status['sku:' + a.id] = 'ok'; });
    dirty = true; flat = null;
  }
  function loadAll(fresh) {
    status = { group: 'wait', types: 'wait', cats: 'wait' }; weeks = []; state.fatal = null; render();
    var org = state.org;
    if (!fresh && cache[org]) { applyData(cache[org]); render(); return; }
    authedFetch(BASE + '?tenant=' + encodeURIComponent(org), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return Promise.reject({ code: r.status });
      return r.json().catch(function () { return Promise.reject({ code: 'parse' }); });
    }).then(function (d) {
      if (!d || d.contract_version !== 'weekly-finance-v2') return Promise.reject({ code: 'parse' });
      if (org !== state.org) return;
      cache[org] = d; applyData(d); render();
    }).catch(function (e) { if (org !== state.org) return; state.fatal = errText(e); render(); });
  }

  /* ---------- SKU index ---------- */
  function ensureFlat() {
    if (!dirty && flat) return;
    flat = {}; by = {};
    Object.keys(rowsAcc).forEach(function (acc) {
      rowsAcc[acc].forEach(function (r) {
        var c = CAT[acc + '|' + r[1]] || { cat: NOCAT, art: null };
        var o = { acc: acc, sku: r[1], wk: r[0], net: +r[2], dC: +r[3], dL: +r[4], dS: +r[5], dP: +r[6], dO: +r[7], aC: +r[8], aL: +r[9], aS: +r[10], aP: +r[11], aO: +r[12], unm: +r[13], total: +r[14], comp: +r[15], sa: +(r[16] || 0), ra: +(r[17] || 0), qs: +(r[18] || 0), qr: +(r[19] || 0), dF: +(r[20] || 0), aF: +(r[21] || 0), cat: c.cat, art: c.art, raw: r };
        (flat[o.wk] = flat[o.wk] || []).push(o);
        var k = acc + '|' + o.sku; (by[k] = by[k] || {})[o.wk] = o;
      });
    });
    dirty = false;
  }
  function inScope(o, set, cat) { return set[o.acc] && (cat === 'ALL' || o.cat === cat); }
  function toSet(accs) { var s = {}; accs.forEach(function (a) { s[a] = 1; }); return s; }

  /* ---------- calculations (formulas as in the agreed mockup) ---------- */
  function weekIdx() { return weeks.indexOf(state.week); }
  function emptyZ() { return weeks.map(function () { return 0; }); }
  function build(accs, cat, withUnits) {
    var ci = weekIdx(), n = weeks.length, B = { accs: accs, ci: ci, units: null, fromSku: cat !== 'ALL' };
    var sales, retS, exp = {}, comp;
    if (cat === 'ALL') {
      sales = weeks.map(function (w) { return gsum(accs, w, 'sales'); });
      retS = weeks.map(function (w) { return gsum(accs, w, 'returns'); });
      EXP_GROUPS.forEach(function (g) { exp[g] = weeks.map(function (w) { return -gsum(accs, w, g); }); });
      comp = weeks.map(function (w) { return gsum(accs, w, 'compensation_excluded'); });
    } else {
      ensureFlat(); var set = toSet(accs);
      sales = emptyZ(); retS = emptyZ(); comp = emptyZ(); EXP_GROUPS.forEach(function (g) { exp[g] = emptyZ(); });
      weeks.forEach(function (w, i) {
        (flat[w] || []).forEach(function (o) {
          if (!inScope(o, set, cat)) return;
          sales[i] += o.sa; retS[i] += o.ra; comp[i] += o.comp;
          exp.commission[i] -= o.dC + o.aC; exp.logistics[i] -= o.dL + o.aL; exp.fbo[i] -= o.dF + o.aF; exp.storage[i] -= o.dS + o.aS;
          exp.promotion[i] -= o.dP + o.aP; exp.other[i] -= o.dO + o.aO; exp.unmapped[i] -= o.unm;
        });
      });
    }
    if (withUnits && skuReady(accs)) {
      ensureFlat(); var st = toSet(accs); B.units = emptyZ();
      weeks.forEach(function (w, i) { (flat[w] || []).forEach(function (o) { if (inScope(o, st, cat)) B.units[i] += o.qs - o.qr; }); });
    }
    B.sales = sales; B.ret = retS.map(function (v) { return -v; });
    B.net = sales.map(function (v, i) { return v + retS[i]; });
    B.exp = exp; B.comp = comp;
    B.expTot = weeks.map(function (_, i) { return EXP_GROUPS.reduce(function (s, g) { return s + exp[g][i]; }, 0); });
    B.pay = weeks.map(function (_, i) { return B.net[i] - B.expTot[i] + comp[i]; });
    return B;
  }
  function idxs(from, to) { var o = []; for (var i = from; i <= to; i++) if (i >= 0 && i < weeks.length) o.push(i); return o; }
  function pctArr(rub, base) { return rub.map(function (v, i) { return base[i] > 0 ? v / base[i] * 100 : null; }); }
  function normOf(p, ci) { return avg(idxs(ci - 4, ci - 1).map(function (i) { return p[i]; }).filter(function (x) { return x != null; })); }

  /* ---------- expense table: anchor week pinned left, older weeks scroll right as a full history rail ---------- */
  function mon(i) { return weeks[i].slice(0, 7); }
  function monthEdge(i, ci) { return i === ci - 1 || mon(i) !== mon(i + 1); }
  function cellsHtml(rub, p, ci, sign, t, plain) {
    return '<td class="r week-rub week-anchor">' + (rub[ci] == null ? '' : rubS(sign ? -rub[ci] : rub[ci])) + '</td>' +
      '<td class="r week-pct week-anchor-pct" style="color:' + (plain ? 'var(--mute)' : t.fgc) + '">' + (plain ? '' : (p[ci] == null ? '—' : pct(p[ci]))) + '</td>';
  }
  function histCells(rub, p, ci, sign, plain) {
    var out = '';
    for (var i = ci - 1; i >= 0; i--) {
      out += '<td class="r week-history' + (monthEdge(i, ci) ? ' month-edge' : '') + '">' + (rub[i] == null ? '' : rubS(sign ? -rub[i] : rub[i])) + '</td>' +
        '<td class="r week-history" style="color:var(--mute);font-size:12px">' + (plain ? '' : (p[i] == null ? '—' : pct(p[i]))) + '</td>';
    }
    return out;
  }
  function expRow(o, B, alerts) {
    var ci = B.ci, base = o.base || B.net;
    var p = pctArr(o.rub, base), n = normOf(p, ci), cur = p[ci];
    var have = cur != null && n != null, d = have ? cur - n : 0;
    var t = tones(o.goodUp ? -d : d), dR = d / 100 * (base[ci] || 0);
    t.fgc = (have && Math.abs(d) >= 0.5) ? t.fg : 'var(--mute)';
    if (have && !o.noAlert && !o.goodUp && d >= 0.5) alerts.push({ d: d, text: o.name + ': ' + num(o.rub[ci]) + ' ₽ (' + pct(cur) + ') при норме ' + pct(n) + ' — ' + pp(d) + ', +' + num(dR) + ' ₽ за неделю' });
    if (have && o.goodUp && !o.noAlert && d <= -0.5) alerts.push({ d: -d, text: o.name + ' снизились: ' + pct(cur) + ' при норме ' + pct(n) + ', −' + num(Math.abs(dR)) + ' ₽ за неделю' });
    var bg = o.kind === 'child' ? 'var(--sub)' : (o.kind === 'total' ? 'var(--total)' : '#fff');
    var bt = o.kind === 'total' ? '2px solid var(--ink)' : '1px solid var(--soft)';
    var ind = o.kind === 'child' ? 52 : (o.kind === 'row' ? 26 : 10);
    var artW = 222 - ind; // keeps article column total width constant (230px content) across indent levels
    var nameCell = o.key ? '<button type="button" class="tgl" data-act="grp" data-k="' + o.key + '"><span class="m">' + (state.open[o.key] ? '▾' : '▸') + '</span>' + esc(o.name) + '</button>' : esc(o.name);
    var per = B.units && B.units[ci] > 0 ? num(o.rub[ci] / B.units[ci]) : '—';
    return '<tr style="background:' + bg + ';border-top:' + bt + ';font-weight:' + (o.kind === 'total' ? 600 : 400) + '">' +
      '<td class="lft week-article" style="padding-left:' + ind + 'px;color:' + (o.kind === 'child' ? 'var(--body)' : 'var(--ink)') + '"><div class="artclip" style="width:' + artW + 'px">' + nameCell + (o.tag ? ' <span class="tag" style="background:var(--soft);color:var(--mute)">' + esc(o.tag) + '</span>' : '') + '</div></td>' +
      cellsHtml(o.rub, p, ci, o.sign, t) +
      '<td class="r" style="padding-inline:10px;border-left:1px solid var(--line)">' + per + '</td>' +
      '<td class="r" style="color:var(--mute);padding-inline:10px">' + (n == null ? '—' : pct(n)) + '</td>' +
      '<td class="r" style="padding:5px 10px">' + (have ? '<span class="badge" style="background:' + t.bg + ';color:' + t.fg + '">' + pp(d) + '</span>' : '') + '</td>' +
      '<td class="r" style="font-weight:600;padding-inline:10px;color:' + (have && Math.abs(dR) >= 500 ? t.fg : 'var(--mute2)') + '">' + (have ? (Math.abs(dR) < 500 ? '—' : sgn(dR) + num(dR)) : '') + '</td>' +
      histCells(o.rub, p, ci, o.sign, false) + '</tr>';
  }
  function moneyRow(name, v, B, bold, unitsRow) {
    var ci = B.ci, n = avg(idxs(ci - 4, ci - 1).map(function (i) { return v[i]; }));
    var g = n ? (v[ci] / n - 1) * 100 : 0;
    var t = Math.abs(g) < 3 ? tones(0) : (g > 0 ? { bg: 'var(--good-bg)', fg: 'var(--good)', bar: '#2f6b3f' } : { bg: 'var(--warn-bg)', fg: 'var(--warn)', bar: '#c0773f' });
    var per = B.units && B.units[ci] > 0 ? num(v[ci] / B.units[ci]) : '—';
    return '<tr style="background:' + (bold ? 'var(--total)' : '#fff') + ';border-top:1px solid ' + (bold ? '#d9d5ca' : 'var(--soft)') + ';font-weight:' + (bold ? 600 : 400) + '">' +
      '<td class="lft week-article" style="padding-left:10px"><div class="artclip" style="width:212px">' + esc(name) + '</div></td>' +
      cellsHtml(v, [], ci, false, t, true) +
      '<td class="r" style="padding-inline:10px;border-left:1px solid var(--line)">' + per + '</td>' +
      '<td class="r" style="color:var(--mute);padding-inline:10px">' + (n == null ? '—' : num(n)) + '</td>' +
      '<td class="r" style="padding:5px 10px">' + (n ? '<span class="badge" style="background:' + t.bg + ';color:' + t.fg + '">' + sgn(g) + Math.abs(g).toFixed(1).replace('.', ',') + '%</span>' : '') + '</td>' +
      '<td class="r" style="color:var(--body);padding-inline:10px">' + (n == null ? '' : sgn(v[ci] - n) + num(v[ci] - n)) + '</td>' +
      histCells(v, [], ci, false, true) + '</tr>';
  }
  function typeKids(B, g) {
    var set = toSet(B.accs), keys = {}, lbl = {}, m = {};
    T.forEach(function (r) {
      if (!set[r[0]] || r[2] !== g) return;
      var k = r[3] + '|' + r[4]; keys[k] = 1; if (r[6]) lbl[r[3]] = r[6];
      m[k] = m[k] || {}; m[k][r[1]] = (m[k][r[1]] || 0) - r[5];
    });
    var out = Object.keys(keys).map(function (k) {
      var pr = k.split('|'), rub = weeks.map(function (w) { return m[k][w] || 0; });
      return { tid: +pr[0], nosku: +pr[1], rub: rub, label: lbl[+pr[0]], cur: rub[B.ci] || 0 };
    });
    out.sort(function (a, b) { return Math.abs(b.cur) - Math.abs(a.cur); });
    return out.filter(function (k) { return k.rub.some(function (v) { return Math.abs(v) > 0.5; }); });
  }
  function expenseTable(B, alerts) {
    var ci = B.ci, rows = [];
    rows.push(moneyRow('Продажи', B.sales, B, false));
    rows.push(expRow({ name: 'Возвраты', rub: B.ret, base: B.sales, sign: true, kind: 'row' }, B, alerts));
    rows.push(moneyRow('Чистые продажи (база для %)', B.net, B, true));
    var labels = { commission: 'Комиссия', logistics: 'Логистика', fbo: 'Услуги FBO', storage: 'Хранение (отдельно)', promotion: 'Продвижение', other: 'Прочее', unmapped: 'Не классифицировано' };
    var expandable = { fbo: 1, storage: 1, promotion: 1, other: 1, unmapped: 1 };
    EXP_GROUPS.forEach(function (g) {
      if (g === 'unmapped' && !B.exp[g].some(function (v) { return Math.abs(v) > 0.5; })) return;
      var kids = (expandable[g] && !B.fromSku && T.length) ? typeKids(B, g) : [];
      var opened = !!(kids.length && state.open[g]);
      rows.push(expRow({ name: labels[g], rub: B.exp[g], kind: 'row', key: kids.length ? g : null }, B, alerts));
      if (opened) kids.forEach(function (k) {
        var lb = k.label && !/^legacy/.test(k.label) ? String(k.label) : '';
        rows.push(expRow({ name: lb || ('Тип ' + k.tid), rub: k.rub, kind: 'child', noAlert: true, tag: k.nosku ? 'без SKU, расчёт' : 'по SKU' }, B, alerts));
      });
    });
    rows.push(expRow({ name: 'Итого расходы', rub: B.expTot, kind: 'total', noAlert: true }, B, alerts));
    rows.push(expRow({ name: 'Компенсации Ozon (отдельно, вне расходов)' + (ozonOnly(B.accs).length < B.accs.length ? ' · WB не включён' : ''), rub: B.comp, goodUp: true, kind: 'row' }, B, alerts));
    rows.push(expRow({ name: 'К выплате', rub: B.pay, goodUp: true, kind: 'total', noAlert: true }, B, alerts));
    var anchorHead = '<th class="r week-rub week-anchor">' + wlabel(weeks[ci]) + '<small>' + range(weeks[ci]) + (ci >= weeks.length - 2 ? ' · предв.' : '') + '</small></th><th class="r week-pct week-anchor-pct">%</th>';
    var histHead = '';
    for (var hi = ci - 1; hi >= 0; hi--) {
      var wl = wlabel(weeks[hi]) + '<small>' + range(weeks[hi]) + (hi >= weeks.length - 2 ? ' · предв.' : '') + '</small>';
      histHead += '<th class="r week-history' + (monthEdge(hi, ci) ? ' month-edge' : '') + '">' + (monthEdge(hi, ci) ? '<span class="mlab">' + MONTHS_FULL[+mon(hi).slice(5) - 1] + '</span>' : '') + wl + '</th><th class="r week-history">%</th>';
    }
    return '<div class="card"><div class="top"><h2>Расходы по статьям · ₽ и % от чистых продаж</h2>' +
      '<div class="n">' + wlabel(weeks[Math.max(0, weeks.length - 2)]) + '–' + wlabel(weeks[weeks.length - 1]) + ' предварительные: возвраты и обратная доставка доначисляются до 2 недель · Выбранная неделя закреплена слева, предыдущие недели идут правее и листаются · Хранение и компенсации показаны отдельными строками' + (T.length && !B.fromSku ? ' · «Продвижение», «Прочее» и «Хранение» раскрываются по типам начислений Ozon' : '') + '</div></div>' +
      '<div class="scroll week-scroll" id="weekHistScroll"><table class="expense-week-table" style="min-width:' + Math.max(1260, 690 + ci * 168) + 'px;font-size:13.5px"><thead><tr style="border-bottom:1px solid var(--line)"><th class="lft week-article" style="padding-left:10px">Статья</th>' + anchorHead +
      '<th class="r" style="padding-inline:10px;border-left:1px solid var(--line)">На 1 шт<small>' + wlabel(weeks[ci]) + ', ₽</small></th><th class="r" style="padding-inline:10px">Норма<small>4 нед.</small></th><th class="r" style="padding-inline:10px">Δ к норме</th><th class="r" style="padding-inline:10px">Δ, ₽<small>за неделю</small></th>' + histHead + '</tr></thead><tbody>' +
      rows.join('') + '</tbody></table></div></div>';
  }

  /* ---------- KPI, payouts ---------- */
  function payoutDate(w) { return addDays(w, PAYOUT_LAG); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function kpiBlock(B) {
    var ci = B.ci, pe = pctArr(B.expTot, B.net), ne = normOf(pe, ci), ce = pe[ci];
    var have = ce != null && ne != null, over = have ? (ce - ne) / 100 * B.net[ci] : 0;
    var pp2 = pctArr(B.pay, B.net), np = normOf(pp2, ci), cp = pp2[ci];
    var u = B.units, uc = u ? u[ci] : null, un = u ? avg(idxs(ci - 4, ci - 1).map(function (i) { return u[i]; })) : null;
    var today = todayStr(), unpaid = [];
    idxs(ci - 2, ci).forEach(function (i) { if (payoutDate(weeks[i]) > today) unpaid.push(i); });
    var unpaidSum = unpaid.reduce(function (s, i) { return s + B.pay[i]; }, 0);
    var k = [];
    k.push({ l: 'Доставлено за неделю', v: uc == null ? '…' : num(uc) + ' шт', s: 'чистые продажи ' + num(B.net[ci]) + ' ₽', d: (un && uc != null) ? sgn(uc / un - 1) + Math.abs((uc / un - 1) * 100).toFixed(1).replace('.', ',') + '% к норме по шт' : '', c: (un && uc >= un) ? 'var(--good)' : 'var(--body)' });
    k.push({ l: 'Расходы', v: num(B.expTot[ci]) + ' ₽', s: (ce == null ? '—' : pct(ce)) + ' от чистых продаж' + (uc > 0 ? ' · ' + num(B.expTot[ci] / uc) + ' ₽ на 1 шт' : '') + ' · в т.ч. хранение ' + num(B.exp.storage[ci]) + ' ₽', d: have ? pp(ce - ne) + ' к норме · ' + (over >= 0 ? '+' : '−') + num(over) + ' ₽ переплата' : '', c: have ? tones(ce - ne).fg : 'var(--body)' });
    k.push({ l: 'К выплате за неделю', v: rubS(B.pay[ci]) + ' ₽', s: (cp == null ? '—' : pct(cp)) + ' от чистых продаж' + (np == null ? '' : ' · норма ' + pct(np)) + ' · компенсации ' + rubS(B.comp[ci]) + ' ₽ отдельно', d: (np == null || cp == null) ? '' : pp(cp - np) + ' к норме', c: (np == null || cp == null) ? 'var(--body)' : tones(-(cp - np)).fg });
    k.push({ l: 'Начислено, ещё не пришло', v: unpaid.length ? rubS(unpaidSum) + ' ₽' : '0 ₽', s: unpaid.length ? 'ближайшая выплата ' + dmon(payoutDate(weeks[unpaid[0]])) + ' · ' + rubS(B.pay[unpaid[0]]) + ' ₽' : 'все выплаты за последние недели по графику наступили', d: unpaid.length ? 'за ' + unpaid.map(function (i) { return wlabel(weeks[i]); }).join(' и ') : '', c: 'var(--body)' });
    return '<div class="kpis">' + k.map(function (x) {
      return '<div class="kpi"><div class="kl">' + x.l + '</div><div class="kv">' + x.v + '</div><div class="ks">' + x.s + '</div><div class="kd" style="color:' + x.c + '">' + x.d + '</div></div>';
    }).join('') + '</div>';
  }
  function payoutsBlock(B) {
    var ci = B.ci, today = todayStr();
    var rows = idxs(ci - 2, ci).map(function (i) {
      var date = payoutDate(weeks[i]), due = date <= today, prov = i >= weeks.length - 2;
      var p = B.net[i] > 0 ? B.pay[i] / B.net[i] * 100 : null;
      return '<tr style="border-top:1px solid var(--line2)"><td style="padding:10px">' + wlabel(weeks[i]) + ' · ' + range(weeks[i]) + '</td><td class="r" style="padding:10px;font-weight:600">' + rubS(B.pay[i]) + ' ₽</td><td style="padding:10px">' + dmon(date) + '</td>' +
        '<td style="padding:8px 10px"><span class="pill" style="background:' + (due ? 'var(--good-bg)' : 'var(--chip)') + ';color:' + (due ? 'var(--good)' : 'var(--accent-ink)') + '">' + (due ? 'Срок наступил' : 'Ожидается') + (prov ? ' · предв.' : '') + '</span></td>' +
        '<td class="r" style="padding:10px">' + (p == null ? '—' : pct(p)) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="top"><h2>Когда придут начисленные деньги</h2><div class="n">Дата выплаты — расчётная, через ' + PAYOUT_LAG + ' дней после начала недели, как в согласованном макете. Фактические поступления здесь не сверяются</div></div>' +
      '<div class="scroll"><table style="min-width:720px;font-size:14px"><thead><tr style="text-align:left"><th style="padding:8px 10px">Неделя продаж</th><th class="r" style="padding:8px 10px">Начислено к выплате</th><th style="padding:8px 10px">Дата поступления</th><th style="padding:8px 10px">Статус</th><th class="r" style="padding:8px 10px">Доля от чистых продаж</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------- categories ---------- */
  function catData(B) {
    ensureFlat(); var set = toSet(B.accs), ci = B.ci, cats = {};
    weeks.forEach(function (w, i) {
      (flat[w] || []).forEach(function (o) {
        if (!set[o.acc]) return;
        var c = cats[o.cat] = cats[o.cat] || { net: emptyZ(), exp: emptyZ(), art: ART.map(emptyZ) };
        c.net[i] += o.net; c.exp[i] -= o.total;
        ART.forEach(function (a, k) { c.art[k][i] -= o.raw[a.d] + o.raw[a.a]; });
      });
    });
    return cats;
  }
  function categoriesBlock(B) {
    var oaccs = ozonOnly(B.accs);
    if (!oaccs.length) return '<div class="card"><div class="top"><h2>Расходы по мастер-категориям</h2></div><div class="sub">Доступно только для кабинетов Ozon — в выборке их нет.</div></div>';
    if (!skuReady(oaccs)) return '<div class="card"><div class="top"><h2>Расходы по мастер-категориям</h2></div><div class="sub">Загружаются данные по SKU и категориям…</div></div>';
    var ci = B.ci, cats = catData({ accs: oaccs }), totNet = 0;
    var list = Object.keys(cats).map(function (name) {
      var c = cats[name], p = pctArr(c.exp, c.net), n = normOf(p, ci), cur = p[ci];
      var d = (cur != null && n != null) ? cur - n : null, ov = d == null ? 0 : d / 100 * c.net[ci];
      var drv = ART.map(function (a, k) {
        var pa = pctArr(c.art[k], c.net), na = normOf(pa, ci), ca = pa[ci];
        return { n: a.n.toLowerCase(), d: (ca != null && na != null) ? ca - na : 0 };
      }).filter(function (x) { return x.d >= 0.3; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 2).map(function (x) { return x.n + ' ' + pp(x.d); });
      return { name: name, net: c.net[ci], exp: c.exp[ci], n: n, cur: cur, d: d, ov: ov, drv: drv.join(', ') };
    }).filter(function (x) { return Math.abs(x.net) > 0.5 || Math.abs(x.exp) > 0.5; });
    list.forEach(function (x) { totNet += Math.max(0, x.net); });
    list.sort(function (a, b) { return b.ov - a.ov; });
    var rows = list.map(function (x) {
      var t = tones(x.d == null ? 0 : x.d), sel = state.cat === x.name;
      return '<tr class="click" data-act="cat" data-k="' + esc(x.name) + '" style="border-top:1px solid var(--line2);' + (sel ? 'background:var(--total)' : '') + '"><td class="lft" style="padding:10px;font-weight:600">' + esc(x.name) + '</td>' +
        '<td class="r" style="padding:10px">' + rubS(x.net) + '</td><td class="r" style="padding:10px;color:var(--mute)">' + (totNet > 0 ? pct(Math.max(0, x.net) / totNet * 100) : '—') + '</td>' +
        '<td class="r" style="padding:10px">' + num(x.exp) + '</td><td class="r" style="padding:10px">' + (x.n == null ? '—' : pct(x.n)) + ' → ' + (x.cur == null ? '—' : pct(x.cur)) + '</td>' +
        '<td class="r" style="padding:6px 10px">' + (x.d == null ? '' : '<span class="badge" style="background:' + t.bg + ';color:' + t.fg + '">' + pp(x.d) + '</span>') + '</td>' +
        '<td class="r" style="padding:10px;font-weight:600;color:' + t.fg + '">' + (x.d == null || Math.abs(x.ov) < 500 ? '—' : sgn(x.ov) + num(x.ov)) + '</td>' +
        '<td class="lft" style="padding:10px;color:var(--body)">' + (x.drv || '—') + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="top"><h2>Расходы по мастер-категориям</h2><div class="n">Сортировка по переплате к норме · клик по строке ставит фильтр мастер-категории' + (state.cat !== 'ALL' ? ' · <button type="button" class="lnk" data-act="catclear">сбросить фильтр</button>' : '') + (oaccs.length < B.accs.length ? ' · только по кабинетам Ozon в выборке' : '') + '</div></div>' +
      '<div class="scroll"><table style="min-width:900px;font-size:14px"><thead><tr><th class="lft" style="padding:8px 10px">Мастер-категория</th><th class="r" style="padding:8px 10px">Чистые продажи<small>' + wlabel(weeks[ci]) + ', ₽</small></th><th class="r" style="padding:8px 10px">Доля</th><th class="r" style="padding:8px 10px">Расходы Ozon<small>' + wlabel(weeks[ci]) + ', ₽</small></th><th class="r" style="padding:8px 10px">Расходы Ozon<small>норма → ' + wlabel(weeks[ci]) + '</small></th><th class="r" style="padding:8px 10px">Δ к норме</th><th class="r" style="padding:8px 10px">Переплата, ₽<small>за неделю</small></th><th class="lft" style="padding:8px 10px">Что выросло</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------- cabinets ---------- */
  function cabinetsTable(B0) {
    var ci = B0.ci;
    var rows = orgAccs().map(function (a) {
      var B = build([a.id], state.cat, false);
      var p = pctArr(B.expTot, B.net), n = normOf(p, ci), cur = p[ci];
      var d = (cur != null && n != null) ? cur - n : null, t = tones(d == null ? 0 : d);
      return '<tr class="click" data-act="acc" data-k="' + a.id + '" style="border-top:1px solid var(--line2);' + (state.acc === a.id ? 'background:var(--total)' : '') + '"><td class="lft" style="padding:10px;font-weight:600">' + esc(a.name) + '</td>' +
        '<td class="r">' + rubS(B.net[ci]) + '</td><td class="r">' + num(B.expTot[ci]) + '</td><td class="r" style="color:var(--mute)">' + (cur == null ? '—' : pct(cur)) + '</td><td class="r" style="color:var(--mute)">' + (n == null ? '—' : pct(n)) + '</td>' +
        '<td class="r">' + (d == null ? '' : '<span class="badge" style="background:' + t.bg + ';color:' + t.fg + '">' + pp(d) + '</span>') + '</td>' +
        '<td class="r">' + num(B.exp.storage[ci]) + '</td><td class="r">' + rubS(B.comp[ci]) + '</td><td class="r" style="font-weight:600">' + rubS(B.pay[ci]) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="top"><h2>Кабинеты · ' + wlabel(weeks[ci]) + '</h2><div class="n">Клик по кабинету ставит фильтр · хранение входит в расходы, компенсации показаны отдельно</div></div>' +
      '<div class="scroll"><table style="min-width:880px;font-size:14px"><thead><tr><th class="lft" style="padding:8px 10px">Кабинет</th><th class="r">Чистые продажи<small>₽</small></th><th class="r">Расходы<small>₽</small></th><th class="r">% от продаж</th><th class="r">Норма<small>4 нед.</small></th><th class="r">Δ к норме</th><th class="r">Хранение<small>₽</small></th><th class="r">Компенсации<small>₽</small></th><th class="r">К выплате<small>₽</small></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------- SKU price review ---------- */
  function skuList(B) {
    ensureFlat(); var set = toSet(B.accs), ci = B.ci, w = weeks[ci], out = [];
    var prev = idxs(ci - 4, ci - 1).map(function (i) { return weeks[i]; });
    (flat[w] || []).forEach(function (o) {
      if (!inScope(o, set, state.cat)) return;
      var wk = by[o.acc + '|' + o.sku];
      var ps = prev.map(function (pw) { var q = wk[pw]; return q && q.net > 0 ? -q.total / q.net * 100 : null; }).filter(function (v) { return v != null; });
      var n = avg(ps), cur = o.net > 0 ? -o.total / o.net * 100 : null, d = (cur != null && n != null) ? cur - n : null;
      var units = o.qs - o.qr, price = o.qs > 0 ? o.sa / o.qs : null;
      var np = null;
      if (d != null && price != null && cur < 100) np = Math.ceil(price * (1 - n / 100) / (1 - cur / 100) / 10) * 10;
      out.push({ o: o, wk: wk, n: n, cur: cur, d: d, units: units, price: price, np: np, over: d == null ? 0 : d / 100 * o.net, exp: -o.total });
    });
    return out;
  }
  function skuBlock(B) {
    var oaccs = ozonOnly(B.accs);
    if (!oaccs.length) return '<div class="card"><div class="top"><h2>Кандидаты на пересмотр цены</h2></div><div class="sub">Доступно только для кабинетов Ozon — в выборке их нет.</div></div>';
    if (!skuReady(oaccs)) return '<div class="card"><div class="top"><h2>Кандидаты на пересмотр цены</h2></div><div class="sub">Загружаются данные по SKU: ' + oaccs.filter(function (a) { return !loaded[a]; }).map(accName).join(', ') + '</div></div>';
    var all = skuList({ accs: oaccs, ci: B.ci }), cand = all.filter(function (x) { return x.d != null && x.d > 1 && x.np != null; });
    cand.sort(function (a, b) { return b.over - a.over; });
    var shown = state.showAll ? cand : cand.slice(0, 10), multi = oaccs.length > 1;
    var body = shown.map(function (x) {
      var o = x.o, key = o.acc + '|' + o.sku, open = state.skuOpen === key;
      var name = o.art || o.sku;
      var main = '<tr style="border-top:1px solid var(--line2)"><td class="lft" style="padding:4px 10px"><button type="button" class="tgl" data-act="sku" data-k="' + esc(key) + '" style="font-weight:700;min-height:44px;padding:8px 0"><span class="m">' + (open ? '▾' : '▸') + '</span>' + esc(name) +
        (o.art ? ' <span style="font-weight:400;color:var(--mute2);font-size:12px">' + esc(o.sku) + '</span>' : '') + (multi ? ' <span class="tag" style="background:var(--soft);color:var(--mute)">' + esc(accName(o.acc)) + '</span>' : '') + '</button></td>' +
        '<td class="r" style="padding:10px">' + num(x.units) + '</td><td class="r" style="padding:10px">' + pct(x.n) + ' → ' + pct(x.cur) + '</td>' +
        '<td class="r" style="padding:10px;font-weight:600;color:var(--bad)">+' + num(x.over) + '</td><td class="r" style="padding:10px">' + num(x.price) + ' ₽</td><td class="r" style="padding:10px;font-weight:600">' + num(x.np) + ' ₽</td>' +
        '<td class="r" style="padding:8px 10px"><span style="display:inline-block;padding:3px 8px;border-radius:6px;background:var(--chip);color:var(--accent-ink);font-weight:600">+' + ((x.np / x.price - 1) * 100).toFixed(1).replace('.', ',') + '%</span></td></tr>';
      return main + (open ? '<tr><td colspan="7" style="padding:0">' + skuDetail(x, B) + '</td></tr>' : '');
    }).join('');
    var allLink = (cand.length > 10 && !state.showAll) ? ' · <button type="button" class="lnk" data-act="showall">показать все ' + cand.length + '</button>' : (state.showAll ? ' · <button type="button" class="lnk" data-act="showtop">только топ-10</button>' : '');
    return '<div class="card"><div class="top"><h2>Кандидаты на пересмотр цены</h2><div class="n">' + (state.showAll ? 'Все' : 'Топ-10') + ' по переплате · расходы Ozon выросли больше чем на 1 п.п. к норме · клик по SKU раскрывает разбор' + allLink + (oaccs.length < B.accs.length ? ' · только по кабинетам Ozon в выборке' : '') + '</div></div>' +
      '<div class="scroll"><table style="min-width:960px;font-size:14px"><thead><tr style="color:var(--mute)"><th class="lft" style="padding:8px 10px">SKU</th><th class="r" style="padding:8px 10px">Доставлено, шт</th><th class="r" style="padding:8px 10px">Расходы Ozon<small>норма → ' + wlabel(weeks[B.ci]) + '</small></th><th class="r" style="padding:8px 10px">Переплата, ₽<small>за неделю</small></th><th class="r" style="padding:8px 10px">Цена сейчас</th><th class="r" style="padding:8px 10px">Цена для нормы</th><th class="r" style="padding:8px 10px">Изменение</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="7" class="lft" style="padding:18px 10px;color:var(--mute)">На этой неделе нет SKU с ростом расходов больше 1 п.п. к норме.</td></tr>') + '</tbody></table></div></div>';
  }
  function skuDetail(x, B) {
    var o = x.o, ci = B.ci, prev = idxs(ci - 4, ci - 1).map(function (i) { return weeks[i]; });
    var arts = ART.map(function (a) {
      var dir = -o.raw[a.d], al = -o.raw[a.a], tot = dir + al;
      var ps = prev.map(function (pw) { var q = x.wk[pw]; return q && q.net > 0 ? -(q.raw[a.d] + q.raw[a.a]) / q.net * 100 : null; }).filter(function (v) { return v != null; });
      var n = avg(ps), c = o.net > 0 ? tot / o.net * 100 : null, d = (c != null && n != null) ? c - n : null;
      var share = Math.abs(tot) > 0.004 ? Math.abs(al) / (Math.abs(dir) + Math.abs(al)) : 0;
      var kind = share < 0.005 ? 'точная' : (share > 0.995 ? 'расчёт' : (share > 0.5 ? 'в основном расчёт' : 'точная + расчёт'));
      return { n: a.n, tot: tot, n0: n, c: c, d: d, t: tones(d == null ? 0 : d), kind: kind, exact: kind === 'точная' };
    });
    if (Math.abs(o.unm) > 0.004) arts.push({ n: 'Не классифицировано', tot: -o.unm, n0: null, c: o.net > 0 ? -o.unm / o.net * 100 : null, d: null, t: tones(0), kind: 'расчёт', exact: false });
    var trows = arts.map(function (z) {
      return '<tr style="border-top:1px solid var(--line);text-align:right"><td class="lft" style="padding:6px 6px 6px 0">' + z.n + ' <span class="tag" style="background:' + (z.exact ? 'var(--chip)' : 'var(--soft)') + ';color:' + (z.exact ? 'var(--accent-ink)' : 'var(--mute)') + '">' + z.kind + '</span></td>' +
        '<td style="padding:6px;color:var(--mute)">' + (z.n0 == null ? '—' : pct(z.n0)) + '</td><td style="padding:6px">' + (z.c == null ? '—' : pct(z.c)) + '</td>' +
        '<td style="padding:3px 6px">' + (z.d == null ? '' : '<span class="badge" style="min-width:0;padding:2px 6px;border-radius:5px;background:' + z.t.bg + ';color:' + z.t.fg + '">' + pp(z.d) + '</span>') + '</td>' +
        '<td style="padding:6px 0 6px 6px">' + (x.units > 0 ? num(z.tot / x.units) + ' ₽' : '—') + '</td></tr>';
    }).join('');
    var ix = idxs(ci - 7, ci);
    var vals = ix.map(function (i) { var q = x.wk[weeks[i]]; return q && q.net > 0 ? -q.total / q.net * 100 : null; });
    var mx = Math.max.apply(null, vals.map(function (v) { return v == null ? 0 : v; }).concat([1]));
    var bars = vals.map(function (v, k) { return '<div><span>' + (v == null ? '—' : pct(v)) + '</span><b style="height:' + (v == null ? 2 : Math.max(2, Math.round(Math.max(v, 0) / mx * 56))) + 'px;background:' + (ix[k] === ci ? 'var(--bad)' : 'var(--bar)') + '"></b></div>'; }).join('');
    var wl = ix.map(function (i) { return '<div>' + wlabel(weeks[i]) + '</div>'; }).join('');
    var e0 = x.n / 100, e1 = x.cur / 100, p = x.price;
    var calc = [
      ['Цена сейчас', num(p) + ' ₽'], ['Расходы Ozon на 1 шт, норма', num(e0 * p) + ' ₽'], ['Расходы Ozon на 1 шт, ' + wlabel(weeks[ci]), num(e1 * p) + ' ₽'],
      ['Цена, чтобы остаток с 1 шт не упал', num(x.np) + ' ₽'], ['Недобор за неделю при текущей цене', num(x.over) + ' ₽'],
      ['Хранение за неделю (отдельно, входит в расходы)', num(-(o.dS + o.aS)) + ' ₽'], ['Компенсации за неделю (отдельно)', rubS(o.comp) + ' ₽']
    ].map(function (r) { return '<div class="kv2"><span style="color:var(--body)">' + r[0] + '</span><span style="font-weight:600;white-space:nowrap">' + r[1] + '</span></div>'; }).join('');
    return '<div class="detail"><div><h3>Что выросло · % от чистых продаж SKU</h3><table><thead><tr style="color:var(--mute);font-size:11.5px;text-align:right"><th class="lft" style="padding:4px 6px 4px 0">Статья</th><th style="padding:4px 6px">Норма</th><th style="padding:4px 6px">' + wlabel(weeks[ci]) + '</th><th style="padding:4px 6px">Δ</th><th style="padding:4px 0 4px 6px">₽ на 1 шт</th></tr></thead><tbody>' + trows + '</tbody></table>' +
      '<div class="note">Прямые расходы привязаны к SKU. Расходы без SKU делятся по доле чистых продаж этого SKU за неделю — это оценка, финально в месячном отчёте.</div></div>' +
      '<div><h3>Расходы Ozon, % от чистых продаж · 8 недель</h3><div class="bars">' + bars + '</div><div class="bw">' + wl + '</div></div>' +
      '<div><h3>Цена</h3>' + calc + '</div></div>';
  }

  /* ---------- reconciliation ---------- */
  function reconBlock(B) {
    var ci = B.ci, w = weeks[ci], accs = ozonOnly(B.accs);
    if (!accs.length) return '<div class="card"><div class="top"><h2>Сверка итогов с v2</h2></div><div class="sub">Доступно только для кабинетов Ozon — в выборке их нет.</div></div>';
    if (!skuReady(accs)) return '<div class="card"><div class="top"><h2>Сверка итогов с v2</h2></div><div class="sub">Ждём данные по SKU для кабинетов: ' + accs.filter(function (a) { return !loaded[a]; }).map(accName).join(', ') + '</div></div>';
    var Bg = build(accs, 'ALL', false);
    ensureFlat(); var set = toSet(accs), sk = { net: 0, exp: 0, sto: 0, comp: 0, rows: 0 };
    (flat[w] || []).forEach(function (o) { if (set[o.acc]) { sk.net += o.net; sk.exp += -o.total; sk.sto += -(o.dS + o.aS); sk.comp += o.comp; sk.rows++; } });
    var lines = [
      ['Чистые продажи', Bg.net[ci], sk.net], ['Расходы Ozon (с хранением)', Bg.expTot[ci], sk.exp], ['в т.ч. хранение', Bg.exp.storage[ci], sk.sto], ['Компенсации', Bg.comp[ci], sk.comp],
      ['К выплате', Bg.net[ci] - Bg.expTot[ci] + Bg.comp[ci], sk.net - sk.exp + sk.comp]
    ];
    var allOk = true;
    var rows = lines.map(function (l) {
      var diff = l[1] - l[2], ok = Math.abs(diff) < 2; if (!ok) allOk = false;
      return '<tr class="rec" style="border-top:1px solid var(--line2)"><td class="lft">' + l[0] + '</td><td class="r">' + rubS(l[1]) + '</td><td class="r">' + rubS(l[2]) + '</td><td class="r">' + (Math.abs(diff) < 0.005 ? '0' : sgn(diff) + Math.abs(diff).toFixed(2).replace('.', ',')) + '</td><td class="r"><span class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? 'сходится' : 'расхождение') + '</span></td></tr>';
    }).join('');
    return '<div class="card"><div class="top"><h2>Сверка итогов с v2 · ' + wlabel(w) + '</h2><div class="n">Отчёт по статьям (weekly_ozon_expense_group_v2) против суммы по SKU (weekly_ozon_expense_sku_v2) за выбранную неделю и кабинеты, без фильтра категории. Допуск 2 ₽ на округление' + (accs.length < B.accs.length ? ' · только по кабинетам Ozon в выборке, для WB сверка по SKU пока недоступна' : '') + '.</div></div>' +
      '<div class="scroll"><table style="min-width:640px;font-size:14px"><thead><tr><th class="lft">Показатель</th><th class="r">По статьям, ₽</th><th class="r">По SKU, ₽</th><th class="r">Разница, ₽</th><th class="r">Итог</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="sub">' + (allOk ? 'Все итоги недели сходятся.' : 'Есть расхождение: расходы без SKU не распределяются, если у кабинета нет положительных чистых продаж по SKU за неделю.') + ' Строк SKU: ' + sk.rows + '.' +
      (accs.indexOf('ozon_orange_ipch') >= 0 ? ' IPCH: расхождение выплаты Ozon ведётся отдельной сверкой и не меняет начисления в отчёте.' : '') + '</div></div>';
  }

  function statusChips() {
    var items = [['group', 'Статьи'], ['types', 'Типы начислений'], ['cats', 'Категории']].map(function (p) { return [status[p[0]], p[1]]; });
    ACCOUNTS.filter(function (a) { return isOzon(a.id); }).forEach(function (a) { items.push([status['sku:' + a.id], 'SKU · ' + a.name.split(' · ').pop()]); });
    return '<div class="status">' + items.map(function (it) {
      var s = it[0], wait = (s === 'wait' || s == null);
      return '<span class="' + (s === 'ok' ? 'ok' : (wait ? '' : 'err')) + '" title="' + esc(s === 'ok' || wait ? '' : s) + '">' + esc(it[1]) + (s === 'ok' ? ' ✓' : (wait ? ' …' : ' ✕')) + '</span>';
    }).join('') + '</div>';
  }

  function filtersHtml() {
    var ci = weekIdx(), nb = '';
    var wsel = weeks.slice().reverse().map(function (w) { return '<option value="' + w + '"' + (w === state.week ? ' selected' : '') + '>' + wlabel(w) + ' · ' + range(w) + (weeks.indexOf(w) >= weeks.length - 2 ? ' · предв.' : '') + '</option>'; }).join('');
    var orgOpts = ORGS.map(function (o) { return '<option value="' + o + '"' + (state.org === o ? ' selected' : '') + '>' + o + '</option>'; }).join('');
    var allOrgAccs = ACCOUNTS.filter(function (a) { return a.org === state.org; });
    var accList = orgAccs();
    var accOpts = '<option value="ALL"' + (state.acc === 'ALL' ? ' selected' : '') + '>Все</option>' +
      accList.map(function (a) { return '<option value="' + a.id + '"' + (state.acc === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('');
    var mpOpts = '<option value="ALL"' + (state.market === 'ALL' ? ' selected' : '') + '>Все</option>' +
      MARKETS.map(function (m) { return '<option value="' + m + '"' + (state.market === m ? ' selected' : '') + '>' + (MARKET_LABELS[m] || m) + '</option>'; }).join('');
    var showAccFilter = allOrgAccs.length > 1;
    var showMpFilter = MARKETS.length > 1;
    var catNames = {};
    if (skuReady(ACCOUNTS.map(function (a) { return a.id; }))) { ensureFlat(); var st = toSet(scopeAccs()); (flat[state.week] || []).forEach(function (o) { if (st[o.acc]) catNames[o.cat] = (catNames[o.cat] || 0) + Math.max(0, o.net); }); }
    if (state.cat !== 'ALL') catNames[state.cat] = catNames[state.cat] || 0;
    var catList = Object.keys(catNames).sort(function (a, b) { return catNames[b] - catNames[a]; });
    var catOpts = '<option value="ALL">Все</option>' + catList.map(function (c) { return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    return '<div class="filters">' +
      '<label class="filter' + '' + '">Организация<select id="f-org">' + orgOpts + '</select></label>' +
      (showMpFilter ? '<label class="filter hl">Маркетплейс<select id="f-mp">' + mpOpts + '</select></label>' : '') +
      (showAccFilter ? '<label class="filter' + '' + '">Кабинет<select id="f-acc">' + accOpts + '</select></label>' : '') +
      '<label class="filter hl">Мастер-категория<select id="f-cat">' + catOpts + '</select></label>' +
      '<div class="filter">Неделя<div class="nav"><button type="button" data-act="prev" aria-label="Предыдущая неделя"' + (ci <= 0 ? ' disabled' : '') + '>‹</button><select id="f-week" aria-label="Неделя">' + wsel + '</select><button type="button" data-act="next" aria-label="Следующая неделя"' + (ci >= weeks.length - 1 ? ' disabled' : '') + '>›</button></div></div></div>';
  }

  function render() {
    var app = document.getElementById('app'); if (!app) return;
    if (!weeks.length) {
      var msg = state.fatal;
      app.innerHTML = '<div class="notice"><div>' + (msg ? esc(msg) : 'Загружаю финансовые данные…') + '</div>' + (msg ? '<button type="button" class="more" data-act="reload">Повторить</button>' : '') + '</div>' + statusChips();
      return;
    }
    var accs = scopeAccs();
    var scopeName = accName(state.acc);
    var marketLabel = state.market === 'ALL' ? (MARKETS.length > 1 ? 'Все площадки' : (MARKET_LABELS[MARKETS[0]] || MARKETS[0])) : (MARKET_LABELS[state.market] || state.market);
    var head = '<div class="head"><div class="hl"><div class="eyebrow">Weekly · Финансы</div><h1>' + esc(scopeName) + ' · ' + esc(marketLabel) + ' · Неделя ' + isoWeek(state.week) + ' · ' + longRange(state.week) + '</h1>' +
      '<div class="sub">Все расходы по группам: комиссия, логистика, хранение, продвижение, прочее. Компенсации показаны отдельно. Норма = среднее за 4 предыдущие недели' + (weekIdx() >= 4 ? ' (' + wlabel(weeks[weekIdx() - 4]) + '–' + wlabel(weeks[weekIdx() - 1]) + ')' : '') + '</div></div>' +
      '<div class="tools"><nav class="seg" aria-label="Вид отчёта"><a href="../daily/?tenant=' + encodeURIComponent(state.org) + '">По дням</a><a class="on" aria-current="page">По неделям</a><a href="../monthly/?tenant=' + encodeURIComponent(state.org) + '">По месяцам</a></nav><button type="button" class="chip" data-act="reload">Обновить</button></div></div>';
    var h = head + filtersHtml();
    var B = build(accs, state.cat, true), alerts = [];
    var table = expenseTable(B, alerts);
    alerts.sort(function (a, b) { return b.d - a.d; });
    var ci = B.ci, pe = pctArr(B.expTot, B.net), ne = normOf(pe, ci), over = (pe[ci] != null && ne != null) ? (pe[ci] - ne) / 100 * B.net[ci] : 0;
    h += kpiBlock(B);
    h += '<div class="alerts"><div class="t">Сигналы недели: ' + (over > 0 ? 'расходы выше нормы на ' + num(over) + ' ₽' : 'расходы в пределах нормы') + '</div>' +
      (alerts.length ? alerts.slice(0, 6).map(function (a) { return '<div class="a">' + esc(a.text) + '</div>'; }).join('') : '<div class="a">Статей с ростом больше 0,5 п.п. к норме нет.</div>') + '</div>';
    h += table;
    h += categoriesBlock(B);
    h += cabinetsTable(B);
    h += skuBlock(B);
    h += payoutsBlock(B);
    h += reconBlock(B);
    h += statusChips();
    h += '<div class="foot">Источник: Ozon — weekly_ozon_expense_group_v2 / weekly_ozon_expense_sku_v2; WB — weekly_wb_expense_group_v1; Яндекс.Маркет — weekly_yandex_expense_group_v1. Для WB и Яндекс сейчас доступен верхний финансовый уровень без SKU-сверки и мастер-категорий. Данные в базе по ' + dmon(addDays(weeks[weeks.length - 1], 6)) + '. Подсветка Δ: оранжевый от +0,5 п.п., красный от +1,5 п.п.</div>';
    var fid = document.activeElement && document.activeElement.id;
    var hs = document.getElementById('weekHistScroll'); var keep = hs ? hs.scrollLeft : null; var wasInit = histInit;
    app.innerHTML = h;
    hs = document.getElementById('weekHistScroll');
    if (hs) { if (wasInit && keep != null) hs.scrollLeft = keep; else { hs.scrollLeft = 0; histInit = true; } }
    // The article and anchor-rub columns' real rendered width can end up wider than their
    // declared CSS width (table-layout:auto redistributes leftover space), so the sticky
    // offsets of the following pinned cells are measured, not hardcoded, to stay aligned.
    var etbl = document.querySelector('.expense-week-table');
    if (etbl) {
      var artCell = etbl.querySelector('.week-article'), anchorCell = etbl.querySelector('.week-rub.week-anchor');
      if (artCell && anchorCell) {
        var aw = artCell.getBoundingClientRect().width, rw = anchorCell.getBoundingClientRect().width;
        etbl.style.setProperty('--art-w', aw + 'px');
        etbl.style.setProperty('--anchor2-left', (aw + rw) + 'px');
      }
    }
    if (fid) { var el = document.getElementById(fid); if (el && el.focus) el.focus(); }
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null; if (!b) return;
    var act = b.getAttribute('data-act'), k = b.getAttribute('data-k'), ci = weekIdx();
    if (act === 'grp') state.open[k] = !state.open[k];
    else if (act === 'sku') state.skuOpen = state.skuOpen === k ? null : k;
    else if (act === 'acc') { state.acc = k; state.skuOpen = null; state.cat = 'ALL'; }
    else if (act === 'cat') { state.cat = state.cat === k ? 'ALL' : k; state.skuOpen = null; }
    else if (act === 'catclear') { state.cat = 'ALL'; }
    else if (act === 'prev' && ci > 0) { state.week = weeks[ci - 1]; state.skuOpen = null; }
    else if (act === 'next' && ci < weeks.length - 1) { state.week = weeks[ci + 1]; state.skuOpen = null; }
    else if (act === 'showall') state.showAll = true;
    else if (act === 'showtop') state.showAll = false;
    else if (act === 'reload') { state.fatal = null; loadAll(true); return; }
    render();
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'f-org') { state.org = e.target.value; state.cat = 'ALL'; state.skuOpen = null; state.acc = 'ALL'; state.market = 'ALL'; try { var u = new URL(location.href); u.searchParams.set('tenant', state.org); history.replaceState(null, '', u); } catch (x) {} loadAll(false); return; }
    else if (id === 'f-acc') { state.acc = e.target.value; state.cat = 'ALL'; state.skuOpen = null; }
    else if (id === 'f-mp') { state.market = e.target.value; state.acc = 'ALL'; state.cat = 'ALL'; state.skuOpen = null; }
    else if (id === 'f-cat') { state.cat = e.target.value; state.skuOpen = null; }
    else if (id === 'f-week') { state.week = e.target.value; state.skuOpen = null; }
    else return;
    render();
  });

  function start() {
    var t = (new URLSearchParams(location.search).get('tenant') || '').toUpperCase();
    if (ORGS.indexOf(t) >= 0) state.org = t;
    state.acc = 'ALL'; state.market = 'ALL';
    loadAll(false);
  }
  start();
})();

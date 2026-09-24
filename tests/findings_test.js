// Reproductions of the six review findings and four gaps (2026-09-25). Each must now behave correctly.
const { JSDOM } = require('jsdom'); const fs = require('fs'); const vm = require('vm');
const html = fs.readFileSync('../index.html', 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
const app = fs.readFileSync('app.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function stubL(win) { const mk = () => { const o = {}; const ch = () => o; for (const f of ['addTo','bindPopup','bindTooltip','on','setOpacity','clearLayers','addLayer','fitBounds','invalidateSize','addAttribution','remove','bringToFront']) o[f] = ch; o.removeLayer = ch; o.attributionControl = { addAttribution: ch }; return o; };
  const m = mk(); m.createPane = () => ({ style: {} }); m.getPane = () => ({ style: {}, classList: { add(){} } }); win.L = { map: () => m, tileLayer: mk, imageOverlay: mk, layerGroup: mk, canvas: mk, polyline: mk, rectangle: mk, circleMarker: mk }; }
function series(lats, vars, t0, prFor) { const times = Array.from({ length: 96 }, (_, i) => t0 + i * 3600);
  return lats.map((lat) => { const hourly = { time: times }; for (const v of vars) hourly[v] = times.map(() => /direction/.test(v) ? 240 : v === 'precipitation' ? prFor(lat) : v === 'cape' ? 2000 : 20); return { latitude: lat, hourly }; }); }
function t0Now() { const d0 = new Date(); d0.setUTCHours(0,0,0,0); return d0.getTime()/1000 - 86400; }
async function page({ fetchImpl, pre, patch } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/ssw/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {}; stubL(w);
  w.localStorage.setItem('ssw.lang', '"en"'); if (pre) pre(w);
  w.fetch = fetchImpl || (async () => { throw new TypeError('offline'); });
  w.eval((patch ? patch(app) : app) + ';window.__S = S; window.__LIVE = LIVE; window.__E = { nightMorning, nowSec, analyzeNight, detectGrid, liveState, motionSource, DG, renderLive, STRAIT, loadHome, homeTown };');
  return w;
}
const omFetch = (delayFor = () => 0, prFor = () => 0) => async (url, opt) => {
  const u = new URL(url); if (!u.hostname.includes('open-meteo')) throw new TypeError('offline');
  const lats = u.searchParams.get('latitude').split(',').map(Number), vars = u.searchParams.get('hourly').split(',');
  await sleep(delayFor(lats)); return { ok: true, status: 200, json: async () => series(lats, vars, t0Now(), prFor) }; };

(async () => {
  // HIGH 1 — a 48-hour-old forecast gives no score, no advice, no town signals
  { const w = await page({ pre: w => {
      const gl = [], tl = []; for (let a = 0.5; a <= 6.0001; a += 0.5) for (let b = 97.5; b <= 104.0001; b += 0.5) gl.push(a);
      const t0 = t0Now() - 2 * 86400;
      const mk = (lats, vars, keymap) => { const arr = series(lats, vars, t0, () => 3); const out = {}; for (const [v, k] of Object.entries(keymap)) out[k] = arr.map(o => o.hourly[v]); return { times: arr[0].hourly.time, series: out }; };
      const G = { wind_speed_10m:'ws10', wind_direction_10m:'wd10', wind_gusts_10m:'gu10', precipitation:'pr', cape:'cape', wind_speed_850hPa:'ws850', wind_direction_850hPa:'wd850', wind_speed_700hPa:'ws700', wind_direction_700hPa:'wd700' };
      const Tk = { precipitation:'pr', wind_gusts_10m:'gu', cape:'cape' };
      const raw = { model: 'ecmwf', modelId: 'ecmwf_ifs025', townId: 'ecmwf_ifs', at: Date.now() - 48 * 3600e3, g: mk(gl, Object.keys(G), G), t: mk(Array(27).fill(3), Object.keys(Tk), Tk), empty: [] };
      w.localStorage.setItem('ssw.cache3.ecmwf', JSON.stringify(raw)); } });
    await sleep(300);
    const sc = w.document.getElementById('vScore').textContent, rs = w.document.getElementById('vReason').textContent;
    ok(!/\/ 100/.test(sc) && /too old/.test(rs), 'H1 stale forecast: no score, says too old — ' + sc + ' | ' + rs.slice(0, 60));
    ok(w.document.getElementById('adv').children.length === 0 && /too old/.test(w.document.getElementById('townList').textContent), 'H1 stale forecast: no advice, no town signals'); }

  // HIGH 2 — CAPE alone cannot produce a level
  { const w = await page(); const E = w.__E, n = 96, pts = E.DG ? 168 : 168;
    const nul = () => Array.from({ length: 168 }, () => Array(n).fill(null));
    const D = { grid: { ws10: nul(), wd10: nul(), gu10: nul(), pr: nul(), cape: Array.from({ length: 168 }, () => Array(n).fill(3000)), ws850: nul(), wd850: nul(), ws700: nul(), wd700: nul() }, towns: null, times: [], idx: new Map() };
    const t0 = t0Now(); for (let i = 0; i < n; i++) { D.times.push(t0 + i * 3600); D.idx.set(t0 + i * 3600, i); }
    const M0 = E.nightMorning(E.nowSec(), 0); const A = E.analyzeNight(D, M0);
    ok(A.score === null && A.level === null && A.blocked === 'missing' && A.lacking.join() === 'steer,conv,rain', 'H2 CAPE-only: no level, lacking steer/conv/rain (' + A.score + ')'); }

  // HIGH 3 — 31% coverage with no echoes is not "Strait calm"
  { const w = await page(); const E = w.__E, DG = E.DG; const v = new Uint8Array(DG.n), cov = new Uint8Array(DG.n);
    const zoneIdx = []; for (let k = 0; k < DG.n; k++) if (DG.zone[k]) zoneIdx.push(k);
    zoneIdx.sort((a, b) => DG.lat[a] - DG.lat[b]); for (let i = 0; i < Math.ceil(zoneIdx.length * 0.31); i++) cov[zoneIdx[i]] = 1;   // only the south is seen
    const r = E.detectGrid(v, cov); const st = E.liveState(r, null);
    ok(st === 'clearPart' && r.unseen.includes('north'), 'H3 31% coverage: ' + st + ', unseen ' + r.unseen + ' (cov ' + r.covFrac.toFixed(2) + ')');
    w.__LIVE.state = st; w.__LIVE.res = r; w.__LIVE.at = Date.now(); w.__LIVE.rTs = Math.floor(Date.now() / 1000); E.renderLive();
    ok(/part that can be seen/.test(w.document.getElementById('liveBody').textContent) && /northern Strait/.test(w.document.getElementById('liveBody').textContent), 'H3 wording limited to the seen part and names the unseen part'); }

  // HIGH 4 — a delayed answer for point A must not land under point B
  { const w = await page({ fetchImpl: omFetch(lats => lats.length === 1 && lats[0] === 3.1 ? 900 : 10, lat => lat === 3.1 ? 11 : lat === 2.2 ? 22 : 0) });
    await sleep(400);
    w.document.querySelector('[data-homepick]').click(); w.document.getElementById('inLat').value = '3.1, 101.5'; w.document.getElementById('btnCoord').click();
    await sleep(50);
    w.document.querySelector('[data-homepick]').click(); w.document.getElementById('inLat').value = '2.2, 102.2'; w.document.getElementById('btnCoord').click();
    await sleep(1500);
    const hm = w.__S.D.towns.home, anyPr = hm && hm.pr.find(x => x != null);
    ok(anyPr === 22, 'H4 location race: B shows B\'s rain (got ' + anyPr + ')'); }

  // HIGH 5 — movement only from one source
  { const w = await page(); const E = w.__E;
    ok(E.motionSource({ radarShare: 0.5 }, true, true) === null, 'H5 mixed radar/satellite band: no movement');
    ok(E.motionSource({ radarShare: 0.9 }, true, true) === 'radar' && E.motionSource({ radarShare: 0.1 }, true, true) === 'hrp', 'H5 single-source bands tracked by their own source');
    ok(E.motionSource({ radarShare: 0.9 }, false, true) === null, 'H5 radar band without a usable radar picture: no movement'); }

  // MEDIUM 6 — the service worker keeps other apps' caches
  { const deleted = []; const handlers = {};
    const self = { addEventListener: (t, f) => handlers[t] = f, location: { origin: 'https://x' }, clients: { claim: async () => {} }, skipWaiting() {} };
    const caches = { keys: async () => ['suhu-data-v1', 'windaccum-v7', 'ssw-tiles', 'ssw-20260924-21', 'ssw-20260925-22'], delete: async k => { deleted.push(k); return true; } };
    vm.runInNewContext(fs.readFileSync('../sw.js', 'utf8'), { self, caches, fetch: () => {}, Response, URL, setTimeout, clearTimeout });
    let p; handlers.activate({ waitUntil: x => p = x }); await p;
    ok(deleted.sort().join() === 'ssw-20260924-21,ssw-tiles', 'M6 only old ssw- caches deleted: ' + deleted.join()); }

  // GAP — an old live reading is not shown as current
  { const w = await page(); const E = w.__E;
    Object.assign(w.__LIVE, { state: 'approach', res: { covFrac: 1, unseen: [], cluster: null }, mv: { kmh: 30, dir: 90 }, at: Date.now(), baseTs: Math.floor(Date.now() / 1000) - 2 * 3600, rTs: Math.floor(Date.now() / 1000) - 2 * 3600 });
    E.renderLive(); const t = w.document.getElementById('liveBody').textContent;
    ok(/out of date/.test(t) && !/approaching/i.test(w.document.querySelector('#live .lvstate').textContent), 'GAP live expiry: ' + t.slice(0, 70)); }

  // GAP — an old saved point forecast is not attached
  { const w = await page({ pre: w => {
      w.localStorage.setItem('ssw.home', JSON.stringify({ lat: 3.1, lon: 101.5, src: 'manual' }));
      const arr = series([3.1], ['precipitation', 'wind_gusts_10m', 'cape'], t0Now(), () => 99);
      w.localStorage.setItem('ssw.homecache.ecmwf', JSON.stringify({ lat: 3.1, lon: 101.5, model: 'ecmwf', id: 'ecmwf_ifs', at: Date.now() - 10 * 3600e3, t: { times: arr[0].hourly.time, series: { pr: [arr[0].hourly.precipitation], gu: [arr[0].hourly.wind_gusts_10m], cape: [arr[0].hourly.cape] } } })); },
      fetchImpl: omFetch(lats => lats.length === 1 ? 5000 : 0, () => 1) });
    await sleep(400);
    const hm = w.__S.D && w.__S.D.towns && w.__S.D.towns.home;
    ok(!hm || !hm.pr.includes(99), 'GAP 10-hour-old point forecast not used'); }

  // GAP — a response body that stalls is timed out
  { const w = await page({ patch: a => a.replace('const FETCH_TIMEOUT_MS = 30000;', 'const FETCH_TIMEOUT_MS = 200;'),
      fetchImpl: async (url, opt) => ({ ok: true, status: 200, json: () => new Promise((_, rej) => opt.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) }) });
    await sleep(6000);
    ok(!w.__S.loading && /timeout/.test(w.document.getElementById('banner').textContent), 'GAP stalled body times out: ' + w.document.getElementById('banner').textContent.slice(0, 80)); }

  console.log(pass, 'passed', fail, 'failed'); process.exit(fail ? 1 : 0);
})();

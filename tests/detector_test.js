const { JSDOM } = require('jsdom'); const fs = require('fs');
const app = fs.readFileSync('app.js', 'utf8');
const eng = app.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
dom.window.eval('const MYT = 8 * 3600;' + eng + ';window.E={analyzeNight,DG,DET,fillRadar,fillHrp,detectGrid,motion,liveState,lineEta,radarClass,merc,TOWNS};');
const E = dom.window.E; let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
const BB = { upperLeft: { longitude: 99.638609, latitude: 5.657912 }, lowerRight: { longitude: 108.290871, latitude: -2.967382 } };
function img(paint) { const w = 480, h = 480, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const lo = 99.638609 + (x + 0.5) / w * (108.290871 - 99.638609), la = 5.657912 - (y + 0.5) / h * (5.657912 + 2.967382); const c = paint(la, lo); if (c) { const i = (y * w + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; } }
  return { w, h, px }; }
const GREEN = [0, 163, 50], YEL = [255, 221, 0], CYAN = [0, 210, 214];
function run(paint) { const v = new Uint8Array(E.DG.n), cov = new Uint8Array(E.DG.n); E.fillRadar(v, cov, img(paint), BB); return E.detectGrid(v, cov); }
// colour classes from the live NEA palette
ok(E.radarClass(0,187,192,255) === 1 && E.radarClass(0,129,67,255) === 2 && E.radarClass(65,255,63,255) === 2 && E.radarClass(255,255,56,255) === 3 && E.radarClass(213,0,172,255) === 3 && E.radarClass(0,0,0,0) === 0, 'radar colour classes');
// 1 calm
const calm = run(() => null); ok(E.liveState(calm, null) === 'clearPart' && calm.unseen.includes('north'), 'radar alone sees only part: calm is limited to the seen part (' + E.liveState(calm, null) + ', unseen ' + calm.unseen + ')');
ok(calm.covFrac > 0.3 && calm.covFrac < 1, 'radar covers part of the Strait zone: ' + calm.covFrac.toFixed(2));
// 2 light rain only (cyan) = clear
ok(/^clear/.test(E.liveState(run((la, lo) => (lo > 100.5 && lo < 101.5 && la > 1.5 && la < 3.5) ? CYAN : null), null)), 'light rain only = calm');
// 3 N–S band moving east 0.15° in 30 min
const band = off => (la, lo) => (la > 1.6 && la < 3.8 && lo > 100.6 + off && lo < 100.8 + off) ? (lo < 100.7 + off ? YEL : GREEN) : null;
const now = run(band(0)), past = run(band(-0.15));
const c = now.cluster; console.log('band', { len: c.len.toFixed(0), wid: c.wid.toFixed(0), bearing: c.bearing.toFixed(0), km2: c.km2.toFixed(0), isLine: c.isLine });
ok(c.isLine, 'N–S band recognised as a line');
const mv = E.motion(now.cluster, past.cluster, 0.5); console.log('motion', mv);
ok(mv && Math.abs(mv.kmh - 33) < 6 && (mv.dir > 80 && mv.dir < 100), 'moves east ~33 km/h');
ok(E.liveState(now, mv) === 'approach', 'state approach');
const klang = E.TOWNS.find(t => t.id === 'klang'); const e = E.lineEta(now.cluster, mv, klang.lat, klang.lon); console.log('Klang', e);
ok(e.h > 1.5 && e.h < 3, 'Klang ETA ~2 h');
const tj = E.lineEta(now.cluster, mv, 2.0, 100.2); ok(tj.passed || tj.now, 'a place west of the band is not "ahead"');
// 4 same band not moving = line
ok(E.liveState(now, E.motion(now.cluster, now.cluster, 0.5)) === 'line', 'stationary band = line');
// 5 moving west (away) = line, not approach
ok(E.liveState(now, E.motion(run(band(-0.15)).cluster, now.cluster, 0.5)) === 'line', 'westward band is not approaching');
// 6 NW–SE band along the Strait
const nwse = run((la, lo) => { const t = (lo - 100.0) / (102.0 - 100.0); const lac = 3.8 - t * 2.0; return (lo > 100.0 && lo < 102.0 && Math.abs(la - lac) < 0.1) ? GREEN : null; });
console.log('nw-se', nwse.cluster.bearing.toFixed(0), nwse.cluster.isLine); ok(nwse.cluster.isLine, 'NW–SE band accepted');
// 7 E–W band rejected (wrong orientation)
const ew = run((la, lo) => (la > 2.4 && la < 2.6 && lo > 100.3 && lo < 102.3) ? GREEN : null); ok(!ew.cluster.isLine, 'E–W band rejected (bearing ' + ew.cluster.bearing.toFixed(0) + ')');
// 8 scattered blobs
const blobs = run((la, lo) => { for (const [a, b] of [[1.8,100.9],[2.6,101.6],[3.3,100.7],[2.1,102.3],[3.6,101.4]]) if (Math.hypot(la - a, lo - b) < 0.12) return GREEN; return null; });
ok(E.liveState(blobs, null) === 'scattered', 'separate blobs = scattered (' + E.liveState(blobs, null) + ')');
// 9 broken band with small gaps still one line
const broken = run((la, lo) => (la > 1.6 && la < 3.8 && lo > 100.6 && lo < 100.8 && Math.floor(la * 20) % 4 !== 0) ? GREEN : null);
ok(broken.cluster.isLine, 'band with ~5 km gaps still one line');
// 10 HRP fill outside radar coverage (north Strait)
const tiles = {}; for (const x of [24, 25]) { const w = 256, px = new Uint8ClampedArray(w * w * 4); for (let yy = 0; yy < w; yy++) for (let xx = 0; xx < w; xx++) { const lo = (x * 256 + xx + 0.5) / (256 * 32) * 360 - 180; const nY = Math.PI - 2 * Math.PI * (15 * 256 + yy + 0.5) / (256 * 32); const la = 180 / Math.PI * Math.atan(Math.sinh(nY)); if (lo > 98.9 && lo < 99.3 && la > 4.2 && la < 6.0) px[(yy * w + xx) * 4 + 3] = 255; } tiles[x + '/15'] = { w, h: w, px }; }
const v = new Uint8Array(E.DG.n), cov = new Uint8Array(E.DG.n); E.fillRadar(v, cov, img(() => null), BB); E.fillHrp(v, cov, tiles, 5); const hr = E.detectGrid(v, cov);
console.log('hrp', hr.covFrac.toFixed(2), hr.cluster && hr.cluster.len.toFixed(0), hr.cluster && hr.cluster.isLine);
ok(hr.covFrac > 0.95, 'radar + HRP cover the whole zone'); ok(hr.cluster && hr.cluster.isLine, 'HRP band in the north Strait detected');
// 12 a bigger unrelated storm elsewhere half an hour ago must not break the motion match
{ const pastWithBig = run((la, lo) => band(-0.15)(la, lo) || ((la > 0.5 && la < 1.3 && lo > 101.5 && lo < 102.5) ? GREEN : null));
  ok(pastWithBig.clusters.length >= 2 && Math.abs(pastWithBig.clusters[0].lon - 100.6) > 0.5, 'setup: past picture has a bigger unrelated storm first');
  ok(pastWithBig.cluster.isLine && Math.abs(pastWithBig.cluster.lon - 100.55) < 0.2, 'a line is chosen over a bigger shapeless rain area');
  const prev = pastWithBig.clusters.slice().sort((a, b) => Math.hypot(a.x - now.cluster.x, a.y - now.cluster.y) - Math.hypot(b.x - now.cluster.x, b.y - now.cluster.y))[0];
  const m2 = E.motion(now.cluster, prev, 0.5); ok(m2 && Math.abs(m2.kmh - 33) < 6, 'motion matched to the same band (' + (m2 && m2.kmh.toFixed(0)) + ' km/h)'); }
// 13 season-only / out-of-range night gives no score (engine analyzeNight)
{ const D = { grid: {}, towns: null, times: [], idx: new Map() }; for (const k of ['ws10','wd10','gu10','pr','cape','ws850','wd850','ws700','wd700']) D.grid[k] = [];
  const A = dom.window.eval('(D)=>analyzeNight(D, 1790000000)')(D); ok(A.score === null && A.level === null, 'night with no model data is not scored on the season alone'); }
// 11 no coverage = nodata
ok(E.liveState(E.detectGrid(new Uint8Array(E.DG.n), new Uint8Array(E.DG.n)), null) === 'nodata', 'no coverage = nodata');
console.log(pass, 'passed', fail, 'failed'); process.exit(fail ? 1 : 0);

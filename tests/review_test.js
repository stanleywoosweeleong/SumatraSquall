const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync('../index.html', 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
const app = fs.readFileSync('app.js', 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
function stubL(win) { const mk = () => { const o = {}; const ch = () => o; for (const f of ['addTo','bindPopup','bindTooltip','on','setOpacity','clearLayers','addLayer','fitBounds','createPane','invalidateSize','addAttribution','remove','bringToFront']) o[f] = ch; o.removeLayer = ch; o.attributionControl = { addAttribution: ch }; return o; };
  const m = mk(); m.createPane = () => ({ style: {} }); m.getPane = () => ({ style: {}, classList: { add(){} } }); win.L = { map: () => m, tileLayer: mk, imageOverlay: mk, layerGroup: mk, canvas: mk, polyline: mk, rectangle: mk, circleMarker: mk }; }
function om(url) { const u = new URL(url), lats = u.searchParams.get('latitude').split(','), vars = u.searchParams.get('hourly').split(',');
  const d0 = new Date(); d0.setUTCHours(0,0,0,0); const t0 = d0.getTime()/1000 - 86400; const times = Array.from({ length: 96 }, (_, i) => t0 + i * 3600);
  return lats.map(() => { const hourly = { time: times }; for (const v of vars) hourly[v] = times.map(() => /direction/.test(v) ? 240 : 10); return { hourly }; }); }
async function page(opts = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/ssw/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; w.Element.prototype.scrollIntoView = () => {}; stubL(w);
  w.localStorage.setItem('ssw.lang', '"en"');
  if (opts.oldCache) w.localStorage.setItem('ssw.cache.ecmwf', '{"at":1}');
  const calls = [];
  w.fetch = async (url) => { calls.push(url);
    if (url.includes('open-meteo')) { await new Promise(r => setTimeout(r, opts.omDelay || 0)); return { ok: true, status: 200, json: async () => om(url) }; }
    if (url.includes('data.gov.sg')) { const now = Math.floor(Date.now()/1000) - (opts.neaAgeMin || 0) * 60, iso = ts => new Date((ts+8*3600)*1000).toISOString().slice(0,19)+'+08:00';
      return { ok: true, status: 200, json: async () => ({ code: 0, data: { records: Array.from({length: 13}, (_, i) => ({ timestamp: iso(now - i*300), image: { url: 'https://img.test/' + i + '.png' } })), paginationToken: null } }) }; }
    throw new TypeError('Failed to fetch'); };
  w.eval(app);
  return { w, calls };
}
(async () => {
  // 1 model switch while ECMWF is still loading: GFS must end up on screen and each cache under its own model
  { const { w, calls } = await page({ omDelay: 400 });
    await new Promise(r => setTimeout(r, 50));
    w.document.querySelector('[data-model="gfs"]').click();
    await new Promise(r => setTimeout(r, 2500));
    const fresh = w.document.getElementById('fresh').textContent;
    ok(/GFS/.test(fresh), 'after switching during a load, the GFS run is shown: ' + fresh);
    const ec = JSON.parse(w.localStorage.getItem('ssw.cache3.ecmwf') || 'null'), gf = JSON.parse(w.localStorage.getItem('ssw.cache3.gfs') || 'null');
    ok(ec && ec.model === 'ecmwf' && gf && gf.model === 'gfs', 'each result cached under its own model');
    ok(calls.some(c => /models=gfs_seamless/.test(c)), 'GFS was actually requested'); }
  // 2 guide sections stay open across a data re-render; old cache schema removed
  { const { w } = await page({ oldCache: true }); await new Promise(r => setTimeout(r, 300));
    ok(w.localStorage.getItem('ssw.cache.ecmwf') === null, 'pre-v16 cache removed');
    const det = w.document.querySelectorAll('#guideBody details')[3]; det.open = true;
    w.document.querySelector('[data-night="1"]').click(); await new Promise(r => setTimeout(r, 50));
    ok(w.document.querySelectorAll('#guideBody details')[3].open, 'opened guide section survives a re-render'); 
    w.document.querySelector('[data-night="0"]').click();
    // 3 tapping an hour in the strip switches on a forecast layer when none is on
    w.document.querySelector('.scell[data-pos="10"]').click();
    ok(w.document.querySelector('[data-layer="w850"]').getAttribute('aria-pressed') === 'true', 'strip tap shows forecast layers'); }
  // 4 an old radar picture is labelled as old
  { const { w } = await page({ neaAgeMin: 95 }); await new Promise(r => setTimeout(r, 400));
    const live = w.document.getElementById('liveSrc').textContent; ok(/min old/.test(live), 'stale radar labelled: ' + live.slice(0, 120)); }
  console.log(pass, 'passed', fail, 'failed'); process.exit(fail ? 1 : 0);
})();

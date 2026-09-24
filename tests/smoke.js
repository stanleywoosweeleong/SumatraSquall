const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('../index.html', 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
const app = fs.readFileSync('app.js', 'utf8');
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

function stubL(win) {
  const mk = () => { const o = {}; const ch = () => o;
    for (const f of ['addTo','bindPopup','bindTooltip','on','setOpacity','clearLayers','addLayer','fitBounds','createPane','invalidateSize','addAttribution','remove','bringToFront']) o[f] = ch;
    o.style = {}; o.attributionControl = { addAttribution: ch }; o.removeLayer = ch; return o; };
  const m = mk(); m.createPane = () => ({ style: {} }); m.getPane = () => ({ style: {}, classList: { add(){} } });
  win.L = { map: () => m, tileLayer: mk, imageOverlay: mk, layerGroup: mk, canvas: mk, polyline: mk, rectangle: mk, circleMarker: mk };
}
function synth(url, scen) {
  const u = new URL(url);
  if (u.hostname.includes('data.gov.sg')) {
    if (global.NEA_FAIL) throw new TypeError('Failed to fetch');
    const now = Math.floor(Date.now()/1000), iso = ts => new Date((ts+8*3600)*1000).toISOString().slice(0,19)+'+08:00';
    if (u.pathname.endsWith('/weather')) return { code: 0, data: { records: [{ datetime: iso(now), item: { readings: [
      { type:'G', datetime: iso(now-120), location:{ latitude:'2.5', longitude:'101.2' } },
      { type:'C', datetime: iso(now-120), location:{ latitude:'2.4', longitude:'101.1' } },
      { type:'G', datetime: iso(now-1500), location:{ latitude:'2.2', longitude:'101.9' } },
      { type:'G', datetime: iso(now-4000), location:{ latitude:'2.2', longitude:'101.9' } } ] } }] } };
    const slot = Math.floor(now/300)*300 - 300;
    return { code: 0, data: { records: Array.from({length:16},(_,i)=>({ timestamp: iso(slot-i*300), image:{ url:'https://img.test/'+u.pathname.split('/').pop()+'/'+(slot-i*300)+'.png' } })), paginationToken: null } };
  }
  if (u.hostname.includes('jma.go.jp')) { if (global.JMA_FAIL) throw new TypeError('Failed to fetch'); const t = Math.floor(Date.now()/600000)*600 - 1800; const st = ts => new Date(ts*1000).toISOString().replace(/[-:T]/g,'').slice(0,12)+'00'; return Array.from({length:20},(_,i)=>({basetime:st(t-i*600),validtime:st(t-i*600)})); }
  const lats = u.searchParams.get('latitude').split(',').map(Number), lons = u.searchParams.get('longitude').split(',').map(Number);
  const vars = u.searchParams.get('hourly').split(',');
  const d0 = new Date(); d0.setUTCHours(0,0,0,0); const t0 = d0.getTime()/1000 - 86400;
  const times = Array.from({ length: 96 }, (_, i) => t0 + i * 3600);
  const AX = [[5.4,98.8],[4.6,99.35],[4.0,99.65],[3.0,100.65],[2.2,101.45],[1.7,102.5],[1.15,103.45]];
  const axisLon = lat => { for (let i=0;i<AX.length-1;i++){const [a,b]=[AX[i],AX[i+1]]; if (lat<=a[0]&&lat>=b[0]) return a[1]+(b[1]-a[1])*(a[0]-lat)/(a[0]-b[0]);} return lat>5.4?98.8:103.45; };
  return lats.map((lat, n) => {
    const lon = lons[n], hourly = { time: times };
    const west = lon < axisLon(lat), near = Math.abs(lon - axisLon(lat)) < 0.7;
    for (const v of vars) hourly[v] = times.map(ts => {
      const h = new Date((ts + 8*3600)*1000).getUTCHours(), predawn = h >= 0 && h <= 8;
      if (scen === 'squall') {
        if (global.NULL850 && /hPa/.test(v)) return null;
        if (v === 'wind_direction_850hPa' || v === 'wind_direction_700hPa') return 240;
        if (v === 'wind_speed_850hPa' || v === 'wind_speed_700hPa') return 32;
        if (v === 'wind_direction_10m') return (h>=0&&h<=7) ? (west ? 235 : 60) : 200;
        if (v === 'wind_speed_10m') return (h>=0&&h<=7) ? 14 : 8;
        if (v === 'cape') return 2300;
        if (v === 'precipitation') return (lons.length > 40 && near && predawn) ? 6 : (lons.length <= 40 && lon < 104 && h >= 4 && h <= 7 ? 4 : 0);
        if (v === 'wind_gusts_10m') return (lon < 104 && h >= 4 && h <= 7) ? 62 : 20;
      } else {
        if (v.startsWith('wind_direction')) return 80;
        if (v.startsWith('wind_speed')) return 18;
        if (v === 'cape') return 300;
        if (v === 'precipitation') return 0;
        if (v === 'wind_gusts_10m') return 25;
      }
      return null;
    });
    return { latitude: lat, longitude: lon, hourly };
  });
}
async function run(scen, lang, night, size) {
  const dom = new JSDOM(html, { url: 'https://example.test/ssw/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = () => {}; w.scrollTo = () => {};
  stubL(w);
  let calls = [];
  w.fetch = async (url) => { calls.push(url); const body = synth(url, scen); return { ok: true, status: 200, json: async () => body }; };
  w.localStorage.setItem('ssw.lang', JSON.stringify(lang));
  w.localStorage.setItem('ssw.size', JSON.stringify(size));
  w.localStorage.setItem('ssw.layers', JSON.stringify({ radar: true, sat: true, w850: true }));
  const errs = []; w.addEventListener('error', e => errs.push(e.message));
  w.eval(app);
  await new Promise(r => setTimeout(r, 300));
  if (night) { w.document.querySelector('[data-night="1"]').click(); await new Promise(r => setTimeout(r, 50)); }
  // toggle all layers on to exercise map code
  { const sl = w.document.getElementById('slider'); sl.value = '12'; sl.dispatchEvent(new w.Event('input'));
    const on = k => w.document.querySelector(`[data-layer="${k}"]`).getAttribute('aria-pressed') === 'true';
    ok(on('w850') && on('rain'), 'sliding with no forecast layer switches on steering wind + model rain');
    const rd = w.document.getElementById('windRead').textContent; ok(/自动打开|switched on|dihidupkan/.test(rd) && /(06:00)/.test(w.document.getElementById('slTime').textContent), 'readout says so; slider shows date + 06:00: ' + w.document.getElementById('slTime').textContent);
    ok(w.document.getElementById('segLive').querySelectorAll('button').length === 4 && w.document.getElementById('segFcst').querySelectorAll('button').length === 4, 'live and forecast groups');
    w.document.querySelector('[data-layer="w850"]').click(); w.document.querySelector('[data-layer="rain"]').click(); }
  for (const k of ['w10','rain','conv']) w.document.querySelector(`[data-layer="${k}"]`).click();
  { const wr0 = w.document.getElementById('windRead'); ok(!wr0.hidden && /MYT|:/.test(wr0.textContent) || !wr0.hidden, 'wind readout visible with surface wind on');
    w.document.querySelector('[data-layer="w850"]').click();
    const wr = w.document.getElementById('windRead').textContent;
    ok(global.NULL850 ? /No model wind|没有模型风|Tiada data angin/.test(wr) : scen === 'squall' ? /马来西亚|Malaysia/.test(wr) : /(not|不会|tidak)/.test(wr), 'steering readout explains itself: ' + wr.slice(0, 120));
    w.document.querySelector('[data-layer="w850"]').click(); }
  ok(!w.document.querySelector('[data-layer="radar"]'), 'legacy radar key dropped');
  { const lv = w.document.getElementById('liveBody').textContent; ok(lv.length > 10 && !/undefined|NaN/.test(lv), 'live panel renders: ' + lv.slice(0, 80)); }
  { const rl = w.document.querySelector('#mapwrap .rail-l'), rr = w.document.querySelector('#mapwrap .rail-r'); ok(rl && rr && rl.getAttribute('aria-hidden') === 'true', 'scroll rails present'); }
  const play = w.document.querySelector('[data-satplay]'); ok(!!play, 'satellite play button'); play && play.click();
  await new Promise(r => setTimeout(r, 800)); w.document.querySelector('[data-satplay]').click();
  const live = w.document.getElementById('liveSrc').textContent;
  ok(/MYT/.test(live), 'satellite time shown: ' + live.slice(0,80));
  ok(global.JMA_FAIL ? /估算|estimated|anggaran/.test(live) : !/估算时间|estimated times|masa anggaran/.test(live), 'guess flag honest: ' + live.slice(0,120));
  { const cell = w.document.querySelector('[data-pos="10"]'); if (cell) cell.click(); else ok(global.NULL850, 'strip only missing when the night is blocked'); }
  // marking
  const txt = [...w.document.body.children].filter(e => e.tagName !== 'SCRIPT').map(e => e.textContent).join(' ');
  ok(!errs.length, `${scen}/${lang}/${night}: runtime errors ${errs.join('|')}`);
  ok(!/undefined|NaN|\[object/.test(txt), `${scen}/${lang}/${night}: bad token in text: ` + (txt.match(/.{40}(undefined|NaN|\[object).{20}/)||[''])[0]);
  const level = w.document.getElementById('vLevel').textContent, score = w.document.getElementById('vScore').textContent;
  { const st = w.document.getElementById('strip').innerHTML, key = w.document.getElementById('stripKey');
    if (!global.NULL850) ok(key.querySelectorAll('svg.akey').length === 3 && !/▲/.test(key.textContent), 'legend shows 3 real arrows, no triangles');
    if (!global.NULL850) ok(scen === 'squall' ? /#b42318/.test(st) && !/#34495a/.test(st) : /#34495a/.test(st) && !/#b42318/.test(st), 'strip arrow kind matches the wind (' + scen + ')'); }
  ok(!w.document.querySelector('[data-mark]') && !w.document.getElementById('eta'), 'manual squall marking removed');
  ok(/红色粗线|thick red line|garis merah tebal/.test(w.document.getElementById('legend').textContent) && /不是飑线|not a squall line|bukan garis badai/.test(w.document.getElementById('legend').textContent), 'legend explains red detected line vs mid-line');
  for (const grp of w.document.querySelectorAll('.tgroup')) {
    const tags = [...grp.querySelectorAll('.town .tag')].map(t => t.classList.contains('sig') ? 1 : 0);
    ok(tags.every((v, i) => i === 0 || v <= tags[i - 1]), 'signal towns listed first in each group');
    ok(!!grp.querySelector('.gcount'), 'group shows signal count'); }
  ok(!/\b0\.\d h\b|0\.\d 小时|0\.\d jam/.test(w.document.getElementById('townList').textContent), 'sub-hour lags shown in minutes');
  { const adv = w.document.getElementById('adv').textContent;
    ok(!/00:00–10:00|0–10 时/.test(adv), 'no midnight work window in advice');
    const m = adv.match(/(\d\d):\d\d–\d\d:\d\d/);
    if (m && +m[1] < 6) ok(/比平常开工早|比开工早|before the usual start|before work starts|sebelum waktu kerja|sebelum kerja bermula/.test(adv), 'pre-dawn window is worded as before work: ' + adv.slice(0, 160));
    ok(!/tomorrow morning|明早|esok pagi/.test(adv) || night !== 0 || new Date(Date.now() + 8*3600e3).getUTCHours() >= 10, 'morning word matches the chosen night'); }
  { const adv = w.document.getElementById('adv').textContent;
    if (!global.NULL850) ok(/西海岸和内陆|west-coast and interior|pantai barat dan pedalaman/.test(adv), 'area daytime rain summary before an area is chosen: ' + adv.slice(-160));
    w.document.querySelector('[data-homepick]').click();
    ok(!w.document.getElementById('homeOvl').hidden && w.document.querySelectorAll('#homeList [data-home]').length === 27, 'area picker lists 27 towns');
    w.document.querySelector('[data-home="triang"]').click();
    const adv2 = w.document.getElementById('adv').textContent, set = w.document.getElementById('segHome').textContent;
    ok(w.document.getElementById('homeOvl').hidden && /直凉|Triang/.test(set), 'area chosen and shown in Settings');
    if (!global.NULL850) ok(/直凉|Triang/.test(adv2) && /\d\d:\d\d|06:00/.test(adv2), 'advice names the area and a time: ' + adv2.slice(0, 40));
    ok(w.localStorage.getItem('ssw.home') === '"triang"', 'area remembered');
    // typed coordinates (pasted Google Maps style into one box)
    w.document.querySelector('[data-homepick]').click();
    w.document.getElementById('inLat').value = '3.25123, 102.42366'; w.document.getElementById('inLon').value = '';
    w.document.getElementById('btnCoord').click();
    const hm = JSON.parse(w.localStorage.getItem('ssw.home'));
    ok(hm && hm.lat === 3.251 && hm.lon === 102.424 && hm.src === 'manual', 'typed coordinates saved rounded: ' + JSON.stringify(hm));
    ok(/3\.251, 102\.424/.test(w.document.getElementById('segHome').textContent), 'Settings shows the coordinates');
    await new Promise(r => setTimeout(r, 150));
    ok(calls.some(c => /latitude=3\.251&longitude=102\.424/.test(c)), 'own point requested from Open-Meteo');
    const adv3 = w.document.getElementById('adv').textContent; if (!global.NULL850) ok(/我的位置|My location|Lokasi saya/.test(adv3), 'advice uses my location: ' + adv3.slice(0, 60));
    // swapped / out-of-range coordinates are refused with a message
    w.document.querySelector('[data-homepick]').click();
    w.document.getElementById('inLat').value = '102.4'; w.document.getElementById('inLon').value = '3.2'; w.document.getElementById('btnCoord').click();
    ok(!w.document.getElementById('homeOvl').hidden && w.document.getElementById('homeMsg').textContent.length > 10, 'out-of-range point refused with a message');
    w.document.getElementById('inLat').value = 'abc'; w.document.getElementById('btnCoord').click();
    ok(w.document.getElementById('homeMsg').textContent.length > 10, 'unreadable input explained');
    // GPS: success and denial
    w.navigator.geolocation = { getCurrentPosition: (ok_, err) => err({ code: 1, message: 'denied' }) };
    w.document.getElementById('btnGps').click(); ok(/允许|allowed|membenarkan/.test(w.document.getElementById('homeMsg').textContent), 'GPS denial explained');
    w.navigator.geolocation = { getCurrentPosition: (ok_) => ok_({ coords: { latitude: 2.7297, longitude: 101.9381 } }) };
    w.document.getElementById('btnGps').click();
    const g = JSON.parse(w.localStorage.getItem('ssw.home')); ok(g.src === 'gps' && g.lat === 2.73 && w.document.getElementById('homeOvl').hidden, 'GPS location saved');
    w.document.querySelector('[data-homepick]').click(); w.document.querySelector('[data-home="triang"]').click(); }
  const reqs = calls.filter(c => c.includes('open-meteo') && (c.match(/latitude=([^&]*)/)[1].split(',').length > 1)).length;
  const om = calls.filter(c => c.includes('open-meteo'));
  ok(om.some(c => /models=ecmwf_ifs025/.test(c) && /850hPa/.test(c)) && om.some(c => /models=ecmwf_ifs&/.test(c) && !/850hPa/.test(c)), 'ECMWF grid=0.25°, towns=9 km');
  ok(calls.every(c => !/cartocdn/.test(c)), 'no CARTO');
  ok(reqs === 2, `${scen}/${lang}: expected 2 open-meteo calls, got ${reqs}`);
  ok(calls.every(c => !/met\.gov\.my|rainviewer|gibs/.test(c)), 'no MET / RainViewer / GIBS calls');
  ok(calls.some(c => c.includes('/weather-radar-images/480km')) && (global.NEA_FAIL || calls.some(c => c.includes('/weather-radar-images/240km'))), 'NEA radar requested');
  const live2 = w.document.getElementById('liveSrc').textContent;
  if (global.NEA_FAIL) ok(/Failed to fetch/.test(live2) && /proxy|代理|proksi/i.test(live2), 'NEA failure is loud + hint: ' + live2.slice(0,160));
  else { ok(/MYT/.test(live2) && !/Failed/.test(live2), 'NEA radar time shown: ' + live2.slice(0,100)); }
  ok(!calls.some(c => /api=lightning/.test(c)), 'no lightning requests');
  ok(!w.document.querySelector('[data-layer="ltg"]'), 'no lightning layer button');
  for (const i of ['0','2','1']) w.document.querySelector(`[data-strength="${i}"]`).click();
  ok(w.document.querySelector('[data-strength="1"]').getAttribute('aria-pressed') === 'true', 'strength buttons');
  w.document.querySelector('[data-fs]').click(); ok(w.document.getElementById('mapwrap').classList.contains('fs') && !w.document.getElementById('fsExit').hidden, 'full screen on');
  w.document.getElementById('fsExit').click(); ok(!w.document.getElementById('mapwrap').classList.contains('fs'), 'full screen off');
  if (!global.NEA_FAIL) ok(/MYT/.test(w.document.getElementById('mapTimes').textContent), 'on-map time badge: ' + w.document.getElementById('mapTimes').textContent);
  ok(!w.document.querySelector('[data-layer="hrp"][aria-pressed="true"]') && !w.document.querySelector('[data-layer="w850"][aria-pressed="true"]'), 'cleaner defaults (HRP, wind off)');
  const np = w.document.querySelector('[data-neaplay]'); ok(!!np, 'radar play button'); if (np) { np.click(); await new Promise(r=>setTimeout(r,700)); w.document.querySelector('[data-neaplay]').click(); }
  ok(calls.some(c => c.includes('targetTimes_fd.json')) && !calls.some(c => c.includes('targetTimes_hrp_fd.json')), 'JMA IR list requested; HRP off by default so not fetched');
  return { level, score, cls: w.document.getElementById('verdict').className, strip: w.document.querySelectorAll('.scell').length, towns: w.document.querySelectorAll('.town').length, reason: w.document.getElementById('vReason').textContent, adv: w.document.querySelectorAll('#adv li').length, w };
}
(async () => {
  global.NEA_FAIL = true; { await run('squall','zh',0,0); } global.NEA_FAIL = false;
  global.NULL850 = true; { const a = await run('squall','en',0,0); const ban = a.w.document.getElementById('banner').textContent; ok(/wind_speed_850hPa/.test(ban), 'empty 850 hPa is announced: ' + ban.slice(0,120)); ok(/Steering/.test(a.reason) && /essential/.test(a.reason) && !/\d+ \/ 100/.test(a.score), 'no level, reason names the missing steering wind: ' + a.reason.slice(0, 90)); } global.NULL850 = false;
  global.JMA_FAIL = true; { const a = await run('squall','en',0,0); console.log('JMA-fail live line ok'); } global.JMA_FAIL = false;
  for (const lang of ['zh','en','ms']) for (const night of [0,1]) {
    const a = await run('squall', lang, night, 1);
    ok(/strong|likely/.test(a.cls), `squall ${lang} n${night} level class ${a.cls} ${a.score}`);
    ok(a.strip === 19, 'strip 19 cells'); ok(a.towns === 27, 'towns 27 rows: ' + a.towns); ok(a.adv >= 3, 'advice');
    const b = await run('easterly', lang, night, 0);
    ok(/low/.test(b.cls), `easterly ${lang} level ${b.cls} ${b.score}`);
    if (night === 0) console.log(lang, '| squall:', a.level, a.score, '|', a.reason.slice(0, 140), '\n   | easterly:', b.level, b.score, '|', b.reason.slice(0, 140));
  }
  // ETA engine direct test
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const eng = app.split('/*ENGINE-START*/')[1].split('/*ENGINE-END*/')[0];
  dom.window.eval(eng + ';window.E={lagFromAxis,STRAIT,STRAIT_INNER,dirFactor,axisNearest,GPTS,levelOf};');
  const E = dom.window.E;
  // line along the axis mid-strait, moving toward NE at 10 m/s → Klang
  const st = { u: 10*Math.sin(Math.PI/4), v: 10*Math.cos(Math.PI/4), spd: 10, from: 225 };
    const lag = E.lagFromAxis(3.52, 101.91, st); console.log('Bentong lag', JSON.stringify(lag)); ok(lag && lag.h > 1, 'Bentong lag');
  ok(E.STRAIT.length > 15 && E.STRAIT.length < 80, 'strait mask size ' + E.STRAIT.length);
  ok(E.STRAIT_INNER.length >= E.STRAIT.length - 6, 'inner size ' + E.STRAIT_INNER.length);
  ok(E.dirFactor(240) === 1 && E.dirFactor(90) === 0 && Math.abs(E.dirFactor(185) - 0.5) < 1e-9, 'dirFactor');
  ok(E.levelOf(24) === 'low' && E.levelOf(25) === 'watch' && E.levelOf(65) === 'strong', 'levels');
  // Klang should be near axis-east; check axis distances of known coast points are small
  for (const [n, la, lo] of [['PortKlang',3.0,101.39],['Dumai',1.67,101.45],['TjBalai',2.97,99.8]]) { const d = E.axisNearest(la, lo).d; console.log(n, 'axis km', d.toFixed(0)); ok(d < 90, n + ' within 90 km of mid-line'); }
  // i18n parity
  const dom2 = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' }); stubL(dom2.window); dom2.window.fetch = async () => ({ ok: false, status: 503, json: async () => ({ reason: 'test' }) });
  dom2.window.Element.prototype.scrollIntoView = () => {};
  dom2.window.eval(app + ';window.__I=I18N;');
  const I = dom2.window.__I; const keys = l => Object.keys(I[l]).sort().join();
  ok(keys('zh') === keys('en') && keys('en') === keys('ms'), 'i18n top-level parity');
  for (const k of Object.keys(I.zh)) if (typeof I.zh[k] === 'object' && !Array.isArray(I.zh[k])) for (const l of ['en','ms']) ok(Object.keys(I.zh[k]).sort().join() === Object.keys(I[l][k]).sort().join(), 'nested parity ' + k + ' ' + l);
  for (const k of Object.keys(I.zh)) if (Array.isArray(I.zh[k])) for (const l of ['en','ms']) ok(I.zh[k].length === I[l][k].length, 'array len ' + k);
  // fetch failure with no cache → loud red banner
  await new Promise(r => setTimeout(r, 6500));
  const ban = dom2.window.document.getElementById('banner').textContent;
  console.log('fail banner:', ban.slice(0, 120)); ok(/503/.test(ban), 'failure banner names the HTTP status');
  // Chinese text must not contain Latin "app"
  ok(!/[\u4e00-\u9fff][^<]{0,20}\bapp\b/i.test(JSON.stringify(I.zh)), 'no "app" in Chinese copy');
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();

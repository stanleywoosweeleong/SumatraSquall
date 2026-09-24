/* Sumatra Squall Watch — service worker. CACHE must match VERSION in index.html. */
const CACHE = 'ssw-20260924-17';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(SHELL);
    for (const u of CDN) { try { await c.add(new Request(u, { mode: 'cors' })); } catch (err) {} }
  }));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function networkFirst(req, ms) {
  return new Promise(resolve => {
    let done = false;
    // only a page navigation may fall back to index.html — an icon or manifest must never receive HTML
    const fromCache = () => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
    const t = setTimeout(() => { fromCache().then(r => { if (!done && r) { done = true; resolve(r); } }); }, ms);
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      clearTimeout(t); if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(t); fromCache().then(r => { if (!done) { done = true; resolve(r || Response.error()); } }); });
  });
}
function cacheFirst(req, name) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(name).then(c => c.put(req, copy)); }
    return res;
  }));
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req, 2000)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req, CACHE)); return; }
  // map tiles are left to the browser's own HTTP cache: they arrive as opaque responses, which inflate SW storage quota
  // Open-Meteo, JMA Himawari and NEA radar: always live — the app keeps its own timestamped model cache
});

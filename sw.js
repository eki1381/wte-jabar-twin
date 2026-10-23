// Offline cache. Vendored libraries and fonts are cache-first (they never change under the same name);
// pages, scripts and data are stale-while-revalidate, so a repeat visit opens at once and refreshes in the background.
const CACHE = 'wte-twin-v2';
const IMMUTABLE = /\/assets\/(vendor|fonts)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'assets/css/style.css', 'assets/js/main.js', 'assets/js/views/ringkasan.js', 'data/provinsi.json', 'data/kabkota.json'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  // code: network first so a deploy never mixes old and new modules; cache only when offline
  if (req.mode === 'navigate' || /\.(js|css|html)$/.test(url.pathname) || url.pathname.endsWith('/')) {
    e.respondWith(caches.open(CACHE).then((c) => fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; })
      .catch(() => c.match(req, { ignoreSearch: true }).then((hit) => hit || c.match('index.html')))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: url.pathname.endsWith('/') || url.pathname.endsWith('.html') });
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});

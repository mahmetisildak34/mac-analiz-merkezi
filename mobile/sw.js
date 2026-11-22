const cachePrefix = 'mam-mobile-shell-';
const cacheName = cachePrefix + 'v1';
const shell = new Set([
  'product-hub.html', 'product-features.mjs', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'
].map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll([...shell].map(url => new Request(url, {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !shell.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request, {cache: 'no-cache'});
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch {}
        return response;
      }
      return (await cache.match(request)) ?? response;
    } catch (error) {
      const saved = await cache.match(request);
      if (saved) return saved;
      throw error;
    }
  })());
});

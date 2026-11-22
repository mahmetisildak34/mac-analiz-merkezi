'use strict';

const scope = new URL(self.registration.scope);
const cachePrefix = 'mam-offline:' + scope.pathname + ':';
const cacheName = cachePrefix + 'v1';
const fallback = new URL('pwa/offline.html', scope).href;
const appPages = new Set([scope.pathname, new URL('index.html', scope).pathname]);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add(
    new Request(fallback, { credentials: 'omit', cache: 'reload' })
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(cachePrefix) && key !== cacheName)
    .map(key => caches.delete(key)))));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !appPages.has(url.pathname)) return;

  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(cacheName);
    return await cache.match(fallback) ?? Response.error();
  }));
});

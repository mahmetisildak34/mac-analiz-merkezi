"use strict";
const VERSION = "mam-shell-v1";
const BASE = new URL("./", self.registration.scope);
const SHELL = [
  BASE.href,
  new URL("index.html", BASE).href,
  new URL("manifest.webmanifest", BASE).href,
  new URL("icons/app-icon.svg", BASE).href,
  new URL("half-goal-algorithm.js", BASE).href,
  new URL("safari2-favorites-search.js", BASE).href
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("mam-shell-") && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (url.pathname.includes("/api/") || url.searchParams.has("api")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic" && !response.headers.has("set-cookie")) {
          await cache.put(BASE.href, response.clone());
          await cache.put(new URL("index.html", BASE).href, response.clone());
        }
        return response;
      } catch (_) {
        return (await cache.match(request, {ignoreSearch:true})) ||
          (await cache.match(BASE.href)) ||
          new Response("Maç Analiz Merkezi çevrimdışı. Daha önce açılmış uygulama kabuğu kullanılabilir.", {
            status: 503, headers: {"Content-Type":"text/plain; charset=utf-8"}
          });
      }
    })());
    return;
  }

  if (SHELL.includes(request.url) || url.pathname.endsWith("/icons/app-icon.svg")) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })());
  }
});

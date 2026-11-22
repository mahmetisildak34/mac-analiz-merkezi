function installAppShell({cachePrefix,version,files,entry}){
 const cacheName=cachePrefix+version;
 const scope=self.registration.scope;
 const shell=new Set(files.map(file=>new URL(file,scope).href));
 const aliases=new Map(entry?[[scope,new URL(entry,scope).href]]:[]);
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
   const url=new URL(request.url);
   const key=aliases.get(url.href)??url.href;
   if (request.method !== 'GET' || !shell.has(key)) return;
   event.respondWith((async () => {
     const cache = await caches.open(cacheName);
     try {
       const response = await fetch(request, {cache: 'no-cache'});
       if (response.ok) {
         try { await cache.put(key, response.clone()); } catch {}
         return response;
       }
       return (await cache.match(key)) ?? response;
     } catch (error) {
       const saved = await cache.match(key);
       if (saved) return saved;
       throw error;
     }
   })());
 });
}

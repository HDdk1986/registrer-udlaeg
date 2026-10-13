const CACHE="udlaeg-henrik-v2";
const ASSETS=["./","./index.html","./styles.css?v=2","./app.js?v=2","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener("fetch",event=>{if(event.request.method==="GET")event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)))});

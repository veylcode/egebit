'use strict';

const CACHE = 'egebit-shell-2.8.0';
const ROOT = new URL('./',self.location.href);
const SHELL = new URL('./index.html',ROOT).href;
const FILES = ['index.html','style.css?v=2.8.0','features.js?v=2.8.0','app.js?v=2.8.0','pwa.js?v=2.8.0','icon.svg','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','manifest.webmanifest'].map(path=>new URL(path,ROOT).href);

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('egebit-shell-') && key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if (event.data?.type==='ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const request = event.request, url = new URL(request.url);
  if (request.method!=='GET' || url.origin!==ROOT.origin || request.headers.has('Authorization')) return;
  const navigation = request.mode==='navigate' && [ROOT.pathname,ROOT.pathname+'index.html'].includes(url.pathname);
  if (navigation) {
    event.respondWith(fetch(request).catch(()=>caches.match(SHELL)));
    return;
  }
  if (!FILES.includes(url.href)) return;
  event.respondWith(caches.match(request).then(cached=>cached || fetch(request)));
});

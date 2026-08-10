const CACHE='repro-bovine-v1-4';
const ASSETS=['./','./index.html','./styles.css','./app.js','./initial-data.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.mode==='navigate'){
    e.respondWith(fetch(r).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return resp}).catch(()=>caches.match('./index.html').then(x=>x||caches.match('./'))));
    return;
  }
  e.respondWith(fetch(r).then(resp=>{if(r.method==='GET' && resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return resp}).catch(()=>caches.match(r)));
});
self.addEventListener('push',e=>{let data={};try{data=e.data?e.data.json():{}}catch(_){data={body:e.data?e.data.text():''}};e.waitUntil(self.registration.showNotification(data.title||'Repro Bovine',{body:data.body||'Nouvelle alerte reproduction',icon:'icon-192.png',badge:'icon-192.png',tag:data.tag||'repro-bovine-push',data:{url:data.url||'./'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=e.notification.data?.url||'./';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus'in w){w.navigate(url);return w.focus()}}return clients.openWindow?clients.openWindow(url):null}))});

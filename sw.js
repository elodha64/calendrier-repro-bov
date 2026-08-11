const CACHE='repro-bovine-v1-4-3';
const ASSETS=['./','./index.html','./styles.css','./app.js','./initial-data.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  // IMPORTANT: never intercept Supabase/API/cross-origin requests or non-GET requests.
  // They must go straight to the network. Returning undefined from a service worker
  // fetch handler causes Safari's "FetchEvent.respondWith ... response is null" error.
  if(request.method!=='GET' || url.origin!==self.location.origin) return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});
        }
        return response;
      }catch(_){
        return (await caches.match('./index.html')) || (await caches.match('./')) || new Response('Repro Bovine est hors ligne.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    try{
      const response=await fetch(request);
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      }
      return response;
    }catch(_){
      return (await caches.match(request)) || new Response('',{status:504,statusText:'Offline'});
    }
  })());
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={body:event.data?event.data.text():''}}
  event.waitUntil(self.registration.showNotification(data.title||'Repro Bovine',{
    body:data.body||'Nouvelle alerte reproduction',
    icon:'icon-192.png',badge:'icon-192.png',tag:data.tag||'repro-bovine-push',
    data:{url:data.url||'./'}
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'./';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    for(const w of windows){if('focus' in w){w.navigate(url);return w.focus()}}
    return clients.openWindow?clients.openWindow(url):Promise.resolve();
  }));
});

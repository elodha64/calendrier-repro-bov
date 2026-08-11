const CACHE='repro-bovine-v1-4-4-disabled';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// v1.4.4 intentionally does not intercept fetch requests.

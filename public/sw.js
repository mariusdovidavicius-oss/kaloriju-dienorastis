// Service worker: programa atsidaro ir be interneto, rodo priminimų pranešimus.
// Duomenys (Supabase) čia neliečiami – juos tvarko programos įrašų eilė.
const CACHE = 'kd-shell-v1';

async function cacheShell() {
  const c = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await c.put('/', res);
  const assets = [...html.matchAll(/(?:src|href)="(\/(?:assets\/[^"]+|manifest\.webmanifest|icon[^"]*))"/g)].map((m) => m[1]);
  await Promise.all(assets.map((a) => c.add(a).catch(() => {})));
}

self.addEventListener('install', (e) => { e.waitUntil(cacheShell().catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin) return;
  if (r.mode === 'navigate') {
    // Pirmiausia tinklas (nauja versija), be ryšio – išsaugotas puslapis.
    e.respondWith(fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put('/', cp)); } return res; })
      .catch(() => caches.match('/')));
    return;
  }
  if (u.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest)$/.test(u.pathname)) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); } return res; })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kalorijų dienoraštis', {
    body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.tag || 'kd', renotify: true, data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});

/* Hànzì Path service worker: offline app shell + push reminders.
   Bump VERSION whenever app files change so phones pick up the new version. */
const VERSION = 'hp-2026-10-23c';
const SHELL = ['./', 'index.html', 'app.js', 'data.js', 'strokes.js', 'cloud.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png'];
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs\/|cdn\.jsdelivr\.net\/npm\/hanzi-writer@|fonts\.(googleapis|gstatic)\.com\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.test(req.url)) return; // Firebase APIs, Google sign-in: always network
  if (req.mode === 'navigate') { // network first for the page, so updates arrive; cached copy offline
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('index.html', c)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  if (same) { // app files: network first (the browser's HTTP cache keeps this cheap), cached copy offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; })
      .catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // CDN libraries (versioned URLs): cache first, refresh in the background
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') cache.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

/* push reminders (sent by the GitHub Action through Firebase Cloud Messaging) */
self.addEventListener('push', e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data && e.data.text() } }; }
  const n = p.notification || {}, d = p.data || {};
  const title = n.title || d.title || 'Hànzì Path · 汉字';
  const body = n.body || d.body || '2 minutes of Chinese?';
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: d.tag || 'hp-nudge', renotify: true,
    data: { url: d.url || (p.fcmOptions && p.fcmOptions.link) || './?quick=1' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || './?quick=1', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});

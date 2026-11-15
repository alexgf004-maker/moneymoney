// Red primero (así nunca se queda una versión vieja) y lo guardado solo sin señal.
// Firebase y otros sitios van directo a la red. También muestra las notificaciones que manda el script de Gmail.
const CACHE = 'moneymoney-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'css/styles.css', 'css/icons.css', 'manifest.webmanifest'])).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

// Notificaciones de Firebase Cloud Messaging: llegan como { notification: { title, body }, data: { ... } }
self.addEventListener('push', e => {
  let datos = {};
  try { datos = e.data ? e.data.json() : {}; } catch { datos = { notification: { body: e.data && e.data.text() } }; }
  const n = datos.notification || {};
  const d = datos.data || {};
  const titulo = n.title || d.titulo || 'MoneyMoney';
  e.waitUntil(self.registration.showNotification(titulo, {
    body: n.body || d.cuerpo || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || undefined, // el mismo tag reemplaza el aviso anterior en vez de acumular
    data: { url: d.url || './' },
  }));
});

// Al tocar la notificación: abre la app (o la trae al frente si ya está abierta)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    const abierta = ventanas.find(v => v.url.startsWith(self.registration.scope));
    return abierta ? abierta.focus() : clients.openWindow(url);
  }));
});

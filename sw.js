// Red primero (así nunca se queda una versión vieja) y lo guardado solo sin señal.
// Firebase y otros sitios van directo a la red. También muestra las notificaciones que manda el script de Gmail.
const CACHE = 'moneymoney-v7';

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', 'index.html', 'css/styles.css', 'css/icons.css', 'manifest.webmanifest', 'icons/badge-96.png'])).catch(() => {}));
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

// Notificaciones de Firebase Cloud Messaging: llegan como { notification: { title, body }, data: { tipo, tag, url } }
// Los avisos de pago son insistentes: se quedan en pantalla, vibran fuerte y traen botones. Las compras, normales.
self.addEventListener('push', e => {
  let datos = {};
  try { datos = e.data ? e.data.json() : {}; } catch { datos = { notification: { body: e.data && e.data.text() } }; }
  const n = datos.notification || {};
  const d = datos.data || {};
  const pago = d.tipo === 'pagos';
  e.waitUntil(self.registration.showNotification(n.title || d.titulo || 'MoneyMoney', {
    body: n.body || d.cuerpo || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png', // ícono de la barra de estado: figura blanca sobre fondo transparente
    tag: d.tag || undefined,
    renotify: !!d.tag, // con el mismo tema vuelve a sonar y vibrar, no se actualiza en silencio
    requireInteraction: pago, // los de pago no se van solos
    vibrate: pago ? [400, 150, 400, 150, 400, 150, 800] : [200, 100, 200],
    actions: pago ? [{ action: 'pagos', title: 'Ver pagos' }, { action: 'luego', title: 'Recordar luego' }] : [],
    image: d.imagen || undefined, // imagen grande al expandir el aviso (como en Daily-log)
    data: { url: d.url || './', tipo: d.tipo || '' },
  }));
});

// Al tocar la notificación: abre la app (o la trae al frente). "Ver pagos" abre Deudas; "Recordar luego" solo la cierra.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'luego') return;
  const datos = e.notification.data || {};
  const destino = e.action === 'pagos' || datos.tipo === 'pagos' ? '?ir=deudas' : '';
  const url = new URL((datos.url || './') + destino, self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    const abierta = ventanas.find(v => v.url.startsWith(self.registration.scope));
    if (abierta) { abierta.postMessage({ ir: destino ? 'deudas' : null }); return abierta.focus(); }
    return clients.openWindow(url);
  }));
});

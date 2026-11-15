// Genera las imágenes grandes de los avisos de pago (1024x512, como las de Daily-log) en icons/.
// Uso: node tools/gen-avisos.cjs (usa el Chromium de Playwright)
const { chromium } = require('playwright');
const DESTINO = require('path').join(__dirname, '../icons');

const AVISOS = [
  { archivo: 'aviso-pago.jpg', linea1: 'PAGA TU', linea2: 'TARJETA', boton: 'Evita intereses', fondo: 'linear-gradient(135deg,#3f3f46 0%,#232326 55%,#0c0c0d 100%)', acento: '#d4a24c', icono: 'calendario' },
  { archivo: 'aviso-hoy.jpg', linea1: 'VENCE', linea2: 'HOY', boton: 'Págala hoy', fondo: 'linear-gradient(135deg,#3f3f46 0%,#232326 55%,#0c0c0d 100%)', acento: '#f87171', icono: 'reloj' },
  { archivo: 'aviso-urgentes.jpg', linea1: 'PAGOS POR', linea2: 'VENCER', boton: 'Revisa tus pagos', fondo: 'linear-gradient(135deg,#3f3f46 0%,#232326 55%,#0c0c0d 100%)', acento: '#f87171', icono: 'lista' },
  { archivo: 'aviso-vencido.jpg', linea1: 'PAGO', linea2: 'VENCIDO', boton: 'Págalo hoy', fondo: 'linear-gradient(135deg,#ef4444 0%,#b91c1c 55%,#7f1d1d 100%)', acento: '#ffffff', icono: 'alerta' },
];

// Íconos dibujados a mano (sin emojis), en blanco sobre un círculo del color de acento
const ICONOS = {
  calendario: '<rect x="62" y="74" width="132" height="118" rx="16" fill="none" stroke="#fff" stroke-width="14"/><path d="M62 112h132M98 58v30M158 58v30" stroke="#fff" stroke-width="14" stroke-linecap="round"/><circle cx="128" cy="152" r="13" fill="#fff"/>',
  reloj: '<circle cx="128" cy="128" r="70" fill="none" stroke="#fff" stroke-width="14"/><path d="M128 88v44l30 20" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
  lista: '<path d="M70 86h20M70 128h20M70 170h20M110 86h76M110 128h76M110 170h76" stroke="#fff" stroke-width="14" stroke-linecap="round"/>',
  alerta: '<path d="M128 56 204 190H52Z" fill="none" stroke="#fff" stroke-width="14" stroke-linejoin="round"/><path d="M128 104v40" stroke="#fff" stroke-width="14" stroke-linecap="round"/><circle cx="128" cy="168" r="9" fill="#fff"/>',
};

const html = a => `<!DOCTYPE html><html><head><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1024px;height:512px;overflow:hidden}
  body{background:${a.fondo};font-family:'Plus Jakarta Sans',sans-serif;color:#fff;position:relative}
  .aro{position:absolute;right:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.06)}
  .aro2{position:absolute;left:-90px;bottom:-200px;width:460px;height:460px;border-radius:50%;border:2px solid ${a.archivo === 'aviso-vencido.jpg' ? 'rgba(255,255,255,.3)' : 'rgba(212,162,76,.45)'}}
  .contenido{position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 70px}
  .icono{width:216px;height:216px;border-radius:50%;flex:none;background:${a.acento === '#ffffff' ? 'rgba(255,255,255,.18)' : a.acento};display:grid;place-items:center;box-shadow:0 0 0 14px ${a.acento === '#ffffff' ? 'rgba(255,255,255,.1)' : a.acento + '33'}}
  .marca{font-weight:600;letter-spacing:8px;font-size:30px;opacity:.75;margin-bottom:6px}
  .titulo{font-weight:800;font-size:96px;line-height:.98;letter-spacing:-2px}
  .boton{display:inline-block;margin-top:26px;background:#fff;color:${a.archivo === 'aviso-vencido.jpg' ? '#b91c1c' : '#18181b'};border-radius:40px;padding:14px 34px;font-weight:800;font-size:34px}
</style></head><body><div class="aro"></div><div class="aro2"></div>
<div class="contenido">
  <div class="icono"><svg width="150" height="150" viewBox="0 0 256 256">${ICONOS[a.icono]}</svg></div>
  <div><div class="marca">MONEYMONEY</div><div class="titulo">${a.linea1}<br>${a.linea2}</div><div class="boton">&rarr; ${a.boton}</div></div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 512 } });
  for (const a of AVISOS) {
    await p.setContent(html(a));
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${DESTINO}/${a.archivo}`, type: 'jpeg', quality: 86 });
  }
  await b.close();
})();

// Estado de la pantalla (vista, ventana abierta, filtros) y piezas de HTML que se repiten.
// Sin emojis: los íconos son <i class="ic ic-nombre"></i> (css/icons.css).

import { hoyISO, mesDe } from './domain/fechas.js';

export const ui = {
  vista: 'inicio',
  sub: null, // subpantalla de Más: presupuesto | fijos | cuentas | reglas | conexion | respaldo | apariencia | noleidos
  deudasTab: 'tarjetas', // tarjetas | prestamo | plan
  modal: null, // { tipo, ...datos }
  mes: mesDe(hoyISO()),
  filtro: 'todos', // todos | revisar | categoría
  filtroCuenta: '',
  busqueda: '',
  presupuestoPlan: null,
  simExtra: {},
  usuario: null,
  nube: 'sin-configurar', // sin-configurar | cargando | sin-sesion | conectado
};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ic = (nombre, extra = '') => `<i class="ic ic-${nombre}"${extra ? ` ${extra}` : ''}></i>`;

export const tile = (icono, tono = '', estilo = '') => `<span class="tile ${tono}"${estilo ? ` style="${estilo}"` : ''}>${ic(icono)}</span>`;

// Monto grande con los centavos más chicos: $308<small>.84</small>
export function montoGrande(texto) {
  const i = texto.lastIndexOf('.');
  return i < 0 ? texto : `${texto.slice(0, i)}<small>${texto.slice(i)}</small>`;
}

export function aviso(texto, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${tipo === 'error' ? 'error' : ''}`;
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fuera'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export const lin = (pct, tono = '', color = '') =>
  `<div class="lin ${tono}"><span style="width:${(Math.max(0, Math.min(1, pct)) * 100).toFixed(1)}%${color ? `;background:${color}` : ''}"></span></div>`;

export function vacio(icono, titulo, texto = '', boton = '') {
  return `<div class="vacio">${ic(icono)}<b>${titulo}</b>${texto ? `<div>${texto}</div>` : ''}${boton}</div>`;
}

// Encabezado de cada pantalla
export function top({ eyebrow = '', titulo, der = '', atras = false }) {
  return `<header class="top">
    <div class="top-izq">
      ${atras ? `<button class="ib" data-accion="atras" aria-label="Volver">${ic('chevron-left')}</button>` : ''}
      <div>${eyebrow ? `<div class="top-eyebrow">${eyebrow}</div>` : ''}<h1 class="top-titulo">${titulo}</h1></div>
    </div>
    <div class="top-der">${der}</div>
  </header>`;
}

// "CASH BACK PEDIDOS YA VISA" -> "Cash Back Pedidos Ya Visa"
export const titulo = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());

export const sec = (titulo, enlace = '') => `<div class="secc"><h3>${titulo}</h3>${enlace}</div>`;

export function campo(etiqueta, control, ayuda = '') {
  // Si adentro ya hay etiquetas (opciones), el contenedor no puede ser otra <label>
  const tag = control.includes('<label') ? 'div' : 'label';
  return `<${tag} class="campo"><span>${etiqueta}</span>${control}${ayuda ? `<small>${ayuda}</small>` : ''}</${tag}>`;
}

export function entrada(nombre, valor = '', { tipo = 'text', paso, min, max, req = false, ph = '', extra = '' } = {}) {
  const modo = tipo === 'number' ? ' inputmode="decimal"' : '';
  return `<input name="${nombre}" type="${tipo}" value="${esc(valor)}"${paso ? ` step="${paso}"` : ''}${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${req ? ' required' : ''}${ph ? ` placeholder="${esc(ph)}"` : ''}${modo} ${extra}>`;
}

export function selector(nombre, opciones, valor = '', extra = '') {
  return `<select name="${nombre}" ${extra}>${opciones.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
}

// Radios mostrados como tarjetas con ícono: [[valor, texto, ícono]]
export function opciones(nombre, lista, valor, clase = '') {
  return `<div class="opciones ${clase}">${lista.map(([v, t, i]) => `<label><input type="radio" name="${nombre}" value="${esc(v)}"${v === valor ? ' checked' : ''}><span>${i ? ic(i) : ''}${esc(t)}</span></label>`).join('')}</div>`;
}

export const marca = (nombre, texto, marcado = false) =>
  `<label class="marca"><input type="checkbox" name="${nombre}"${marcado ? ' checked' : ''}><span>${texto}</span></label>`;

// ---------- Tema (claro / oscuro / automático): preferencia de este teléfono ----------
const CLAVE_TEMA = 'moneymoney:tema';

export function temaGuardado() {
  try { return localStorage.getItem(CLAVE_TEMA) || 'auto'; } catch { return 'auto'; }
}

export function aplicarTema(tema = temaGuardado()) {
  const html = document.documentElement;
  if (tema === 'auto') html.removeAttribute('data-tema');
  else html.setAttribute('data-tema', tema);
  try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* sin almacenamiento */ }
  const oscuro = tema === 'oscuro' || (tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0c0c0d' : '#f5f4f1');
}

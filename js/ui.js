// Estado de la pantalla (qué vista, qué ventana abierta, filtros) y piezas de HTML que se repiten.

import { hoyISO, mesDe } from './domain/fechas.js';

export const ui = {
  vista: 'inicio',
  modal: null, // { tipo, ...datos }
  mes: mesDe(hoyISO()),
  filtroCuenta: '',
  filtroCategoria: '',
  busqueda: '',
  soloRevisar: false,
  presupuestoPlan: null,
  simExtra: {},
  usuario: null,
  nube: 'sin-configurar', // sin-configurar | cargando | sin-sesion | conectado
};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function aviso(texto, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fuera'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export function barra(pct, nivel = '') {
  const p = Math.max(0, Math.min(1, pct));
  return `<div class="barra ${nivel}"><span style="width:${(p * 100).toFixed(1)}%"></span></div>`;
}

export const vacioMsg = (titulo, texto = '', boton = '') =>
  `<div class="vacio"><div class="vacio-titulo">${titulo}</div>${texto ? `<p>${texto}</p>` : ''}${boton}</div>`;

export function campo(etiqueta, control, ayuda = '') {
  return `<label class="campo"><span>${etiqueta}</span>${control}${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
}

export function entrada(nombre, valor = '', { tipo = 'text', paso, min, max, req = false, ph = '', extra = '' } = {}) {
  const modo = tipo === 'number' ? ` inputmode="decimal"` : '';
  return `<input name="${nombre}" type="${tipo}" value="${esc(valor)}"${paso ? ` step="${paso}"` : ''}${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''}${req ? ' required' : ''}${ph ? ` placeholder="${esc(ph)}"` : ''}${modo} ${extra}>`;
}

export function selector(nombre, opciones, valor = '', extra = '') {
  return `<select name="${nombre}" ${extra}>${opciones.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
}

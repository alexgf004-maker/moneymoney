import { ui } from '../ui.js';
import { lista } from '../store.js';
import { vistaInicio } from './inicio.js';
import { vistaMovimientos } from './movimientos.js';
import { vistaDeudas } from './deudas.js';
import { vistaMas } from './mas.js';
import { vistaModal } from './modales.js';

const VISTAS = {
  inicio: ['Inicio', '🏠', vistaInicio],
  movimientos: ['Movimientos', '🧾', vistaMovimientos],
  deudas: ['Deudas', '💳', vistaDeudas],
  mas: ['Más', '⚙️', vistaMas],
};

export function montar() {
  document.getElementById('app').innerHTML = `
    <header class="cabecera"><h1>MoneyMoney</h1><span id="estado-nube" class="tenue"></span></header>
    <main id="vista"></main>
    <nav class="nav" id="nav"></nav>
    <div id="modal"></div>`;
}

export function renderVista() {
  const vista = document.getElementById('vista');
  const [, , fn] = VISTAS[ui.vista] || VISTAS.inicio;
  vista.innerHTML = fn();
  const revisar = lista('movimientos').filter(m => m.revisar).length;
  const item = (k, [nombre, icono]) => `<button class="nav-item ${ui.vista === k ? 'activo' : ''}" data-accion="ir" data-vista="${k}">
    <span class="nav-icono">${icono}${k === 'movimientos' && revisar ? `<i class="punto">${revisar}</i>` : ''}</span><span>${nombre}</span></button>`;
  const entradas = Object.entries(VISTAS);
  document.getElementById('nav').innerHTML = `
    ${entradas.slice(0, 2).map(([k, v]) => item(k, v)).join('')}
    <button class="nav-mas" data-accion="modal" data-tipo="movimiento" aria-label="Anotar gasto">＋</button>
    ${entradas.slice(2).map(([k, v]) => item(k, v)).join('')}`;
  document.getElementById('estado-nube').textContent = { conectado: '☁️ En la nube', 'sin-sesion': 'Sin sesión', cargando: '…', 'sin-configurar': '📱 Solo en este teléfono' }[ui.nube] || '';
}

export function renderModal() {
  const cont = document.getElementById('modal');
  cont.innerHTML = vistaModal();
  document.body.classList.toggle('con-modal', !!ui.modal);
  cont.querySelector('[autofocus]')?.focus();
}

export function render() {
  renderVista();
  renderModal();
}

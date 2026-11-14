import { ui, ic } from '../ui.js';
import { lista } from '../store.js';
import { vistaInicio } from './inicio.js';
import { vistaMovimientos } from './movimientos.js';
import { vistaDeudas } from './deudas.js';
import { vistaMas } from './mas.js';
import { vistaModal } from './modales.js';

const VISTAS = {
  inicio: ['Inicio', 'inicio', vistaInicio],
  movimientos: ['Movimientos', 'movimientos', vistaMovimientos],
  deudas: ['Deudas', 'deudas', vistaDeudas],
  mas: ['Más', 'mas', vistaMas],
};

export function montar() {
  document.getElementById('app').innerHTML = `<main id="vista"></main><nav class="nav" id="nav" aria-label="Secciones"></nav><div id="modal"></div>`;
}

export function renderVista() {
  const [, , fn] = VISTAS[ui.vista] || VISTAS.inicio;
  document.getElementById('vista').innerHTML = fn();
  const revisar = lista('movimientos').some(m => m.revisar);
  const item = (k, [nombre, icono]) => `<button class="ni ${ui.vista === k ? 'on' : ''}" data-accion="ir" data-vista="${k}" ${ui.vista === k ? 'aria-current="page"' : ''}>
    ${ic(icono)}${k === 'movimientos' && revisar ? '<span class="punto"></span>' : ''}<span>${nombre}</span></button>`;
  const e = Object.entries(VISTAS);
  document.getElementById('nav').innerHTML = `${e.slice(0, 2).map(([k, v]) => item(k, v)).join('')}
    <button class="fab" data-accion="modal" data-tipo="movimiento" aria-label="Anotar movimiento">${ic('plus')}</button>
    ${e.slice(2).map(([k, v]) => item(k, v)).join('')}`;
}

export function renderModal() {
  const cont = document.getElementById('modal');
  cont.innerHTML = vistaModal();
  document.body.classList.toggle('con-modal', !!ui.modal);
  // En un movimiento nuevo el teclado se abre directo en el monto
  const monto = cont.querySelector('[data-enfocar]');
  if (monto && !monto.value) monto.focus();
}

export function render() {
  renderVista();
  renderModal();
}

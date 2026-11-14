import { ui, esc, selector, vacioMsg } from '../ui.js';
import { movs, nombreCuenta, opcionesPagoCon, opcionesDeuda } from '../consultas.js';
import { categoria, CATEGORIAS, normalizar } from '../domain/categorias.js';
import { totalGastado, totalIngresos } from '../domain/resumen.js';
import { dinero } from '../domain/dinero.js';
import { mesDe, mesAnterior, nombreMes, fechaLarga, hoyISO } from '../domain/fechas.js';

const ORIGEN = { correo: '✉️', fijo: '🔁', pdf: '📄', manual: '' };

export function vistaMovimientos() {
  const todos = movs();
  let lista = todos.filter(m => mesDe(m.fecha) === ui.mes);
  if (ui.soloRevisar) lista = todos.filter(m => m.revisar);
  if (ui.filtroCuenta) lista = lista.filter(m => m.cuentaId === ui.filtroCuenta || m.desdeId === ui.filtroCuenta);
  if (ui.filtroCategoria) lista = lista.filter(m => (m.categoriaId || 'otros') === ui.filtroCategoria);
  if (ui.busqueda) {
    const q = normalizar(ui.busqueda);
    lista = lista.filter(m => normalizar(`${m.comercio} ${m.nota || ''}`).includes(q));
  }
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));

  const porDia = new Map();
  for (const m of lista) {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
    porDia.get(m.fecha).push(m);
  }
  const esteMes = mesDe(hoyISO());
  const siguiente = ui.mes < esteMes;

  return `
    <div class="selector-mes">
      <button class="icono-boton" data-accion="mes" data-dir="-1" aria-label="Mes anterior">‹</button>
      <b>${ui.soloRevisar ? 'Por revisar' : nombreMes(ui.mes)}</b>
      <button class="icono-boton" data-accion="mes" data-dir="1" ${siguiente ? '' : 'disabled'} aria-label="Mes siguiente">›</button>
    </div>
    ${ui.soloRevisar ? '' : `<div class="dos-col totales">
      <div><div class="tenue">Gastos</div><b>${dinero(totalGastado(todos, ui.mes))}</b></div>
      <div><div class="tenue">Ingresos</div><b class="bueno">${dinero(totalIngresos(todos, ui.mes))}</b></div>
    </div>`}
    <div class="filtros">
      <input type="search" data-filtro="busqueda" placeholder="Buscar comercio…" value="${esc(ui.busqueda)}">
      ${selector('', [['', 'Todas las cuentas'], ...opcionesPagoCon(), ...opcionesDeuda().filter(o => o[0].startsWith('p'))], ui.filtroCuenta, 'data-filtro="filtroCuenta"')}
      ${selector('', [['', 'Todas las categorías'], ...CATEGORIAS.map(c => [c.id, `${c.icono} ${c.nombre}`])], ui.filtroCategoria, 'data-filtro="filtroCategoria"')}
      <label class="interruptor"><input type="checkbox" data-filtro="soloRevisar" ${ui.soloRevisar ? 'checked' : ''}> Solo por revisar</label>
    </div>
    ${lista.length ? [...porDia].map(([fecha, items]) => `
      <div class="dia-titulo">${fechaLarga(fecha)}</div>
      <div class="lista">${items.map(filaMovimiento).join('')}</div>`).join('') : vacioMsg('Sin movimientos', ui.soloRevisar ? 'Todo está revisado. 👌' : 'Toca ＋ para anotar un gasto.')}
  `;
}

export function filaMovimiento(m) {
  const c = m.tipo === 'pago' ? { icono: '💸', nombre: 'Pago', color: '#0891b2' } : categoria(m.categoriaId);
  const signo = m.tipo === 'ingreso' || m.tipo === 'reembolso' ? '+' : m.tipo === 'pago' ? '' : '-';
  const detalle = m.tipo === 'pago'
    ? `A ${nombreCuenta(m.cuentaId)}${m.desdeId ? ` desde ${nombreCuenta(m.desdeId)}` : ''}${m.extra ? ' · abono extra' : ''}`
    : `${c.nombre} · ${nombreCuenta(m.cuentaId)}`;
  return `<button class="fila ${m.revisar ? 'fila-revisar' : ''}" data-accion="modal" data-tipo="movimiento" data-id="${m.id}">
    <span class="fila-icono" style="background:${c.color}22">${c.icono}</span>
    <span class="fila-texto"><b>${esc(m.comercio || c.nombre)} ${ORIGEN[m.origen] || ''}</b><small>${m.revisar ? '🔎 ' : ''}${esc(detalle)}</small></span>
    <span class="fila-monto ${signo === '+' ? 'bueno' : ''}">${signo}${dinero(m.monto)}</span>
  </button>`;
}

export function moverMes(dir) {
  const [a, m] = ui.mes.split('-').map(Number);
  const nuevo = dir < 0 ? mesAnterior(ui.mes) : `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  if (nuevo <= mesDe(hoyISO())) ui.mes = nuevo;
}

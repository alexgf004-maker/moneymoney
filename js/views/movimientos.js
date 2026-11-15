import { ui, esc, ic, tile, top, vacio, montoGrande } from '../ui.js';
import { movs, nombreCuenta } from '../consultas.js';
import { categoria, CATEGORIAS, normalizar } from '../domain/categorias.js';
import { totalGastado, totalIngresos, porCategoria } from '../domain/resumen.js';
import { dinero } from '../domain/dinero.js';
import { mesDe, mesAnterior, nombreMes, fechaLarga, hoyISO, diasEntre } from '../domain/fechas.js';

const ORIGEN = { correo: 'Del correo', fijo: 'Pago fijo', pdf: 'Estado de cuenta' };

export function vistaMovimientos() {
  const todos = movs();
  const revisar = todos.filter(m => m.revisar);
  let lista = ui.filtro === 'revisar' ? revisar : todos.filter(m => mesDe(m.fecha) === ui.mes);
  if (ui.filtro !== 'todos' && ui.filtro !== 'revisar') lista = lista.filter(m => (m.categoriaId || 'otros') === ui.filtro && m.tipo !== 'pago' && m.tipo !== 'transferencia');
  if (ui.filtroCuenta) lista = lista.filter(m => m.cuentaId === ui.filtroCuenta || m.desdeId === ui.filtroCuenta);
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
  const gastos = totalGastado(todos, ui.mes);
  const ingresos = totalIngresos(todos, ui.mes);
  const catsMes = porCategoria(todos, ui.mes).map(c => c.categoriaId);
  const cuenta = ui.filtroCuenta ? `<button class="pildora on" data-accion="quitar-cuenta">${esc(nombreCuenta(ui.filtroCuenta))} ${ic('x')}</button>` : '';

  return `
    ${top({
      eyebrow: 'Movimientos',
      titulo: `<span style="text-transform:capitalize">${nombreMes(ui.mes)}</span>`,
      der: `<button class="ib" data-accion="mes" data-dir="-1" aria-label="Mes anterior">${ic('chevron-left')}</button>
            <button class="ib" data-accion="mes" data-dir="1" aria-label="Mes siguiente" ${ui.mes < esteMes ? '' : 'disabled'}>${ic('chevron-right')}</button>`,
    })}
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Gastos del mes</span>${ingresos ? `<span class="badge">${ic('ingreso')} Ingresos ${dinero(ingresos)}</span>` : ''}</div>
      <div class="big">${montoGrande(dinero(gastos))}</div>
      <div class="pc-div"></div>
      <div class="mini">
        <div>Balance<b>${ingresos ? dinero(ingresos - gastos, { signo: true }) : '—'}</b></div>
        <div>Movimientos<b>${todos.filter(m => mesDe(m.fecha) === ui.mes).length}</b></div>
      </div>
    </section>

    <div class="buscar">${ic('buscar')}<input type="search" data-filtro="busqueda" placeholder="Buscar comercio o nota" value="${esc(ui.busqueda)}" aria-label="Buscar"></div>
    <div class="pildoras" role="tablist">
      ${cuenta}
      <button class="pildora ${ui.filtro === 'todos' ? 'on' : ''}" data-accion="filtro" data-valor="todos">Todos</button>
      ${revisar.length ? `<button class="pildora ${ui.filtro === 'revisar' ? 'on' : ''}" data-accion="filtro" data-valor="revisar">Por revisar <span class="num">${revisar.length}</span></button>` : ''}
      ${CATEGORIAS.filter(c => catsMes.includes(c.id) || ui.filtro === c.id).map(c => `<button class="pildora ${ui.filtro === c.id ? 'on' : ''}" data-accion="filtro" data-valor="${c.id}">${ic(c.icono)} ${esc(c.nombre)}</button>`).join('')}
    </div>

    ${lista.length ? [...porDia].map(([fecha, items]) => `
      <div class="dia">${tituloDia(fecha)}</div>
      <div class="card">${items.map(filaMovimiento).join('')}</div>`).join('')
      : `<div class="card" style="margin-top:16px">${vacio('movimientos', ui.filtro === 'revisar' ? 'Todo revisado' : 'Sin movimientos', ui.filtro === 'revisar' ? 'No hay nada pendiente de confirmar.' : 'Toca el botón + para anotar uno.')}</div>`}
  `;
}

function tituloDia(fecha) {
  const n = diasEntre(fecha, hoyISO());
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Ayer';
  return fechaLarga(fecha).replace(` de ${new Date().getFullYear()}`, '');
}

export function filaMovimiento(m, efecto = null) {
  if (m.tipo === 'transferencia') {
    const signo = efecto == null ? '' : efecto > 0 ? '+' : '-';
    return `<button class="row" data-accion="modal" data-tipo="movimiento" data-id="${m.id}">
    ${tile('repetir', signo === '+' ? 'ok' : '')}
    <span class="rt"><b>${esc(m.nota || 'Dinero movido')}</b><small>${esc(nombreCuenta(m.desdeId))} → ${esc(nombreCuenta(m.cuentaId))}</small></span>
    <span class="amt ${signo === '+' ? 'ok' : ''}">${signo}${dinero(m.monto)}</span>
  </button>`;
  }
  const esPago = m.tipo === 'pago';
  const c = esPago ? { icono: 'pago', nombre: 'Pago', color: '' } : categoria(m.categoriaId);
  const signo = efecto != null ? (efecto > 0 ? '+' : '-') : m.tipo === 'ingreso' || m.tipo === 'reembolso' ? '+' : esPago ? '' : '-';
  const detalle = esPago
    ? `${m.extra ? 'Abono a capital' : 'Pago'}${m.desdeId ? ` desde ${nombreCuenta(m.desdeId)}` : ''}`
    : `${c.nombre} · ${m.cuentaId ? nombreCuenta(m.cuentaId) : m.debito ? `Débito ···${m.ultimos4}, elige la cuenta` : m.ultimos4 ? `Tarjeta ···${m.ultimos4}, agrégala en Deudas` : 'Tarjeta sin identificar'}`;
  return `<button class="row ${m.revisar ? 'revisar' : ''}" data-accion="modal" data-tipo="movimiento" data-id="${m.id}">
    ${tile(c.icono, signo === '+' ? 'ok' : '', !esPago && signo !== '+' ? `color:${c.color}` : '')}
    <span class="rt"><b>${esc(m.comercio || c.nombre)}</b><small>${esc(detalle)}${ORIGEN[m.origen] ? ` · ${ORIGEN[m.origen]}` : ''}</small></span>
    <span class="amt ${signo === '+' ? 'ok' : ''}">${signo}${dinero(m.monto)}</span>
  </button>`;
}

export function moverMes(dir) {
  const [a, m] = ui.mes.split('-').map(Number);
  const nuevo = dir < 0 ? mesAnterior(ui.mes) : `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  if (nuevo <= mesDe(hoyISO())) ui.mes = nuevo;
}

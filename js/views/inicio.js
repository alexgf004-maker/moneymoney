// Inicio · opción A "Pagos primero" (elegida el 15 nov 2026 entre 3 propuestas).
// Responde, en este orden: 1) ¿qué tengo que pagar y cuándo? 2) ¿cuánto debo y cuándo quedo libre?
// 3) ¿en qué se me va el dinero este mes? Los pendientes de configuración van en UNA sola línea.

import { ui, esc, ic, tile, lin, top, sec, montoGrande } from '../ui.js';
import { lista, ajustes } from '../store.js';
import { movs, tarjetas, prestamos, recurrentes, resumenDeudas, estadosDe, estadoDe, tarjetasDetectadas, disponibleParaGastar } from '../consultas.js';
import { totalGastado, porCategoria, gastadoMismoDia, estadoPresupuestos, proximosPagos } from '../domain/resumen.js';
import { categoria } from '../domain/categorias.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, mesDe, mesAnterior, nombreMes, fechaCorta, fechaLarga, cuandoEs, deISO, sumarMeses } from '../domain/fechas.js';
import { planActual } from './deudas.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
const diasHasta = (fecha, hoy) => Math.round((deISO(fecha) - deISO(hoy)) / 86400000);

export function botonesTop() {
  const icono = { conectado: 'nube', cargando: 'nube', 'sin-sesion': 'nube', 'sin-configurar': 'telefono' }[ui.nube] || 'telefono';
  const titulo = ui.nube === 'conectado' ? 'Guardado en la nube' : 'Guardado solo en este teléfono';
  return `<button class="ib" data-accion="ir" data-vista="mas" data-sub="conexion" aria-label="${titulo}" title="${titulo}">${ic(icono)}</button>
    <button class="ib" data-accion="ir" data-vista="mas" data-sub="apariencia" aria-label="Apariencia">${ic('luna')}</button>`;
}

export function vistaInicio() {
  const hoy = hoyISO();
  const m = movs();
  const fecha = deISO(hoy);
  const encabezado = top({ eyebrow: capital(`${DIAS[fecha.getDay()]}, ${fechaLarga(hoy).replace(/ de \d{4}$/, '')}`), titulo: ajustes().nombre ? `Hola, ${esc(ajustes().nombre)}` : 'Hola', der: botonesTop() });
  const entrar = ui.nube === 'sin-sesion' ? `<button class="aviso-fila" style="margin:0 0 14px" data-accion="entrar">${ic('nube')}<span class="rt"><b>Entra con tu cuenta de Google</b><small>Para guardar en la nube y recibir tus compras de Gmail</small></span><span class="mu">${ic('chevron-right')}</span></button>` : '';
  if (!tarjetas().length && !prestamos().length && !m.length && !lista('estados').length) return encabezado + entrar + bienvenida();

  const agenda = proximosPagos({ tarjetas: tarjetas(), prestamos: prestamos(), recurrentes: recurrentes(), movs: m, estadosDe }, hoy, 30);
  const [primero, ...resto] = agenda;
  return `${encabezado}
    ${entrar}
    ${primero ? tarjetaPago(primero, agenda, hoy) : alDia(hoy)}
    ${puedesGastar(hoy)}
    <nav class="acts" aria-label="Accesos rápidos">
      <button class="act" data-accion="modal" data-tipo="movimiento">${ic('plus')}<div>Anotar</div></button>
      <button class="act" data-accion="ir" data-vista="deudas" data-tab="tarjetas">${ic('pago')}<div>Pagar</div></button>
      <button class="act" data-accion="ir" data-vista="mas" data-sub="presupuesto">${ic('objetivo')}<div>Presupuesto</div></button>
      <button class="act" data-accion="ir" data-vista="deudas" data-tab="plan">${ic('escalera')}<div>Plan</div></button>
    </nav>
    ${pendientes(m)}
    ${loQueViene(resto, hoy)}
    ${tuDeuda(hoy)}
    ${tuMes(m, hoy)}
  `;
}

// ---------- 1. El próximo pago (tarjeta premium) ----------

function tarjetaPago(p, agenda, hoy) {
  const dias = diasHasta(p.fecha, hoy);
  const cuando = p.vencido ? 'Vencido' : dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`;
  const urgente = p.vencido || dias <= 3;
  const en30 = sumar(agenda.map(a => a.monto));
  const segundo = p.tipo === 'tarjeta'
    ? `<div>${p.minimoExacto ? 'Mínimo' : 'Mínimo aprox.'}<b>${dinero(p.minimo)}</b></div>`
    : `<div>${p.tipo === 'prestamo' ? 'Préstamo' : 'Pago fijo'}<b>${esc(p.detalle)}</b></div>`;
  return `<section class="pc">
    <div class="pc-top">
      <span class="pc-lbl">${p.vencido ? 'Pago vencido' : 'Tu próximo pago'}</span>
      <span class="badge ${urgente ? 'rojo' : ''}">${ic(urgente ? 'alerta' : 'calendario')} ${cuando}</span>
    </div>
    <div class="big">${montoGrande(dinero(p.monto))}</div>
    <div class="pc-sub">${esc(p.titulo)} · ${p.vencido ? 'venció' : 'vence'} el ${DIAS[deISO(p.fecha).getDay()]} ${fechaCorta(p.fecha)}</div>
    <div class="pc-div"></div>
    <div class="mini">${segundo}<div>Por pagar en 30 días<b>${dinero(en30)}</b></div></div>
    ${p.tipo === 'fijo' ? '' : `<button class="pc-btn" data-accion="pagar" data-id="${p.id}">${ic('pago')} Registrar pago</button>`}
  </section>`;
}

function alDia(hoy) {
  const cortes = tarjetas().map(t => ({ t, c: estadoDe(t, hoy).proximoCorte })).sort((a, b) => a.c.localeCompare(b.c));
  const siguiente = cortes[0];
  return `<section class="pc">
    <div class="pc-top"><span class="pc-lbl">Tus pagos</span><span class="badge">${ic('check')} Al día</span></div>
    <div class="big" style="font-size:30px">Nada que pagar</div>
    <div class="pc-sub">en los próximos 30 días</div>
    ${siguiente ? `<div class="pc-div"></div><div class="pc-sub">${ic('calendario')} Próximo corte: ${esc(siguiente.t.nombre)}, ${fechaCorta(siguiente.c)}</div>` : ''}
  </section>`;
}

// ---------- ¿Cuánto puedo gastar? (opción 2 "Tarjeta bajo el pago", elegida el 15 nov 2026) ----------

function puedesGastar(hoy) {
  const g = disponibleParaGastar(hoy);
  if (!g) {
    return `<button class="aviso-fila" data-accion="ir" data-vista="mas" data-sub="cuentas">${ic('cartera')}<span class="rt"><b>¿Cuánto puedes gastar?</b><small style="white-space:normal">Pon cuánto tienes en tus cuentas y en efectivo y te lo calculo hasta tu próximo salario.</small></span><span class="mu">${ic('chevron-right')}</span></button>`;
  }
  const dia = Number(g.hasta.slice(8));
  const hastaTxt = g.ingreso ? `el ${dia}` : 'fin de mes';
  const fila = (txt, monto, clase = '') => `<div class="caja-fila desglose-fila"><span class="mu">${txt}</span><b class="${clase}">${monto}</b></div>`;
  return `<div class="card pad gastar">
    <div class="caja-fila">
      <div><span class="mu" style="font-size:12.5px">Puedes gastar hasta ${hastaTxt}</span>
        <div class="gastar-cifra ${g.alcanza ? '' : 'bad'}">${montoGrande(dinero(g.alcanza ? g.libre : 0))}</div></div>
      <div style="text-align:right">
        ${g.alcanza ? `<span class="chip ok">${ic('check')} Te alcanza</span>` : `<span class="chip bad">${ic('alerta')} No te alcanza</span>`}
        <b class="gastar-dia">${g.alcanza ? `${dinero(g.porDia).replace(/\.\d\d$/, '')}<small> /día</small>` : `faltan ${dinero(-g.libre)}`}</b>
      </div>
    </div>
    <div class="desglose">
      ${fila(`Tienes (${g.cuentas.map(x => esc(x.c.nombre)).join(' + ')})`, dinero(g.tienes))}
      ${fila(`Pagos antes ${g.ingreso ? `del ${dia}` : 'de fin de mes'}`, `− ${dinero(g.comprometido)}`)}
      ${g.reservaSiguiente ? fila(`Reserva: lo que tu salario no cubre después del ${dia}`, `− ${dinero(g.reservaSiguiente)}`) : ''}
      <div class="caja-fila desglose-fila desglose-total"><b>Libre ${g.ingreso ? `hasta el ${dia}` : 'hasta fin de mes'}</b><b class="${g.alcanza ? 'ok' : 'bad'}">${dinero(g.libre)}</b></div>
    </div>
    ${g.pagos.length || g.siguientes.length ? `<details class="gastar-pagos"><summary>Ver qué pagos</summary>
      ${g.pagos.map(p => fila(`${fechaCorta(p.fecha)} · ${esc(p.nombre)}`, dinero(p.monto))).join('')}
      ${g.siguientes.length ? `<small class="mu" style="margin:8px 0 2px">Después del ${dia} (los cubre tu salario de ${dinero(g.ingreso?.monto || 0)}${g.reservaSiguiente ? ' y la reserva' : ''})</small>
        ${g.siguientes.map(p => fila(`${fechaCorta(p.fecha)} · ${esc(p.nombre)}`, dinero(p.monto))).join('')}` : ''}
    </details>` : ''}
    ${g.ingreso ? '' : `<button class="link" style="margin-top:6px" data-accion="ir" data-vista="mas" data-sub="fijos">${ic('plus')} Agrega tu salario para calcularlo hasta tu día de pago</button>`}
  </div>`;
}

// ---------- Pendientes de configuración: una sola línea ----------

const esDescartado = r => ['sin-tarjeta', 'sin-movimiento', 'estado-incompleto'].includes(r.resultado);

function pendientes(m) {
  const items = [];
  const detectadas = tarjetasDetectadas().length;
  const porRevisar = m.filter(x => x.revisar).length;
  const correos = lista('revision').filter(esDescartado).length;
  if (detectadas) items.push([`${detectadas} tarjeta${detectadas > 1 ? 's' : ''} encontrada${detectadas > 1 ? 's' : ''}`, 'data-accion="ir" data-vista="deudas" data-tab="tarjetas"']);
  if (porRevisar) items.push([`${porRevisar} movimiento${porRevisar > 1 ? 's' : ''} por revisar`, 'data-accion="ver-revisar"']);
  if (correos) items.push([`${correos} correo${correos > 1 ? 's' : ''} sin registrar`, 'data-accion="ir" data-vista="mas" data-sub="revisados"']);
  if (!items.length) return '';
  const total = items.length === 1 ? items[0][0] : `${items.length} pendientes`;
  return `<button class="aviso-fila" ${items[0][1]}>${ic('revisar')}<span class="rt"><b>${total}</b>${items.length > 1 ? `<small>${items.map(i => i[0]).join(' · ')}</small>` : '<small>Toca para revisarlo</small>'}</span><span class="mu">${ic('chevron-right')}</span></button>`;
}

// ---------- Lo que viene después del primer pago ----------

function loQueViene(resto, hoy) {
  const filas = resto.slice(0, 5).map(a => filaAgenda(a, hoy));
  // Tarjetas que cortan hoy o mañana y cuyo estado de cuenta todavía no llega
  for (const t of tarjetas()) {
    const e = estadoDe(t, hoy);
    const corte = e.ultimoCorte === hoy ? 'Corta hoy' : diasHasta(e.proximoCorte, hoy) === 1 ? 'Corta mañana' : null;
    if (corte && e.fuente !== 'banco') {
      filas.push(`<div class="row">${tile('calendario')}<span class="rt"><b>${esc(t.nombre)} ···${esc(t.ultimos4)}</b><small>${corte} · el estado de cuenta llega en unos días</small></span><span class="amt mu">—</span></div>`);
    }
  }
  if (!filas.length) return '';
  return `${sec('Lo que viene', `<button class="link" data-accion="ir" data-vista="deudas">Deudas</button>`)}<div class="card">${filas.join('')}</div>`;
}

export function filaAgenda(a, hoy = hoyISO()) {
  const icono = a.tipo === 'tarjeta' ? 'tarjeta' : a.tipo === 'prestamo' ? 'banco' : 'repetir';
  const dias = diasHasta(a.fecha, hoy);
  const estado = a.vencido ? '<span class="chip bad">Vencido</span>'
    : dias <= 1 ? `<span class="chip warn">${dias === 0 ? 'Hoy' : 'Mañana'}</span>`
    : dias <= 5 ? `<span class="chip">${cuandoEs(a.fecha, hoy)}</span>` : '';
  const accion = a.tipo === 'fijo' ? 'data-accion="modal" data-tipo="recurrente"' : 'data-accion="pagar"';
  return `<button class="row" ${accion} data-id="${a.id}">
    ${tile(icono, a.vencido ? 'bad' : '')}
    <span class="rt"><b>${esc(a.titulo)}</b><small>${estado}${fechaCorta(a.fecha)} · ${esc(a.detalle)}</small></span>
    <span class="amt">${dinero(a.monto)}</span>
  </button>`;
}

// ---------- 2. Tu deuda ----------

function tuDeuda(hoy) {
  const d = resumenDeudas(hoy);
  if (!d.total) return '';
  const cuotas = sumar(d.ts.map(x => x.e.enCuotas));
  const plan = planActual(hoy);
  const meses = plan?.c.avalancha.viable && plan.c.avalancha.terminado !== false ? plan.c.avalancha.meses : null;
  const partes = [`Tarjetas ${dinero(d.totalTarjetas - cuotas)}`, cuotas ? `en cuotas ${dinero(cuotas)}` : '', d.totalPrestamos ? `préstamos ${dinero(d.totalPrestamos)}` : ''].filter(Boolean);
  return `${sec('Tu deuda', `<button class="link" data-accion="ir" data-vista="deudas" data-tab="plan">Plan</button>`)}
    <button class="card pad" style="width:100%;text-align:left" data-accion="ir" data-vista="deudas">
      <span class="mu" style="font-size:12.5px">Debes en total</span>
      <div class="cifra" style="margin:2px 0 6px">${dinero(d.total)}</div>
      <small class="mu">${partes.join(' · ')}</small>
      ${meses ? `<small class="ok" style="margin-top:6px">${ic('objetivo')} Con tu plan quedas libre en ${nombreMes(sumarMeses(hoy, meses).slice(0, 7))}</small>` : ''}
    </button>`;
}

// ---------- 3. Tu mes ----------

function tuMes(m, hoy) {
  const mes = mesDe(hoy);
  const gastado = totalGastado(m, mes);
  const limites = Object.fromEntries(lista('presupuestos').map(p => [p.id, p.limite]));
  const pres = estadoPresupuestos(limites, m, mes, hoy);
  const totalPres = sumar(pres.map(p => p.limite));
  const usado = sumar(pres.map(p => p.gastado));
  const antes = gastadoMismoDia(m, mesAnterior(mes), deISO(hoy).getDate());
  const nombreAntes = nombreMes(mesAnterior(mes)).split(' ')[0];
  const cats = porCategoria(m, mes).slice(0, 4);
  const maxCat = cats[0]?.total || 1;
  const alerta = Object.fromEntries(pres.filter(p => p.nivel !== 'ok').map(p => [p.categoriaId, p]));
  const derecha = totalPres
    ? `<span class="mu" style="font-size:12.5px">Presupuesto</span><b style="display:block;font-size:15px;margin-top:6px" class="${usado > totalPres ? 'bad' : ''}">${(usado / totalPres * 100).toFixed(0)}% usado</b>`
    : antes ? `<span class="mu" style="font-size:12.5px">A esta altura de ${nombreAntes}</span><b style="display:block;font-size:15px;margin-top:6px">${dinero(antes)}</b>` : '';
  return `${sec(`Tu mes`, `<button class="link" data-accion="ir" data-vista="movimientos">Movimientos</button>`)}
    <div class="card pad">
      <div class="caja-fila"><div><span class="mu" style="font-size:12.5px">Gastado en ${nombreMes(mes).split(' ')[0]}</span><div class="cifra" style="margin:2px 0 0">${dinero(gastado)}</div></div><div style="text-align:right">${derecha}</div></div>
      ${cats.length ? cats.map(x => {
        const c = categoria(x.categoriaId);
        const a = alerta[x.categoriaId];
        return `<button class="cat" data-accion="ver-categoria" data-id="${x.categoriaId}">${ic(c.icono, `style="color:${c.color}"`)}<span><span class="cat-n">${esc(c.nombre)}${a ? ` <span class="chip ${a.nivel === 'excedido' ? 'bad' : 'warn'}">${a.nivel === 'excedido' ? 'Te pasaste' : 'Cerca del límite'}</span>` : ''}</span>${lin(x.total / maxCat, '', c.color)}</span><b>${dinero(x.total)}</b></button>`;
      }).join('') : `<small class="mu" style="margin-top:8px">Todavía no hay gastos este mes.</small>`}
      ${totalPres ? '' : `<button class="link" style="margin-top:8px" data-accion="ir" data-vista="mas" data-sub="presupuesto">${ic('objetivo')} Ponle un presupuesto a tu mes</button>`}
    </div>`;
}

// ---------- Primera vez ----------

function bienvenida() {
  return `<div class="bienv">
    <section class="pc">
      <span class="badge">${ic('escudo')} Tus datos son solo tuyos</span>
      <div class="bienv-t">Toma el control de tus tarjetas y tu préstamo</div>
      <div class="pc-sub">Registra lo que debes y la app te dice cuánto pagar, cuándo, y cómo salir de deudas más rápido.</div>
    </section>
    ${sec('Empieza aquí')}
    <div class="card">
      <button class="row" data-accion="modal" data-tipo="tarjeta">${tile('tarjeta')}<span class="rt"><b>Agrega una tarjeta</b><small>Corte, fecha de pago y saldo</small></span>${ic('chevron-right')}</button>
      <button class="row" data-accion="modal" data-tipo="prestamo">${tile('banco')}<span class="rt"><b>Agrega tu préstamo</b><small>Monto, tasa y plazo</small></span>${ic('chevron-right')}</button>
      <button class="row" data-accion="modal" data-tipo="movimiento">${tile('plus')}<span class="rt"><b>Anota un gasto</b><small>En 3 toques</small></span>${ic('chevron-right')}</button>
    </div>
    <div class="vacio"><div>¿Quieres verla funcionando primero?</div><button class="btn sec sm" data-accion="datos-ejemplo">${ic('ojo')} Ver con datos de ejemplo</button></div>
  </div>`;
}

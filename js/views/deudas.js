import { ui, esc, ic, top, vacio, montoGrande, lin, entrada } from '../ui.js';
import { ajustes } from '../store.js';
import { movs, resumenDeudas, deudasParaPlan, nombreBanco } from '../consultas.js';
import { simularAbono } from '../domain/prestamo.js';
import { compararPlanes } from '../domain/deudas.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, fechaCorta, cuandoEs, nombreMes, sumarMeses } from '../domain/fechas.js';

const TABS = [['tarjetas', 'Tarjetas'], ['prestamo', 'Préstamo'], ['plan', 'Plan']];

export function vistaDeudas() {
  const hoy = hoyISO();
  const d = resumenDeudas(hoy);
  const contado = sumar(d.ts.map(x => x.e.contadoPendiente));
  const plan = planActual(hoy);
  const libre = plan?.c.avalancha.viable && plan.c.avalancha.terminado !== false ? plan.c.avalancha.meses : null;

  return `
    ${top({ eyebrow: 'Lo que debes', titulo: 'Deudas', der: `<button class="ib" data-accion="modal" data-tipo="${ui.deudasTab === 'prestamo' ? 'prestamo' : 'tarjeta'}" aria-label="Agregar">${ic('plus')}</button>` })}
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Debes en total</span>${contado ? `<span class="badge">${ic('calendario')} Por pagar este ciclo ${dinero(contado)}</span>` : ''}</div>
      <div class="big">${montoGrande(dinero(d.total))}</div>
      <div class="pc-div"></div>
      <div class="mini"><div>Tarjetas<b>${dinero(d.totalTarjetas)}</b></div><div>Préstamos<b>${dinero(d.totalPrestamos)}</b></div></div>
      ${libre ? `<div class="pc-div"></div><div class="pc-sub">${ic('objetivo')} Con tu plan quedas libre en ${libre} meses (${nombreMes(sumarMeses(hoy, libre).slice(0, 7))})</div>` : ''}
    </section>
    <div class="seg" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="${ui.deudasTab === k ? 'on' : ''}" data-accion="tab-deudas" data-tab="${k}">${t}</button>`).join('')}</div>
    ${ui.deudasTab === 'prestamo' ? prestamosHTML(d, hoy) : ui.deudasTab === 'plan' ? planHTML(plan) : tarjetasHTML(d, hoy)}
  `;
}

function tarjetasHTML(d, hoy) {
  if (!d.ts.length) return `<div class="card">${vacio('tarjeta', 'Sin tarjetas', 'Agrega tus tarjetas para saber cuánto y cuándo pagar.', `<button class="btn sm" data-accion="modal" data-tipo="tarjeta">${ic('plus')} Agregar tarjeta</button>`)}</div>`;
  return d.ts.map(({ t, e }) => {
    let fecha;
    if (e.alDia) fecha = `<b class="ok">Pagado</b>`;
    else if (e.vencido) fecha = `<b class="bad">Venció el ${fechaCorta(e.fechaPago)}</b>`;
    else fecha = `<b class="${e.diasParaPago <= 3 ? 'warn' : ''}">${fechaCorta(e.fechaPago)} · ${cuandoEs(e.fechaPago, hoy)}</b>`;
    return `<article class="tc">
      <div class="tc-top">
        <div class="tc-n"><span class="glifo g-${esc(t.banco || 'otro')}">${ic('tarjeta')}</span><div><b>${esc(t.nombre)}</b><small>···${esc(t.ultimos4)} · ${esc(nombreBanco(t.banco))}</small></div></div>
        <button class="ib chico" data-accion="modal" data-tipo="tarjeta" data-id="${t.id}" aria-label="Editar tarjeta">${ic('editar')}</button>
      </div>
      <div class="cifra">${dinero(e.saldoActual)}</div>
      ${lin(e.uso, e.uso >= 0.9 ? 'bad' : e.uso >= 0.5 ? 'warn' : '')}
      <small class="mu">${(e.uso * 100).toFixed(0)}% de ${dinero(t.limite)} usado · disponible ${dinero(e.disponible)}</small>
      <div class="caja">
        <div class="caja-fila">
          <div><span class="mu">${e.alDia ? `Corte del ${fechaCorta(e.ultimoCorte)}` : 'Pago de contado'}</span><b>${e.alDia ? 'Al día' : dinero(e.contadoPendiente)}</b></div>
          <div><span class="mu">Fecha límite</span>${fecha}</div>
        </div>
        ${e.alDia ? '' : `<div class="nota">Mínimo aprox. ${dinero(e.minimoPendiente)}${e.interesSiMinimo > 0 ? ` · si pagas solo eso, unos <span class="bad">${dinero(e.interesSiMinimo)}</span> de intereses` : ''}</div>`}
      </div>
      <small class="mu" style="margin-top:10px">Próximo corte ${fechaCorta(e.proximoCorte)} · compras desde el corte ${dinero(e.comprasCiclo)}</small>
      <div class="tc-acc">
        <button class="btn sm" data-accion="pagar" data-id="${t.id}">${ic('pago')} Registrar pago</button>
        <button class="btn sm sec" data-accion="ver-cuenta" data-id="${t.id}">${ic('movimientos')} Movimientos</button>
      </div>
    </article>`;
  }).join('');
}

function prestamosHTML(d, hoy) {
  if (!d.ps.length) return `<div class="card">${vacio('banco', 'Sin préstamos', 'Agrega tu préstamo para ver tu avance y cuánto ahorras abonando extra.', `<button class="btn sm" data-accion="modal" data-tipo="prestamo">${ic('plus')} Agregar préstamo</button>`)}</div>`;
  return d.ps.map(({ p, e }) => {
    const extra = ui.simExtra[p.id] ?? 50;
    const sim = simularAbono(p, movs(), hoy, { extraMensual: extra });
    return `<article class="tc">
      <div class="tc-top">
        <div class="tc-n"><span class="glifo g-${esc(p.banco || 'otro')}">${ic('banco')}</span><div><b>${esc(p.nombre)}</b><small>${esc(nombreBanco(p.banco))} · ${p.tasaAnual}% anual</small></div></div>
        <button class="ib chico" data-accion="modal" data-tipo="prestamo" data-id="${p.id}" aria-label="Editar préstamo">${ic('editar')}</button>
      </div>
      <div class="cifra">${dinero(e.saldo)}</div>
      ${lin(e.avance, 'ok')}
      <small class="mu">${(e.avance * 100).toFixed(0)}% pagado · ${e.cuotasPagadas} de ${e.cuotasTotales} cuotas · termina en ${e.fechaFin ? nombreMes(e.fechaFin.slice(0, 7)) : '—'}</small>
      ${e.proxima ? `<div class="caja">
        <div class="caja-fila">
          <div><span class="mu">Próxima cuota</span><b>${dinero(e.cuota)}</b></div>
          <div><span class="mu">${e.cuotaRegistrada ? 'Este mes' : 'Fecha'}</span><b class="${e.cuotaRegistrada ? 'ok' : ''}">${e.cuotaRegistrada ? 'Registrada' : `${fechaCorta(e.proxima.fecha)} · ${cuandoEs(e.proxima.fecha, hoy)}`}</b></div>
        </div>
        <div class="nota">${dinero(e.proxima.capital)} a capital · ${dinero(e.proxima.interes)} de intereses${e.cargos ? ` · ${dinero(e.cargos)} de seguros y cargos` : ''}</div>
      </div>` : `<div class="caja"><b class="ok">Préstamo pagado</b></div>`}
      <div class="dos" style="margin-top:14px">
        <div>Intereses pagados<b>${dinero(e.interesPagado)}</b></div>
        <div>Intereses por pagar<b class="bad">${dinero(e.interesRestante)}</b></div>
      </div>
      ${e.proxima ? `<div class="caja">
        <b style="font-size:13.5px">¿Y si abonas extra cada mes?</b>
        <div class="sim"><span class="mu">$</span>${entrada('', extra, { tipo: 'number', min: 0, paso: 5, extra: `data-sim="${p.id}" aria-label="Abono extra mensual"` })}<span class="mu">más por cuota</span></div>
        ${extra > 0 && sim.mesesMenos > 0 ? `<div>Terminas en <b style="display:inline;font-size:inherit">${nombreMes(sim.fechaFinDespues.slice(0, 7))}</b>: <span class="ok">${sim.mesesMenos} cuotas menos</span> y <span class="ok">${dinero(sim.interesAhorrado)}</span> menos de intereses.</div>` : ''}
        <div class="nota">Pide a tu banco que el abono vaya a capital "reduciendo plazo".</div>
      </div>` : ''}
      <div class="tc-acc">
        <button class="btn sm" data-accion="pagar" data-id="${p.id}">${ic('pago')} Registrar pago</button>
        <button class="btn sm sec" data-accion="modal" data-tipo="tabla" data-id="${p.id}">${ic('tabla')} Tabla de pagos</button>
      </div>
    </article>`;
  }).join('');
}

function planActual(hoy) {
  const deudas = deudasParaPlan(hoy);
  if (!deudas.length) return null;
  const minimos = sumar(deudas.map(d => d.minimo));
  const presupuesto = ui.presupuestoPlan ?? ajustes().presupuestoDeudas ?? Math.ceil(minimos * 1.3 / 10) * 10;
  return { deudas, minimos, presupuesto, c: compararPlanes(deudas, presupuesto) };
}

function planHTML(plan) {
  if (!plan) return `<div class="card">${vacio('escalera', 'Sin deudas', 'Cuando agregues tarjetas o préstamos, aquí verás el mejor orden para pagarlas.')}</div>`;
  const { minimos, presupuesto, c } = plan;
  const opcion = (titulo, sub, r, elegido) => `<div class="plan ${elegido ? 'elegido' : ''}">
    <div class="plan-t"><span>${titulo}</span>${elegido ? '<span class="chip warn">Recomendado</span>' : ''}</div>
    <small class="mu" style="margin:-4px 0 8px">${sub}</small>
    <div class="dos"><div>Libre de deudas<b>${r.terminado === false ? 'Nunca' : `${r.meses} meses`}</b></div><div>Intereses<b>${dinero(r.interesTotal)}</b></div></div>
  </div>`;
  const ahorro = c.bola.viable ? c.bola.interesTotal - c.avalancha.interesTotal : 0;
  return `
    <div class="card pad">
      <b>¿Cuánto puedes pagar al mes, en total?</b>
      <small class="mu">Sumando todos los mínimos y la cuota del préstamo: ${dinero(minimos)}</small>
      <div class="sim"><span class="mu">$</span>${entrada('', presupuesto, { tipo: 'number', min: 0, paso: 10, extra: 'data-plan aria-label="Monto mensual para deudas"' })}<span class="mu">al mes</span></div>
    </div>
    ${!c.avalancha.viable ? `<div class="card pad" style="margin-top:12px"><b class="bad">No alcanza para los mínimos</b><small class="mu">Necesitas al menos ${dinero(minimos)} al mes.</small></div>` : `
      ${opcion('Avalancha', 'Primero la de mayor interés', c.avalancha, true)}
      ${opcion('Bola de nieve', 'Primero la más pequeña', c.bola, false)}
      ${opcion('Solo mínimos', 'Lo que pasa si sigues igual', c.soloMinimos, false)}
      ${ahorro > 1 ? `<small class="mu" style="margin:10px 4px 0">La avalancha te ahorra ${dinero(ahorro)}. La bola de nieve liquida deudas antes, y eso ayuda si te cuesta mantener el ánimo.</small>` : ''}
      <div class="secc"><h3>En este orden</h3></div>
      <div class="card"><ol class="pasos">${c.avalancha.liquidaciones.map(l => `<li><span class="rt"><b>${esc(l.nombre)}</b><small>Liquidada en el mes ${l.mes}</small></span></li>`).join('')}</ol></div>
      <small class="mu" style="margin:10px 4px">Cada mes paga el mínimo de todas y lo que sobre a la primera de la lista; al liquidarla, pasa a la siguiente. Usa los saldos y tasas de hoy, sin compras nuevas.</small>`}
  `;
}

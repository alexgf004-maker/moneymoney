import { ui, esc, barra, vacioMsg, entrada } from '../ui.js';
import { ajustes } from '../store.js';
import { movs, resumenDeudas, deudasParaPlan, nombreBanco } from '../consultas.js';
import { simularAbono } from '../domain/prestamo.js';
import { compararPlanes } from '../domain/deudas.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, fechaCorta, cuandoEs, nombreMes } from '../domain/fechas.js';

export function vistaDeudas() {
  const hoy = hoyISO();
  const d = resumenDeudas(hoy);
  return `
    <section class="tarjeta-resumen">
      <div class="etiqueta">Debes en total</div>
      <div class="cifra-grande">${dinero(d.total)}</div>
      <div class="sub">Tarjetas ${dinero(d.totalTarjetas)} · Préstamos ${dinero(d.totalPrestamos)}</div>
    </section>

    <div class="bloque-titulo"><h2>Tarjetas de crédito</h2><button class="enlace" data-accion="modal" data-tipo="tarjeta">＋ Agregar</button></div>
    ${d.ts.length ? d.ts.map(({ t, e }) => tarjetaHTML(t, e, hoy)).join('') : vacioMsg('Sin tarjetas', 'Agrega tus tarjetas para ver cuándo y cuánto pagar.')}

    <div class="bloque-titulo"><h2>Préstamos</h2><button class="enlace" data-accion="modal" data-tipo="prestamo">＋ Agregar</button></div>
    ${d.ps.length ? d.ps.map(({ p, e }) => prestamoHTML(p, e, hoy)).join('') : vacioMsg('Sin préstamos')}

    ${planHTML(hoy)}
  `;
}

function tarjetaHTML(t, e, hoy) {
  const nivelUso = e.uso >= 0.9 ? 'excedido' : e.uso >= 0.5 ? 'alerta' : 'ok';
  let estado;
  if (e.alDia) estado = `<span class="chip bueno">✓ Corte del ${fechaCorta(e.ultimoCorte)} pagado</span>`;
  else if (e.vencido) estado = `<span class="chip malo">⚠️ Venció el ${fechaCorta(e.fechaPago)}</span>`;
  else estado = `<span class="chip ${e.diasParaPago <= 3 ? 'alerta' : ''}">Pagar ${cuandoEs(e.fechaPago, hoy)} (${fechaCorta(e.fechaPago)})</span>`;
  return `<article class="bloque deuda">
    <div class="deuda-top">
      <div><b>${esc(t.nombre)}</b> <span class="tenue">···${esc(t.ultimos4)} · ${esc(nombreBanco(t.banco))}</span></div>
      <button class="icono-boton" data-accion="modal" data-tipo="tarjeta" data-id="${t.id}" aria-label="Editar">✎</button>
    </div>
    <div class="cifra-media">${dinero(e.saldoActual)}</div>
    ${barra(e.uso, nivelUso)}
    <div class="tenue">${(e.uso * 100).toFixed(0)}% de ${dinero(t.limite)} · Disponible ${dinero(e.disponible)}</div>
    <div class="deuda-pago">
      ${estado}
      ${e.alDia ? '' : `<div class="dos-col">
        <div><div class="tenue">Pago de contado <span title="Pagando esto no pagas intereses">ⓘ</span></div><b>${dinero(e.contadoPendiente)}</b></div>
        <div><div class="tenue">Mínimo aprox.</div><b>${dinero(e.minimoPendiente)}</b></div>
      </div>
      ${e.interesSiMinimo > 0 ? `<small class="malo">Si pagas solo el mínimo: unos ${dinero(e.interesSiMinimo)} de intereses el próximo mes.</small>` : ''}`}
    </div>
    <div class="tenue pie-deuda">Próximo corte: ${fechaCorta(e.proximoCorte)} · Compras desde el último corte: ${dinero(e.comprasCiclo)}</div>
    <div class="acciones">
      <button class="boton chico" data-accion="pagar" data-id="${t.id}">Registrar pago</button>
      <button class="boton chico secundario" data-accion="ver-cuenta" data-id="${t.id}">Movimientos</button>
    </div>
  </article>`;
}

function prestamoHTML(p, e, hoy) {
  const extra = ui.simExtra[p.id] ?? 50;
  const sim = simularAbono(p, movs(), hoy, { extraMensual: extra });
  return `<article class="bloque deuda">
    <div class="deuda-top">
      <div><b>${esc(p.nombre)}</b> <span class="tenue">${esc(nombreBanco(p.banco))} · ${p.tasaAnual}% anual</span></div>
      <button class="icono-boton" data-accion="modal" data-tipo="prestamo" data-id="${p.id}" aria-label="Editar">✎</button>
    </div>
    <div class="cifra-media">${dinero(e.saldo)}</div>
    ${barra(e.avance, 'bueno')}
    <div class="tenue">Llevas ${(e.avance * 100).toFixed(0)}% pagado · ${e.cuotasPagadas} de ${e.cuotasTotales} cuotas · termina en ${e.fechaFin ? nombreMes(e.fechaFin.slice(0, 7)) : '—'}</div>
    ${e.proxima ? `<div class="deuda-pago">
      <span class="chip ${e.cuotaRegistrada ? 'bueno' : ''}">${e.cuotaRegistrada ? '✓ Cuota de este mes registrada' : `Próxima cuota ${cuandoEs(e.proxima.fecha, hoy)} (${fechaCorta(e.proxima.fecha)})`}</span>
      <div class="tres-col">
        <div><div class="tenue">Cuota</div><b>${dinero(e.cuota)}</b></div>
        <div><div class="tenue">A capital</div><b>${dinero(e.proxima.capital)}</b></div>
        <div><div class="tenue">Intereses</div><b>${dinero(e.proxima.interes)}</b></div>
      </div>
      ${e.cargos ? `<small class="tenue">Incluye ${dinero(e.cargos)} de seguros y cargos.</small>` : ''}
    </div>` : '<span class="chip bueno">🎉 Préstamo pagado</span>'}
    <div class="dos-col">
      <div><div class="tenue">Intereses ya pagados</div><b>${dinero(e.interesPagado)}</b></div>
      <div><div class="tenue">Intereses por pagar</div><b class="malo">${dinero(e.interesRestante)}</b></div>
    </div>
    ${e.proxima ? `<div class="simulador">
      <b>¿Y si abono extra cada mes?</b>
      <div class="simulador-fila">$ ${entrada('', extra, { tipo: 'number', min: 0, paso: 5, extra: `data-sim="${p.id}" class="corto"` })} más por cuota</div>
      ${extra > 0 ? `<p>Terminarías en <b>${nombreMes(sim.fechaFinDespues.slice(0, 7))}</b> en vez de ${nombreMes(sim.fechaFinAntes.slice(0, 7))}: <b class="bueno">${sim.mesesMenos} cuotas menos</b> y <b class="bueno">${dinero(sim.interesAhorrado)}</b> menos de intereses.</p>` : ''}
      <small class="tenue">Pregunta a tu banco que el abono extra vaya a capital "reduciendo plazo".</small>
    </div>` : ''}
    <div class="acciones">
      <button class="boton chico" data-accion="pagar" data-id="${p.id}">Registrar pago</button>
      <button class="boton chico secundario" data-accion="modal" data-tipo="tabla" data-id="${p.id}">Tabla de pagos</button>
    </div>
  </article>`;
}

function planHTML(hoy) {
  const deudas = deudasParaPlan(hoy);
  if (!deudas.length) return '';
  const minimos = sumar(deudas.map(d => d.minimo));
  const presupuesto = ui.presupuestoPlan ?? ajustes().presupuestoDeudas ?? Math.ceil(minimos * 1.3 / 10) * 10;
  const c = compararPlanes(deudas, presupuesto);
  const fila = (titulo, r, recomendado) => `<div class="plan-fila ${recomendado ? 'recomendado' : ''}">
    <div><b>${titulo}</b>${recomendado ? ' <span class="chip bueno">Recomendado</span>' : ''}</div>
    <div class="tres-col">
      <div><div class="tenue">Libre de deudas</div><b>${r.terminado === false ? 'Nunca' : `${r.meses} meses`}</b></div>
      <div><div class="tenue">Intereses</div><b>${dinero(r.interesTotal)}</b></div>
    </div>
  </div>`;
  const ahorro = c.bola.viable ? c.bola.interesTotal - c.avalancha.interesTotal : 0;
  return `<section class="bloque" id="plan">
    <h2>Plan para salir de deudas</h2>
    <p class="tenue">¿Cuánto puedes destinar cada mes a pagar deudas (en total)? La suma de los mínimos y la cuota es ${dinero(minimos)}.</p>
    <div class="simulador-fila">$ ${entrada('', presupuesto, { tipo: 'number', min: 0, paso: 10, extra: 'data-plan class="corto"' })} al mes</div>
    ${!c.avalancha.viable ? `<p class="malo">Con ese monto no alcanza para los mínimos (${dinero(minimos)}). Sube el monto para ver el plan.</p>` : `
      ${fila('Avalancha: primero la de mayor interés', c.avalancha, true)}
      ${fila('Bola de nieve: primero la más pequeña', c.bola, false)}
      ${fila('Pagando solo los mínimos', c.soloMinimos, false)}
      ${ahorro > 1 ? `<p>La avalancha te ahorra <b class="bueno">${dinero(ahorro)}</b> frente a la bola de nieve. La bola de nieve liquida deudas antes, y eso ayuda si te cuesta mantener la motivación.</p>` : ''}
      <b>Orden sugerido (avalancha)</b>
      <ol class="orden">${c.avalancha.liquidaciones.map(l => `<li>${esc(l.nombre)} <span class="tenue">— liquidada en el mes ${l.mes}</span></li>`).join('')}</ol>
      <small class="tenue">Cada mes paga el mínimo de todas y todo lo que sobre a la primera de la lista. Cuando se liquide, pasa a la siguiente. El cálculo usa los saldos y tasas de hoy, sin compras nuevas.</small>`}
  </section>`;
}

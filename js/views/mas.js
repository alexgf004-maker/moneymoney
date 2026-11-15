import { ui, esc, ic, tile, top, vacio, lin, entrada, montoGrande, temaGuardado } from '../ui.js';
import { lista, ajustes } from '../store.js';
import { movs, cuentas, reglas, recurrentes, nombreCuenta, nombreBanco, hormigaDelMes, suscripcionesActuales, compromisos } from '../consultas.js';
import { CATEGORIAS, categoria } from '../domain/categorias.js';
import { estadoPresupuestos, proximaFechaRecurrente, totalGastado } from '../domain/resumen.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, mesDe, mesAnterior, nombreMes, fechaCorta, fechaLarga, diasEntre } from '../domain/fechas.js';
import { saldoCuenta, movimientosDeCuenta } from '../domain/cuentas.js';
import { filaMovimiento } from './movimientos.js';

const SUBS = {
  presupuesto: ['Presupuesto', presupuesto],
  hormiga: ['Gastos hormiga', hormiga],
  suscripciones: ['Suscripciones', suscripcionesHTML],
  compromisos: ['Cuándo termino de pagar', compromisosHTML],
  fijos: ['Pagos fijos', fijos],
  cuentas: ['Tu dinero', cuentasHTML],
  reglas: ['Reglas de categorías', reglasHTML],
  conexion: ['Conexión con Gmail', conexion],
  noleidos: ['Correos sin leer', noLeidos],
  notificaciones: ['Avisos', notificaciones],
  revisados: ['Correos revisados', revisados],
  apariencia: ['Apariencia', apariencia],
  respaldo: ['Respaldo', respaldo],
};

export function vistaMas() {
  const sub = SUBS[ui.sub];
  if (sub) return top({ eyebrow: 'Más', titulo: sub[0], atras: true }) + sub[1]();
  const n = lista('noLeidos').length;
  const fila = (s, icono, titulo, detalle) => `<button class="row" data-accion="sub" data-sub="${s}">${tile(icono)}<span class="rt"><b>${titulo}</b><small>${detalle}</small></span><span class="mu">${ic('chevron-right')}</span></button>`;
  const conectado = ui.nube === 'conectado';
  return `
    ${top({ eyebrow: 'Ajustes y herramientas', titulo: 'Más' })}
    <div class="grupo-t">Tu dinero</div>
    <div class="card">
      ${fila('presupuesto', 'objetivo', 'Presupuesto', 'Límites por categoría y alertas')}
      ${fila('hormiga', 'cat-comida', 'Gastos hormiga', 'Compras pequeñas que suman mucho')}
      ${fila('suscripciones', 'cat-suscripciones', 'Suscripciones', 'Cuánto pagas al mes y al año')}
      ${fila('compromisos', 'calendario', 'Cuándo termino de pagar', 'Tus pagos de cada mes y cuándo se acaban')}
      ${fila('fijos', 'repetir', 'Pagos fijos', `${recurrentes().length || 'Ninguno'} · se anotan solos cada mes`)}
      ${fila('cuentas', 'cartera', 'Tu dinero', 'Tus cuentas, efectivo y sus movimientos')}
      ${fila('reglas', 'regla', 'Reglas de categorías', `${reglas().length} propia${reglas().length === 1 ? '' : 's'} · más los comercios comunes`)}
    </div>
    <div class="grupo-t">Automatización</div>
    <div class="card">
      ${fila('conexion', conectado ? 'nube' : 'correo', 'Conexión con Gmail', conectado ? `Conectado como ${esc(ui.usuario?.correo || '')}` : 'Registra solas tus compras con tarjeta')}
      ${fila('notificaciones', 'alerta', 'Avisos', avisosActivos() ? 'Activados en este teléfono' : 'Recordatorios de pago y de compras')}
      ${lista('revision').length ? fila('revisados', 'revisar', 'Correos revisados', `${lista('revision').length} correos de tus bancos · qué se hizo con cada uno`) : ''}
      ${n ? fila('noleidos', 'bandeja', 'Correos sin leer', `${n} correo${n > 1 ? 's' : ''} del banco por revisar`) : ''}
    </div>
    <div class="grupo-t">App</div>
    <div class="card">
      ${fila('apariencia', 'paleta', 'Apariencia', { auto: 'Automática', claro: 'Clara', oscuro: 'Oscura' }[temaGuardado()])}
      ${fila('respaldo', 'base', 'Respaldo', 'Descargar o restaurar tus datos')}
    </div>
  `;
}

// ---------- Avisos (notificaciones al teléfono y por correo) ----------

export function avisosActivos() {
  try { return typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!localStorage.getItem('moneymoney:notif'); } catch { return false; }
}

function notificaciones() {
  const n = { pagos: true, compras: true, correo: true, ...(ajustes().notif || {}) };
  const activos = avisosActivos();
  const opcion = (clave, titulo, detalle) => `<label class="marca" style="margin:0;padding:12px 0;border-bottom:1px solid var(--bd)">
      <input type="checkbox" data-accion="notif-pref" data-clave="${clave}" ${n[clave] ? 'checked' : ''}>
      <span class="rt"><b style="font-weight:600">${titulo}</b><small class="mu" style="white-space:normal">${detalle}</small></span></label>`;
  let estado;
  if (ui.nube !== 'conectado') {
    estado = `<div class="row" style="border:0">${tile('nube')}<span class="rt"><b style="white-space:normal">Primero entra con tu cuenta de Google</b><small style="white-space:normal">Los avisos los manda el script de tu Gmail usando tu Firebase.</small></span></div>
      <button class="btn ancho" data-accion="entrar">${ic('entrar')} Entrar con Google</button>`;
  } else if (!('Notification' in window)) {
    estado = `<div class="row" style="border:0">${tile('alerta', 'bad')}<span class="rt"><b style="white-space:normal">Este navegador no permite notificaciones</b><small style="white-space:normal">Instala la app desde Chrome (menú, Agregar a pantalla principal) y ábrela desde el ícono.</small></span></div>`;
  } else if (activos) {
    estado = `<div class="row" style="border:0">${tile('check', 'ok')}<span class="rt"><b>Activados en este teléfono</b><small>Te llegan aunque no abras la app</small></span></div>
      <div class="tc-acc"><button class="btn sm sec" data-accion="probar-notif">${ic('alerta')} Probar</button><button class="btn sm sec" data-accion="activar-notif">${ic('repetir')} Volver a registrar</button></div>`;
  } else {
    estado = `<div class="row" style="border:0">${tile('alerta', 'oro')}<span class="rt"><b style="white-space:normal">Activa los avisos en este teléfono</b><small style="white-space:normal">Te pedirá permiso para mostrar notificaciones.</small></span></div>
      <button class="btn ancho" data-accion="activar-notif">${ic('alerta')} Activar avisos</button>`;
  }
  return `<div class="card pad">${estado}</div>
    <div class="secc"><h3>Qué avisarte</h3></div>
    <div class="card" style="padding:0 16px">
      ${opcion('pagos', 'Pagos que vencen', '3 días antes, el día anterior, el mismo día y si se venció. Si varios vencen cerca, llega un solo aviso con todos.')}
      ${opcion('compras', 'Cada compra con tarjeta', 'Cuando llega el correo del banco: monto, comercio y tarjeta.')}
      ${opcion('correo', 'También por correo', 'Los avisos de pago te llegan además a tu Gmail, por si el teléfono no los muestra.')}
    </div>
    <small class="mu" style="margin:12px 4px">Los avisos de pago salen cada mañana a las 7, con la agenda que la app guarda cada vez que la abres. Ábrela al menos una vez por semana para que esté al día.</small>`;
}

// ---------- Gastos hormiga ----------

function hormiga() {
  const hoy = hoyISO();
  const mes = mesDe(hoy);
  const h = hormigaDelMes(mes, hoy);
  const nombreAnt = nombreMes(mesAnterior(mes)).split(' ')[0];
  return `
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Menos de ${dinero(h.umbral)} · ${nombreMes(mes).split(' ')[0]}</span><span class="badge">${h.veces} compra${h.veces === 1 ? '' : 's'}</span></div>
      <div class="big">${montoGrande(dinero(h.total))}</div>
      <div class="pc-sub">A este ritmo: ${dinero(h.proyeccionMes)} este mes · ${dinero(h.alAnio)} en un año</div>
      ${h.anterior ? `<div class="pc-div"></div><div class="mini"><div>En ${nombreAnt}<b>${dinero(h.anterior)}</b></div><div>Promedio por compra<b>${h.veces ? dinero(h.total / h.veces) : '—'}</b></div></div>` : ''}
    </section>
    <p class="mu" style="margin:14px 4px">Cada una parece poca cosa, pero juntas suman. Los comercios donde más se te van:</p>
    <div class="card">${h.porComercio.length ? h.porComercio.slice(0, 15).map(g => {
      const c = categoria(g.categoriaId);
      return `<div class="row">${tile(c.icono, '', `color:${c.color}`)}<span class="rt"><b>${esc(g.nombre)}</b><small>${g.veces} ${g.veces === 1 ? 'vez' : 'veces'} · promedio ${dinero(g.total / g.veces)}</small></span><span class="amt">${dinero(g.total)}</span></div>`;
    }).join('') : vacio('check', 'Sin gastos hormiga este mes')}</div>
    <div class="card pad" style="margin-top:12px"><label class="campo" style="margin:0"><span>Cuenta como hormiga una compra de menos de</span>
      <div class="sim" style="margin:0"><span class="mu">$</span>${entrada('', h.umbral, { tipo: 'number', min: 1, paso: 1, extra: 'data-ajuste-num="umbralHormiga" aria-label="Monto máximo de un gasto hormiga"' })}</div></label></div>`;
}

// ---------- Suscripciones ----------

function suscripcionesHTML() {
  const s = suscripcionesActuales();
  return `
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Tus suscripciones</span>${s.paraCancelar ? `<span class="badge">${ic('check')} Ahorras ${dinero(s.paraCancelar)}/mes si cancelas</span>` : ''}</div>
      <div class="big">${montoGrande(dinero(s.alMes))}<small style="font-size:16px"> al mes</small></div>
      <div class="pc-sub">${dinero(s.alAnio)} al año</div>
    </section>
    <p class="mu" style="margin:14px 4px">Cobros que se repiten cada mes con un monto parecido, o servicios conocidos (Netflix, Spotify, apps…). Márcalas para cancelar, pon solo tu parte si la pagas con otros, o quítalas si no son suscripciones.</p>
    <div class="card">${s.lista.length ? s.lista.map(x => `<div class="row ${x.cancelar ? 'apagado' : ''}">
      ${tile('cat-suscripciones', x.cancelar ? '' : 'oro')}
      <span class="rt"><b>${esc(x.nombre)}</b>${x.compartida ? `<small><span class="chip">${ic('usuarios')} Tu parte de ${dinero(x.montoTotal)}${x.compartida.entre ? `, entre ${x.compartida.entre}` : ''}</span></small>` : ''}<small>${x.cancelar ? '<span class="chip warn">Para cancelar</span>' : ''}${x.ultimoCobro ? `Último cobro ${fechaCorta(x.ultimoCobro)}` : 'Pago fijo'}${x.cuentaId ? ` · ${esc(nombreCuenta(x.cuentaId))}` : ''} · ${dinero(x.alAnio)} al año</small>
        <span style="display:flex;flex-wrap:wrap;column-gap:16px;row-gap:2px;margin-top:4px;white-space:nowrap">
          <button class="link" style="font-size:12.5px" data-accion="sus-cancelar" data-clave="${esc(x.clave)}">${x.cancelar ? 'La sigo pagando' : 'Cancelarla'}</button>
          <button class="link" style="font-size:12.5px" data-accion="modal" data-tipo="compartir" data-id="${esc(x.clave)}">${x.compartida ? 'Cambiar mi parte' : 'La pago con otros'}</button>
          <button class="link" style="font-size:12.5px;color:var(--mu)" data-accion="sus-ignorar" data-clave="${esc(x.clave)}">No es suscripción</button>
        </span></span>
      <span class="amt">${dinero(x.monto)}<small>al mes</small></span>
    </div>`).join('') : vacio('cat-suscripciones', 'Todavía no detecto suscripciones', 'Aparecen cuando un cobro se repite dos meses, o puedes agregarlas como pago fijo con categoría Suscripciones.')}</div>
    ${s.quitadas.length ? `<div class="secc"><h3>Quitadas</h3></div>
    <p class="mu" style="margin:0 4px 10px">Las marcaste como "No es suscripción". Si te equivocaste, vuelve a agregarlas.</p>
    <div class="card">${s.quitadas.map(x => `<div class="row apagado">${tile('cat-suscripciones')}
      <span class="rt"><b>${esc(x.nombre)}</b><small>${dinero(x.monto)} al mes</small></span>
      <button class="link" style="font-size:12.5px;white-space:nowrap" data-accion="sus-restaurar" data-clave="${esc(x.clave)}">Volver a agregar</button>
    </div>`).join('')}</div>` : ''}`;
}

// ---------- Compromisos: cuándo termino de pagar ----------

function compromisosHTML() {
  const hoy = hoyISO();
  const c = compromisos(hoy);
  const icono = { cuotas: 'calendario', prestamo: 'banco', fijo: 'repetir', suscripcion: 'cat-suscripciones' };
  const nombreLargo = mes => nombreMes(mes).replace(/^\w/, l => l.toUpperCase());
  return `
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Pagas cada mes</span>${c.hitos.length ? `<span class="badge">${ic('baja')} Baja a ${dinero(c.hitos[c.hitos.length - 1].quedaAlMes)}</span>` : ''}</div>
      <div class="big">${montoGrande(dinero(c.mensualHoy))}</div>
      <div class="pc-sub">En cuotas, préstamos, pagos fijos y suscripciones${c.sinFin ? ` · ${dinero(c.sinFin)} no tienen fecha de fin` : ''}</div>
    </section>
    ${c.hitos.length ? `<div class="secc"><h3>Cuándo se te libera dinero</h3></div>
    <div class="card"><ol class="pasos">${c.hitos.map(h => `<li><span class="rt"><b>${nombreLargo(h.mes)}: +${dinero(h.libera)} al mes</b>
      <small style="white-space:normal">Ya no pagas ${h.termina.map(t => esc(t.nombre)).join(', ')} · desde ahí pagas ${dinero(h.quedaAlMes)} al mes</small></span></li>`).join('')}</ol></div>` : ''}
    <div class="secc"><h3>Todo lo que pagas cada mes</h3></div>
    <div class="card">${c.items.length ? c.items.map(i => `<div class="row">${tile(icono[i.tipo] || 'repetir')}
      <span class="rt"><b>${esc(i.nombre)}</b><small>${esc(i.detalle)} · ${i.fin ? `termina en ${nombreMes(i.fin.slice(0, 7))}` : 'sin fecha de fin'}</small></span>
      <span class="amt">${dinero(i.mensual)}<small>al mes</small></span></div>`).join('') : vacio('calendario', 'Sin pagos mensuales registrados')}</div>`;
}

// Qué pasó con cada correo de banco que revisó el script de Gmail
const RESULTADOS = {
  movimiento: ['Registrado', 'ok', 'check'],
  estado: ['Estado de cuenta', 'ok', 'calendario'],
  publicidad: ['Publicidad', '', 'bandeja'],
  aviso: ['Aviso sin montos', '', 'info'],
  transferencia: ['Movimiento de tu cuenta, no de tarjeta', '', 'cartera'],
  'sin-tarjeta': ['Sin tarjeta: no se registró', 'warn', 'alerta'],
  'sin-movimiento': ['No se entendió', 'warn', 'alerta'],
  'estado-incompleto': ['Estado de cuenta incompleto', 'warn', 'alerta'],
};
const esDescartado = r => ['sin-tarjeta', 'sin-movimiento', 'estado-incompleto'].includes(r.resultado);

function revisados() {
  const todos = lista('revision').sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const reg = todos.filter(r => r.resultado === 'movimiento' || r.resultado === 'estado').length;
  const desc = todos.filter(esDescartado).length;
  const otros = todos.length - reg - desc;
  const verDescartados = ui.filtroRevision === 'descartados';
  const lista_ = verDescartados ? todos.filter(esDescartado) : todos;
  return `
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Correos de tus bancos revisados</span>${desc ? `<span class="badge rojo">${ic('alerta')} ${desc} por revisar</span>` : `<span class="badge">${ic('check')} Nada pendiente</span>`}</div>
      <div class="big">${todos.length}</div>
      <div class="pc-div"></div>
      <div class="mini"><div>Registrados<b>${reg}</b></div><div>Publicidad y avisos<b>${otros}</b></div></div>
    </section>
    <p class="mu" style="margin:14px 4px">Si un correo dice "No se registró" y sí era una compra o un pago, tócalo para anotarlo. Los de publicidad se ignoran a propósito.</p>
    <div class="pildoras" style="margin-bottom:12px">
      <button class="pildora ${verDescartados ? '' : 'on'}" data-accion="filtro-revision" data-valor="todos">Todos</button>
      <button class="pildora ${verDescartados ? 'on' : ''}" data-accion="filtro-revision" data-valor="descartados">Por revisar ${desc ? `<span class="num">${desc}</span>` : ''}</button>
    </div>
    <div class="card">${lista_.length ? lista_.slice(0, 150).map(r => {
      const [texto, tono, icono] = RESULTADOS[r.resultado] || ['Otro', '', 'info'];
      const accion = esDescartado(r) ? `data-accion="anotar-revision" data-id="${esc(r.id)}"` : '';
      return `<${accion ? 'button' : 'div'} class="row" ${accion}>
        ${tile(icono, tono === 'warn' ? 'oro' : tono)}
        <span class="rt"><b>${esc(r.asunto || 'Sin asunto')}</b><small><span class="chip ${tono}">${texto}</span>${r.fecha ? fechaCorta(r.fecha) : ''} · ${esc(nombreBanco(r.banco))}${r.ultimos4 ? ` ···${esc(r.ultimos4)}` : ''}</small></span>
        <span class="amt">${r.monto ? dinero(r.monto) : ''}</span>
      </${accion ? 'button' : 'div'}>`;
    }).join('') : vacio('check', 'Nada por revisar')}</div>`;
}

function presupuesto() {
  const hoy = hoyISO();
  const mes = mesDe(hoy);
  const limites = Object.fromEntries(lista('presupuestos').map(p => [p.id, p.limite]));
  const estado = Object.fromEntries(estadoPresupuestos(limites, movs(), mes, hoy).map(e => [e.categoriaId, e]));
  const total = sumar(Object.values(limites));
  const gastadoEnLimitadas = sumar(Object.values(estado).map(e => e.gastado));
  return `
    <section class="pc">
      <div class="pc-top"><span class="pc-lbl">Presupuesto de ${nombreMes(mes).split(' ')[0]}</span>${total ? `<span class="badge">Gastado ${dinero(gastadoEnLimitadas)}</span>` : ''}</div>
      <div class="big">${total ? montoGrande(dinero(total)) : '—'}</div>
      ${total ? `<div class="bar ${gastadoEnLimitadas > total ? 'pasado' : ''}"><span style="width:${Math.min(100, gastadoEnLimitadas / total * 100).toFixed(1)}%"></span></div>
        <div class="pc-foot"><span>${(gastadoEnLimitadas / total * 100).toFixed(0)}% usado</span><span>${gastadoEnLimitadas > total ? `Te pasaste ${dinero(gastadoEnLimitadas - total)}` : `Quedan ${dinero(total - gastadoEnLimitadas)}`}</span></div>`
        : `<div class="pc-sub">Pon un límite a las categorías que quieras cuidar. Te avisa al llegar al 80% o si vas a ritmo de pasarte.</div>`}
    </section>
    <div class="secc"><h3>Límite por categoría</h3><span class="mu" style="font-size:12px">Gasto total del mes ${dinero(totalGastado(movs(), mes))}</span></div>
    <div class="card">${CATEGORIAS.filter(c => c.id !== 'comisiones').map(c => {
      const e = estado[c.id];
      return `<div class="pres-fila">
        <div class="pres-top">${tile(c.icono, '', `color:${c.color}`)}<span class="rt"><b>${esc(c.nombre)}</b></span>
          <span class="pres-in">$${entrada('', limites[c.id] || '', { tipo: 'number', min: 0, paso: 5, ph: 'Sin límite', extra: `data-presupuesto="${c.id}" aria-label="Límite de ${esc(c.nombre)}"` })}</span></div>
        ${e ? `${lin(e.pct, e.nivel === 'excedido' ? 'bad' : e.nivel === 'alerta' ? 'warn' : 'ok')}<small class="mu">${dinero(e.gastado)} gastado · ${e.disponible >= 0 ? `quedan ${dinero(e.disponible)}` : `te pasaste ${dinero(-e.disponible)}`}</small>` : ''}
      </div>`;
    }).join('')}</div>`;
}

function fijos() {
  const hoy = hoyISO();
  const rs = recurrentes();
  return `
    <p class="mu" style="margin:0 4px 14px">Netflix, internet, teléfono, la cuota del préstamo o tu salario: se anotan solos el día que toca.</p>
    <div class="card">${rs.length ? rs.map(r => {
      const c = r.tipo === 'pago' ? { icono: 'pago' } : categoria(r.categoriaId);
      return `<button class="row ${r.activo === false ? 'apagado' : ''}" data-accion="modal" data-tipo="recurrente" data-id="${r.id}">
        ${tile(c.icono, r.tipo === 'ingreso' ? 'ok' : '')}
        <span class="rt"><b>${esc(r.nombre)}</b><small>Día ${r.dia} · ${esc(nombreCuenta(r.cuentaId))}${r.activo === false ? ' · pausado' : ` · próximo ${fechaCorta(proximaFechaRecurrente(r, hoy))}`}</small></span>
        <span class="amt ${r.tipo === 'ingreso' ? 'ok' : ''}">${r.tipo === 'ingreso' ? '+' : ''}${dinero(r.monto)}</span>
      </button>`;
    }).join('') : vacio('repetir', 'Sin pagos fijos', 'Agrega lo que pagas o recibes cada mes.')}</div>
    <button class="btn ancho" style="margin-top:14px" data-accion="modal" data-tipo="recurrente">${ic('plus')} Agregar pago fijo</button>`;
}

// Tu dinero · opción 2 "Una cuenta a la vez" (elegida el 15 nov 2026): fichas de cada cuenta arriba; la elegida
// muestra su saldo, lo que entró y salió en el mes, y sus movimientos.
function cuentasHTML() {
  const hoy = hoyISO();
  const todas = cuentas().map(c => ({ c, s: saldoCuenta(c, movs(), hoy) }));
  if (!todas.length) return `<div class="card">${vacio('cartera', 'Sin cuentas', 'Agrega tu cuenta de banco, billeteras como Binance o Nequi, y tu efectivo.', `<button class="btn sm" data-accion="modal" data-tipo="cuenta">${ic('plus')} Agregar cuenta</button>`)}</div>`;
  const sel = todas.find(x => x.c.id === ui.cuentaSel) || todas.find(x => x.c.tipo !== 'efectivo') || todas[0];
  const total = sumar(todas.filter(x => x.s != null).map(x => x.s));
  // Segunda línea de cada ficha: sin repetir el nombre (Banco Agrícola / Banco Agrícola)
  const sub = c => {
    if (c.tipo === 'efectivo') return 'En la cartera';
    const banco = c.banco && c.banco !== 'otro' ? nombreBanco(c.banco) : '';
    return banco && banco !== c.nombre ? banco : c.cuenta4 ? 'Cuenta' : banco ? 'Cuenta de banco' : 'Billetera';
  };
  const fichas = todas.map(({ c, s }) => `<button class="ficha ${c.id === sel.c.id ? 'on' : ''}" data-accion="ver-dinero" data-id="${c.id}" aria-pressed="${c.id === sel.c.id}">
      <small>${esc(c.nombre)}</small><small>${esc(sub(c))}${c.cuenta4 ? ` ···${esc(c.cuenta4)}` : ''}</small><b>${s != null ? dinero(s) : 'Sin saldo'}</b></button>`).join('');
  const mes = mesDe(hoy);
  const d = movimientosDeCuenta(sel.c, movs(), mes);
  const porDia = new Map();
  for (const x of d.lista.slice(0, 60)) {
    if (!porDia.has(x.m.fecha)) porDia.set(x.m.fecha, []);
    porDia.get(x.m.fecha).push(x);
  }
  const titulo = f => { const n = diasEntre(f, hoy); return n === 0 ? 'Hoy' : n === 1 ? 'Ayer' : fechaLarga(f).replace(/ de \d{4}$/, ''); };
  const mesTxt = nombreMes(mes).split(' ')[0];
  return `
    <div class="fichas" role="tablist" aria-label="Tus cuentas">${fichas}
      <button class="ficha nueva" data-accion="modal" data-tipo="cuenta" aria-label="Agregar cuenta">${ic('plus')}<small>Agregar</small></button></div>
    ${todas.length > 1 ? `<p class="mu" style="margin:8px 4px 0;font-size:12.5px">Tienes en total ${dinero(total)}</p>` : ''}
    <section class="pc" style="margin-top:12px">
      <div class="pc-top"><span class="pc-lbl">${esc(sel.c.nombre)}${sel.c.cuenta4 ? ` · ···${esc(sel.c.cuenta4)}` : ''}</span></div>
      <div class="big">${sel.s != null ? montoGrande(dinero(sel.s)) : 'Sin saldo'}</div>
      ${sel.c.fechaSaldo ? `<div class="pc-sub">Desde el saldo que pusiste el ${fechaCorta(sel.c.fechaSaldo)}</div>` : ''}
      <div class="pc-div"></div>
      <div class="mini"><div>Entró en ${mesTxt}<b>${dinero(d.entro)}</b></div><div>Salió en ${mesTxt}<b>${dinero(d.salio)}</b></div></div>
    </section>
    <div class="dos-botones">
      <button class="btn sec" data-accion="modal" data-tipo="mover" data-pre="${sel.c.id}">${ic('repetir')} Mover dinero</button>
      <button class="btn sec" data-accion="modal" data-tipo="cuenta" data-id="${sel.c.id}">${ic('editar')} Ajustar saldo</button>
    </div>
    ${porDia.size ? [...porDia.entries()].map(([f, l]) => `<div class="dia-tit">${titulo(f)}</div><div class="card">${l.map(x => filaMovimiento(x.m, x.efecto)).join('')}</div>`).join('')
      : `<div class="card" style="margin-top:14px">${vacio('movimientos', 'Sin movimientos', 'Aquí aparecen tus ingresos, gastos, pagos y lo que muevas desde o hacia esta cuenta.')}</div>`}`;
}

function reglasHTML() {
  const rs = reglas().sort((a, b) => a.patron.localeCompare(b.patron));
  return `
    <p class="mu" style="margin:0 4px 14px">Si el nombre del comercio contiene el texto, se le pone esa categoría. Los comercios comunes (Selectos, Walmart, Puma, Netflix…) ya se reconocen solos.</p>
    <div class="card">${rs.length ? rs.map(r => {
      const c = categoria(r.categoriaId);
      return `<button class="row" data-accion="modal" data-tipo="regla" data-id="${r.id}">${tile(c.icono, '', `color:${c.color}`)}<span class="rt"><b>${esc(r.patron)}</b><small>${esc(c.nombre)}</small></span><span class="mu">${ic('chevron-right')}</span></button>`;
    }).join('') : vacio('regla', 'Sin reglas propias', 'Al corregir la categoría de un movimiento puedes guardarla como regla.')}</div>
    <button class="btn ancho" style="margin-top:14px" data-accion="modal" data-tipo="regla">${ic('plus')} Agregar regla</button>`;
}

function conexion() {
  let cuerpo;
  if (ui.nube === 'sin-configurar') {
    cuerpo = `<div class="row" style="border:0">${tile('telefono')}<span class="rt"><b style="white-space:normal">Guardando solo en este teléfono</b><small style="white-space:normal">Para que las compras con tarjeta se anoten solas hay que configurar la nube (Firebase) y el script de Gmail. Los pasos están en apps-script/README.md del repositorio.</small></span></div>`;
  } else if (ui.nube === 'cargando') {
    cuerpo = `<div class="row" style="border:0">${tile('nube')}<span class="rt"><b>Conectando…</b></span></div>`;
  } else if (ui.nube === 'sin-sesion') {
    cuerpo = `<div class="row" style="border:0">${tile('nube')}<span class="rt"><b>Inicia sesión</b><small style="white-space:normal">Con tu cuenta de Google, para guardar en la nube y recibir las compras de Gmail.</small></span></div>
      <button class="btn ancho" data-accion="entrar">${ic('entrar')} Entrar con Google</button>`;
  } else {
    cuerpo = `<div class="row">${tile('check', 'ok')}<span class="rt"><b>Conectado</b><small>${esc(ui.usuario?.correo)}</small></span></div>
      <label class="campo"><span>Tu código para el script de Gmail (UID)</span>
        <div class="copiar"><code>${esc(ui.usuario?.uid)}</code><button class="ib" data-accion="copiar" data-texto="${esc(ui.usuario?.uid)}" aria-label="Copiar">${ic('copiar')}</button></div></label>
      <button class="link bad" data-accion="salir">${ic('salir')} Cerrar sesión</button>`;
  }
  return `<div class="card pad">${cuerpo}</div>
    <div class="secc"><h3>Cómo funciona</h3></div>
    <div class="card"><ol class="pasos">
      <li><span class="rt"><b style="white-space:normal">El banco te manda un correo por cada compra</b></span></li>
      <li><span class="rt"><b style="white-space:normal">Un script en tu Gmail lo lee cada 5 minutos</b><small>Solo los correos de tus bancos</small></span></li>
      <li><span class="rt"><b style="white-space:normal">La compra aparece aquí con su tarjeta y categoría</b><small>Lo dudoso queda marcado para revisar</small></span></li>
    </ol></div>`;
}

function noLeidos() {
  const nl = lista('noLeidos').sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `
    <p class="mu" style="margin:0 4px 14px">Llegaron de un banco pero no parecen una compra, o tienen un formato nuevo. Si alguno sí era una compra, anótala con + y comparte el ejemplo para mejorar el lector.</p>
    <div class="card">${nl.length ? nl.slice(0, 30).map(n => `<div class="row">${tile('correo')}<span class="rt"><b>${esc(n.asunto)}</b><small>${fechaCorta(n.fecha)} · ${esc(n.de)}</small><small style="white-space:normal">${esc((n.texto || '').slice(0, 160))}…</small></span></div>`).join('') : vacio('bandeja', 'Nada pendiente')}</div>
    ${nl.length ? `<button class="btn sec ancho" style="margin-top:14px" data-accion="borrar-noleidos">${ic('borrar')} Limpiar lista</button>` : ''}`;
}

function apariencia() {
  const t = temaGuardado();
  const op = (v, icono, texto) => `<button class="${t === v ? 'on' : ''}" data-accion="tema" data-tema="${v}">${ic(icono)}${texto}</button>`;
  return `<div class="card pad">
      <b>Tema</b>
      <small class="mu" style="margin-bottom:12px">Automático sigue el modo de tu teléfono.</small>
      <div class="temas">${op('auto', 'auto', 'Automático')}${op('claro', 'sol', 'Claro')}${op('oscuro', 'luna', 'Oscuro')}</div>
    </div>
    <div class="card pad">
      <label class="campo" style="margin:0"><span>¿Cómo te llamas?</span>${entrada('', ajustes().nombre || '', { ph: 'Para saludarte en el inicio', extra: 'data-ajuste="nombre"' })}</label>
    </div>`;
}

function respaldo() {
  return `<div class="card pad">
      <b>Copia de tus datos</b>
      <small class="mu" style="margin-bottom:14px">${ui.nube === 'conectado' ? 'Con la nube conectada tus datos ya están respaldados. ' : ''}Descarga un archivo con todo y restáuralo cuando quieras.</small>
      <div class="tc-acc">
        <button class="btn sm" data-accion="exportar">${ic('descargar')} Descargar</button>
        <label class="btn sm sec">${ic('subir')} Restaurar<input type="file" accept="application/json,.json" data-accion-archivo="importar" hidden></label>
      </div>
    </div>
    <div class="card pad">
      <b class="bad">Borrar todos los datos</b>
      <small class="mu" style="margin-bottom:14px">Tarjetas, préstamos, movimientos y ajustes. No se puede deshacer.</small>
      <button class="btn sm peligro" data-accion="borrar-todo">${ic('borrar')} Borrar todo</button>
    </div>`;
}

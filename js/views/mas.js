import { ui, esc, ic, tile, top, vacio, lin, entrada, montoGrande, temaGuardado } from '../ui.js';
import { lista, ajustes } from '../store.js';
import { movs, cuentas, reglas, recurrentes, nombreCuenta, nombreBanco } from '../consultas.js';
import { CATEGORIAS, categoria } from '../domain/categorias.js';
import { estadoPresupuestos, proximaFechaRecurrente, totalGastado } from '../domain/resumen.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, mesDe, nombreMes, fechaCorta } from '../domain/fechas.js';

const SUBS = {
  presupuesto: ['Presupuesto', presupuesto],
  fijos: ['Pagos fijos', fijos],
  cuentas: ['Cuentas y efectivo', cuentasHTML],
  reglas: ['Reglas de categorías', reglasHTML],
  conexion: ['Conexión con Gmail', conexion],
  noleidos: ['Correos sin leer', noLeidos],
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
      ${fila('fijos', 'repetir', 'Pagos fijos', `${recurrentes().length || 'Ninguno'} · se anotan solos cada mes`)}
      ${fila('cuentas', 'cartera', 'Cuentas y efectivo', `${cuentas().length} cuenta${cuentas().length > 1 ? 's' : ''}`)}
      ${fila('reglas', 'regla', 'Reglas de categorías', `${reglas().length} propia${reglas().length === 1 ? '' : 's'} · más los comercios comunes`)}
    </div>
    <div class="grupo-t">Automatización</div>
    <div class="card">
      ${fila('conexion', conectado ? 'nube' : 'correo', 'Conexión con Gmail', conectado ? `Conectado como ${esc(ui.usuario?.correo || '')}` : 'Registra solas tus compras con tarjeta')}
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

function cuentasHTML() {
  return `
    <p class="mu" style="margin:0 4px 14px">Desde dónde pagas lo que no va a tarjeta de crédito. Si agregas los últimos 4 de tu tarjeta de débito, también se reconocen sus correos.</p>
    <div class="card">${cuentas().map(c => `<button class="row" data-accion="modal" data-tipo="cuenta" data-id="${c.id}">
      ${tile(c.tipo === 'efectivo' ? 'billete' : 'cartera')}
      <span class="rt"><b>${esc(c.nombre)}</b><small>${c.tipo === 'efectivo' ? 'Efectivo' : esc(nombreBanco(c.banco))}${c.ultimos4 ? ` · débito ···${esc(c.ultimos4)}` : ''}</small></span>
      <span class="mu">${ic('chevron-right')}</span>
    </button>`).join('')}</div>
    <button class="btn ancho" style="margin-top:14px" data-accion="modal" data-tipo="cuenta">${ic('plus')} Agregar cuenta</button>`;
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

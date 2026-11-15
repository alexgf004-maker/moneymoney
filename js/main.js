// Punto de entrada: carga los datos, conecta la nube (si está configurada) y atiende los toques y formularios.

import * as store from './store.js';
import { ui, aviso, aplicarTema } from './ui.js';
import { montar, render, renderVista, renderModal } from './views/render.js';
import { moverMes } from './views/movimientos.js';
import { FIREBASE, VAPID } from './config.js';
import { iniciarFirebase, entrarConGoogle, salir, activarNotificaciones, avisoDePrueba } from './firebase.js';
import { procesarEntrante, procesarEstado, esDuplicado } from './domain/entrantes.js';
import { recurrentesPendientes, proximosPagos } from './domain/resumen.js';
import { normalizar } from './domain/categorias.js';
import { estadoTarjeta, movimientoDeAjuste, ultimoCorte } from './domain/tarjetas.js';
import { saldoCuenta } from './domain/cuentas.js';
import { leerMonto, r2 } from './domain/dinero.js';
import { hoyISO } from './domain/fechas.js';
import { nombreCuenta, estadosDe, estadoDe, tarjetas, prestamos, recurrentes, movs } from './consultas.js';
import { datosEjemplo } from './demo.js';

const num = v => (v === '' || v === null || v === undefined ? null : leerMonto(v));
const entero = v => (v === '' || v == null ? null : parseInt(v, 10));

// ---------- Procesos automáticos ----------

// Pasa lo que dejó el script de Gmail a movimientos, con tarjeta y categoría
function procesarEntrantes() {
  const entrantes = store.lista('entrantes');
  if (!entrantes.length) return 0;
  const cuentas = store.lista('cuentas');
  const tarjetas = [...store.lista('tarjetas'), ...cuentas.filter(c => c.ultimos4)];
  const reglas = store.lista('reglas');
  const nuevos = [];
  const estados = [];
  for (const e of entrantes) {
    if (e.tipo === 'estado') { if (e.fechaCorte && e.contado != null) estados.push(procesarEstado(e)); continue; }
    if (!(e.monto > 0)) continue;
    const mov = procesarEntrante(e, { tarjetas, reglas, cuentas });
    if (store.obtener('movimientos', mov.id) || esDuplicado(mov, [...store.lista('movimientos'), ...nuevos])) continue;
    nuevos.push({ ...mov, creado: Date.now() });
  }
  store.guardarVarios('movimientos', nuevos, { silencioso: true });
  store.guardarVarios('estados', estados, { silencioso: true });
  store.borrarVarios('entrantes', entrantes.map(e => e.id), { silencioso: true });
  return nuevos.length;
}

// Anota los pagos fijos que ya tocaban
function generarFijos() {
  const ids = new Set(Object.keys(store.datos.movimientos));
  const nuevos = recurrentesPendientes(store.lista('recurrentes'), ids, hoyISO()).map(m => ({ ...m, creado: Date.now() }));
  if (nuevos.length) store.guardarVarios('movimientos', nuevos, { silencioso: true });
  return nuevos.length;
}

function procesos() {
  const n = procesarEntrantes();
  generarFijos();
  if (n) aviso(`${n} movimiento${n > 1 ? 's' : ''} nuevo${n > 1 ? 's' : ''} desde tus correos`);
}

// ---------- Ventanas ----------

function abrir(tipo, datos = {}) {
  ui.modal = { tipo, ...datos };
  renderModal();
}

function cerrar() {
  ui.modal = null;
  renderModal();
}

function irA(vista, { sub = null, tab = null } = {}) {
  ui.vista = vista;
  ui.sub = vista === 'mas' ? sub : null;
  if (tab) ui.deudasTab = tab;
  renderVista();
  window.scrollTo(0, 0);
}

// ---------- Toques ----------

const ACCIONES = {
  ir: d => irA(d.vista, { sub: d.sub, tab: d.tab }),
  sub: d => irA('mas', { sub: d.sub }),
  atras: () => irA(ui.vista),
  'tab-deudas': d => { ui.deudasTab = d.tab; renderVista(); },
  modal: d => abrir(d.tipo, { id: d.id || null, mov: d.mov || null, pre: d.pre || null }),
  cerrar,
  'cerrar-fondo': cerrar,
  pagar: d => abrir('pagar', { id: d.id }),
  'ajustar-corte': d => {
    const t = store.obtener('tarjetas', d.id);
    const c = t && estadoDe(t).conciliacion;
    if (!c || !c.diferencia) return;
    store.guardar('movimientos', { ...movimientoDeAjuste(t, c), creado: Date.now() });
    aviso(`Ajustado: se agregó un ${c.diferencia > 0 ? 'cargo' : 'crédito'} de $${Math.abs(c.diferencia).toFixed(2)}`);
  },
  'anotar-revision': d => abrir('movimiento', { revision: d.id }),
  // Notificaciones: se activan por teléfono (cada uno guarda su token); qué avisar se guarda en los ajustes
  'activar-notif': async () => {
    try {
      aviso('Activando…');
      const id = await activarNotificaciones(VAPID);
      try { localStorage.setItem('moneymoney:notif', id); } catch { /* sin almacenamiento */ }
      if (!store.ajustes().notif) store.guardarAjustes({ notif: { pagos: true, compras: true, correo: true } });
      programarAgenda();
      renderVista();
      aviso('Avisos activados en este teléfono');
    } catch (e) {
      aviso(e.message || 'No se pudieron activar los avisos', 'error');
    }
  },
  'probar-notif': () => avisoDePrueba().catch(() => aviso('Primero activa los avisos', 'error')),
  'notif-pref': d => {
    const actual = { pagos: true, compras: true, correo: true, ...(store.ajustes().notif || {}) };
    store.guardarAjustes({ notif: { ...actual, [d.clave]: !actual[d.clave] } });
  },
  // Suscripciones: marcar para cancelar (o desmarcar) y quitar las que no son suscripciones
  'sus-cancelar': d => {
    const marcas = { ...(store.ajustes().suscripciones || {}) };
    marcas[d.clave] = { ...(marcas[d.clave] || {}), cancelar: !marcas[d.clave]?.cancelar };
    store.guardarAjustes({ suscripciones: marcas });
  },
  'sus-ignorar': d => {
    const marcas = { ...(store.ajustes().suscripciones || {}), [d.clave]: { ignorar: true } };
    store.guardarAjustes({ suscripciones: marcas });
    aviso('Quitada de suscripciones');
  },
  'borrar-plan': d => {
    const t = store.obtener('tarjetas', d.tarjeta);
    if (!t || !confirm('¿Borrar esta compra en cuotas?')) return;
    const planes = { ...(t.planes || {}) };
    delete planes[d.id];
    store.guardar('tarjetas', { ...t, planes });
    // Si venía de una compra anotada, esa compra vuelve a contar completa en la tarjeta
    const compras = store.lista('movimientos').filter(m => m.plan === d.id).map(m => ({ ...m, plan: null }));
    if (compras.length) store.guardarVarios('movimientos', compras);
    cerrar();
    aviso('Borrado');
  },
  'filtro-revision': d => { ui.filtroRevision = d.valor; renderVista(); },
  mes: d => { if (ui.filtro === 'revisar') ui.filtro = 'todos'; moverMes(Number(d.dir)); renderVista(); },
  filtro: d => { ui.filtro = d.valor; renderVista(); },
  'quitar-cuenta': () => { ui.filtroCuenta = ''; renderVista(); },
  'ver-revisar': () => { ui.filtro = 'revisar'; ui.filtroCuenta = ''; irA('movimientos'); },
  'ver-categoria': d => { ui.filtro = d.id; ui.filtroCuenta = ''; irA('movimientos'); },
  'ver-cuenta': d => { ui.filtroCuenta = d.id; ui.filtro = 'todos'; irA('movimientos'); },
  tema: d => { aplicarTema(d.tema); renderVista(); },
  'poner-monto': (d, el) => { el.closest('form').monto.value = d.monto; },
  borrar: d => {
    if (!confirm('¿Borrar? No se puede deshacer.')) return;
    store.borrar(d.col, d.id);
    cerrar();
    aviso('Borrado');
  },
  entrar: () => entrarConGoogle().catch(e => aviso(`No se pudo entrar: ${e.message}`, 'error')),
  salir: () => salir(),
  copiar: d => navigator.clipboard?.writeText(d.texto).then(() => aviso('Copiado')),
  exportar: () => {
    const blob = new Blob([store.exportar()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `moneymoney-${hoyISO()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  },
  'borrar-todo': () => {
    if (!confirm('¿Borrar TODOS tus datos (tarjetas, préstamos, movimientos)? Descarga una copia antes si la quieres.')) return;
    store.borrarTodo();
    aviso('Datos borrados');
  },
  'borrar-noleidos': () => store.borrarVarios('noLeidos', store.lista('noLeidos').map(n => n.id)),
  'datos-ejemplo': () => {
    const d = datosEjemplo();
    for (const [col, objs] of Object.entries(d)) store.guardarVarios(col, objs, { silencioso: true });
    store.guardarAjustes({ ejemplo: true });
    aviso('Datos de ejemplo cargados. Se borran en Más, Respaldo.');
  },
};

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-accion]');
  if (!el || el.tagName === 'INPUT') return;
  // El fondo de la ventana solo cierra si se toca el fondo mismo, no algo dentro de la ventana
  if (el.dataset.accion === 'cerrar-fondo' && ev.target !== el) return;
  const fn = ACCIONES[el.dataset.accion];
  if (fn) { ev.preventDefault(); fn(el.dataset, el, ev); }
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && ui.modal) cerrar();
});

// ---------- Cambios en campos ----------

let esperaBusqueda;
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.filtro === 'busqueda') {
    clearTimeout(esperaBusqueda);
    esperaBusqueda = setTimeout(() => {
      ui.busqueda = el.value;
      renderVista();
      const nuevo = document.querySelector('[data-filtro="busqueda"]');
      nuevo?.focus();
      nuevo?.setSelectionRange(nuevo.value.length, nuevo.value.length);
    }, 250);
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  const d = el.dataset;
  if (d.accion === 'notif-pref') {
    ACCIONES['notif-pref'](d);
  } else if (d.ajuste) {
    store.guardarAjustes({ [d.ajuste]: el.value.trim() });
  } else if (d.ajusteNum) {
    const v = leerMonto(el.value);
    if (v > 0) store.guardarAjustes({ [d.ajusteNum]: v });
  } else if (d.sim) {
    ui.simExtra[d.sim] = Math.max(0, leerMonto(el.value));
    renderVista();
  } else if (el.hasAttribute('data-plan')) {
    ui.presupuestoPlan = Math.max(0, leerMonto(el.value));
    store.guardarAjustes({ presupuestoDeudas: ui.presupuestoPlan });
  } else if (d.presupuesto) {
    const limite = leerMonto(el.value);
    if (limite > 0) store.guardar('presupuestos', { id: d.presupuesto, limite });
    else store.borrar('presupuestos', d.presupuesto);
  } else if (el.name === 'tipo' && el.form?.dataset.tipo !== undefined) {
    el.form.dataset.tipo = el.value;
  } else if (d.accionArchivo === 'importar' && el.files?.[0]) {
    el.files[0].text().then(t => {
      if (!confirm('Esto reemplaza todos tus datos actuales por los del archivo. ¿Seguir?')) return;
      store.importar(t);
      aviso('Copia restaurada');
    }).catch(e => aviso(e.message, 'error'));
  }
});

// ---------- Formularios ----------

// Pone la categoría de la regla a los movimientos cuyo comercio contiene el patrón
function aplicarRegla(regla) {
  const patron = normalizar(regla.patron);
  const cambiados = store.lista('movimientos')
    .filter(m => (m.tipo === 'gasto' || m.tipo === 'reembolso') && m.categoriaId !== regla.categoriaId && normalizar(m.comercio).includes(patron))
    .map(m => ({ ...m, categoriaId: regla.categoriaId, revisar: m.revisar && !m.cuentaId }));
  store.guardarVarios('movimientos', cambiados, { silencioso: true });
  return cambiados.length;
}

const FORMULARIOS = {
  movimiento(f, form) {
    const tipo = f.tipo;
    const monto = num(f.monto);
    if (!monto || monto <= 0) return 'Escribe el monto';
    const id = form.dataset.id || store.nuevoId('m');
    const previo = store.obtener('movimientos', id);
    const base = { ...(previo || { origen: 'manual', creado: Date.now() }), id, tipo, monto, fecha: f.fecha || hoyISO(), nota: f.nota || '', revisar: false };
    let mov;
    if (tipo === 'pago') {
      if (!f.deuda) return 'Elige la deuda';
      mov = { ...base, cuentaId: f.deuda, desdeId: f.desdeId, extra: !!f.extra && !!store.obtener('prestamos', f.deuda), categoriaId: null, comercio: `Pago ${nombreCuenta(f.deuda)}` };
    } else if (tipo === 'ingreso') {
      mov = { ...base, cuentaId: f.cuentaIngreso, categoriaId: f.categoriaIngreso || 'salario', comercio: f.comercio || 'Ingreso', desdeId: null, extra: false };
    } else {
      mov = { ...base, cuentaId: f.cuentaGasto, categoriaId: f.categoriaId || 'otros', comercio: f.comercio || '', desdeId: null, extra: false };
      // Compra a tasa cero: la tarjeta no carga el monto completo, sino una cuota en cada corte
      const t = store.obtener('tarjetas', f.cuentaGasto);
      if (tipo === 'gasto' && f.tasaCero && !previo?.plan) {
        if (!t) return 'Las compras en cuotas son con tarjeta de crédito: elige la tarjeta en "Pagado con"';
        const meses = entero(f.meses) || 6;
        const planId = store.nuevoId('q');
        const plan = { id: planId, nombre: mov.comercio || 'Compra en cuotas', tipo: 'tasa0', cuota: r2(monto / meses), total: meses, cobradas: 0, corteRef: ultimoCorte(t, mov.fecha) };
        store.guardar('tarjetas', { ...t, planes: { ...(t.planes || {}), [planId]: plan } });
        mov.plan = planId;
      }
    }
    store.guardar('movimientos', mov);
    if (f.crearRegla && f.patron && tipo !== 'pago') {
      const regla = { id: store.nuevoId('r'), patron: f.patron, categoriaId: mov.categoriaId };
      store.guardar('reglas', regla);
      const n = aplicarRegla(regla);
      return { ok: `Guardado. Regla creada${n ? ` y aplicada a ${n} movimiento${n > 1 ? 's' : ''} más` : ''}.` };
    }
  },

  plan(f, form) {
    const t = store.obtener('tarjetas', form.dataset.tarjeta);
    if (!t) return 'No encontré la tarjeta';
    const cuota = num(f.cuota), total = entero(f.total), cobradas = entero(f.cobradas) ?? 0;
    if (!(cuota > 0) || !(total > 0)) return 'Escribe la cuota y el total de cuotas';
    if (cobradas < 0 || cobradas > total) return 'Las cuotas cobradas deben estar entre 0 y el total';
    const id = form.dataset.id || store.nuevoId('q');
    // Se cuenta desde el último corte: las cuotas cobradas incluyen la de ese estado de cuenta
    const plan = { id, nombre: f.nombre.trim(), tipo: f.tipo || 'tasa0', cuota, total, cobradas, corteRef: estadoDe(t).ultimoCorte, tasaAnual: num(f.tasaAnual), fueraDelLimite: f.tipo === 'extra' && !!f.fueraDelLimite };
    const cambios = { planes: { ...(t.planes || {}), [id]: plan } };
    store.guardar('tarjetas', { ...t, ...cambios });
  },

  tarjeta(f, form) {
    if (!/^\d{4}$/.test(f.ultimos4)) return 'Los últimos 4 dígitos deben ser 4 números';
    const diaCorte = entero(f.diaCorte), diaPago = entero(f.diaPago);
    if (!(diaCorte >= 1 && diaCorte <= 31 && diaPago >= 1 && diaPago <= 31)) return 'Revisa los días de corte y de pago (1 a 31)';
    const hoy = hoyISO();
    const id = form.dataset.id || store.nuevoId('t');
    const previo = store.obtener('tarjetas', id);
    const t = {
      ...(previo || {}), id, banco: f.banco, nombre: f.nombre.trim(), ultimos4: f.ultimos4, limite: num(f.limite) || 0,
      diaCorte, diaPago, tasaAnual: num(f.tasaAnual) || 0, minimoPct: num(f.minimoPct) ?? 5,
    };
    const saldoHoy = num(f.saldoHoy) ?? 0;
    if (!previo) {
      Object.assign(t, { saldoInicial: saldoHoy, fechaSaldo: hoy, saldoCorteInicial: num(f.saldoCorte) ?? saldoHoy, pagadoCorteInicial: num(f.pagadoCorte) || 0 });
    } else {
      const e = estadoTarjeta(previo, store.lista('movimientos'), hoy, estadosDe(previo));
      if (Math.abs(e.saldoActual - saldoHoy) > 0.005) {
        Object.assign(t, { saldoInicial: saldoHoy, fechaSaldo: hoy, saldoCorteInicial: e.saldoCorte, pagadoCorteInicial: e.pagadoDelCorte });
      }
    }
    store.guardar('tarjetas', t);
    // Movimientos de correo que esperaban esta tarjeta
    const huerfanos = store.lista('movimientos').filter(m => !m.cuentaId && m.ultimos4 === t.ultimos4);
    if (huerfanos.length) store.guardarVarios('movimientos', huerfanos.map(m => ({ ...m, cuentaId: t.id, revisar: m.tipo !== 'pago' && m.categoriaId === 'otros' })));
  },

  prestamo(f, form) {
    const id = form.dataset.id || store.nuevoId('p');
    const p = {
      ...(store.obtener('prestamos', id) || {}), id, banco: f.banco, nombre: f.nombre.trim(), monto: num(f.monto),
      tasaAnual: num(f.tasaAnual) || 0, plazoMeses: entero(f.plazoMeses), cuota: num(f.cuota), fechaPrimerPago: f.fechaPrimerPago,
    };
    if (!p.monto || !p.plazoMeses || !p.fechaPrimerPago) return 'Completa monto, plazo y fecha del primer pago';
    store.guardar('prestamos', p);
  },

  pago(f, form) {
    const monto = num(f.monto);
    if (!monto || monto <= 0) return 'Escribe el monto';
    const deuda = form.dataset.id;
    store.guardar('movimientos', {
      id: store.nuevoId('m'), tipo: 'pago', monto, fecha: f.fecha || hoyISO(), cuentaId: deuda, desdeId: f.desdeId,
      extra: !!f.extra, comercio: `Pago ${nombreCuenta(deuda)}`, categoriaId: null, origen: 'manual', creado: Date.now(), revisar: false,
    });
    return { ok: 'Pago registrado' };
  },

  recurrente(f, form) {
    const id = form.dataset.id || store.nuevoId('f');
    const previo = store.obtener('recurrentes', id);
    const dia = entero(f.dia);
    if (!(dia >= 1 && dia <= 31)) return 'El día debe estar entre 1 y 31';
    const tipo = f.tipo;
    const cuentaId = tipo === 'pago' ? f.deuda : tipo === 'ingreso' ? f.cuentaIngreso : f.cuentaGasto;
    if (!cuentaId) return tipo === 'pago' ? 'Primero agrega la tarjeta o el préstamo' : 'Elige la cuenta';
    store.guardar('recurrentes', {
      id, nombre: f.nombre.trim(), monto: num(f.monto), dia, tipo, cuentaId, desdeId: tipo === 'pago' ? f.desdeId : null,
      categoriaId: tipo === 'gasto' ? f.categoriaId || 'otros' : tipo === 'ingreso' ? 'salario' : null,
      activo: !!f.activo, desde: previo?.desde || hoyISO(), variable: tipo === 'ingreso' && !!f.variable,
    });
    generarFijos();
  },

  cuenta(f, form) {
    const id = form.dataset.id || store.nuevoId('c');
    const previo = store.obtener('cuentas', id) || {};
    const c = { ...previo, id, nombre: f.nombre.trim(), tipo: f.tipo, banco: f.banco || null, ultimos4: f.ultimos4 || null, cuenta4: f.cuenta4 || null };
    // Saldo de hoy: si cambió (o es la primera vez), se toma como nuevo punto de partida
    const saldoHoy = num(f.saldoHoy);
    if (saldoHoy != null && saldoHoy !== saldoCuenta(previo, store.lista('movimientos'), hoyISO())) Object.assign(c, { saldoInicial: saldoHoy, fechaSaldo: hoyISO() });
    store.guardar('cuentas', c);
  },

  regla(f, form) {
    const id = form.dataset.id || store.nuevoId('r');
    const regla = { id, patron: f.patron.trim().toUpperCase(), categoriaId: f.categoriaId || 'otros' };
    store.guardar('reglas', regla);
    if (f.aplicar) {
      const n = aplicarRegla(regla);
      if (n) return { ok: `Regla aplicada a ${n} movimiento${n > 1 ? 's' : ''}` };
    }
  },
};

document.addEventListener('submit', ev => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fd = new FormData(form);
  const f = Object.fromEntries(fd.entries());
  const res = FORMULARIOS[form.dataset.form]?.(f, form);
  if (typeof res === 'string') { aviso(res, 'error'); return; }
  cerrar();
  renderVista();
  aviso(res?.ok || 'Guardado');
});

// ---------- Arranque ----------

aplicarTema();
store.cargarLocal();
store.alCambiar(origen => {
  if (origen === 'remoto') procesos();
  renderVista();
  programarAgenda();
});

// Agenda de pagos en la nube: el script de Gmail la lee cada mañana para mandar los avisos.
// Se publica unos segundos después del último cambio, y solo si cambió.
let ultimaAgenda = '';
let esperaAgenda;
function programarAgenda() {
  clearTimeout(esperaAgenda);
  esperaAgenda = setTimeout(publicarAgenda, 2000);
}
function publicarAgenda() {
  if (ui.nube !== 'conectado') return;
  const hoy = hoyISO();
  const pagos = proximosPagos({ tarjetas: tarjetas(), prestamos: prestamos(), recurrentes: recurrentes(), movs: movs(), estadosDe }, hoy, 30)
    .map(p => ({ id: p.id, titulo: p.titulo, fecha: p.fecha, monto: p.monto, minimo: p.minimo ?? null, tipo: p.tipo, vencido: !!p.vencido }));
  const json = JSON.stringify(pagos);
  if (json === ultimaAgenda) return;
  ultimaAgenda = json;
  store.publicar('agenda', { actualizado: new Date().toISOString(), hoy, pagos });
}
montar();
procesos();
render();

// Desde un aviso de pago ("Ver pagos"): abrir en Deudas
if (new URLSearchParams(location.search).get('ir') === 'deudas') {
  irA('deudas', { tab: 'tarjetas' });
  history.replaceState(null, '', location.pathname);
}
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.ir) irA(e.data.ir, { tab: 'tarjetas' }); });

// Las pruebas automáticas corren sin nube (window.__SIN_NUBE__)
if (FIREBASE && !window.__SIN_NUBE__) {
  ui.nube = 'cargando';
  iniciarFirebase(FIREBASE, {
    alUsuario(usuario, escritor) {
      ui.usuario = usuario;
      ui.nube = usuario ? 'conectado' : 'sin-sesion';
      store.conectarRemoto(escritor);
      renderVista();
      programarAgenda();
    },
    alDatos(valor, primera) {
      // Primera vez en la nube con datos ya en el teléfono: se suben en vez de borrarlos
      if (primera && !store.hayDatos(valor) && store.hayDatos(store.datos)) { store.subirTodo(); return; }
      store.recibirRemoto(valor);
    },
  }).catch(e => { console.error(e); ui.nube = 'sin-configurar'; renderVista(); aviso('No se pudo conectar con la nube', 'error'); });
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Si la app queda abierta de un día para otro, que anote los fijos del día nuevo
let dia = hoyISO();
setInterval(() => {
  if (hoyISO() !== dia) { dia = hoyISO(); generarFijos(); renderVista(); }
}, 60000);


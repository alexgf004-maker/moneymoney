import { ui, esc, campo, entrada, selector } from '../ui.js';
import { obtener } from '../store.js';
import { movs, opcionesPagoCon, opcionesDeuda, opcionesCuentas, BANCOS } from '../consultas.js';
import { CATEGORIAS, INGRESOS, patronSugerido } from '../domain/categorias.js';
import { estadoTarjeta } from '../domain/tarjetas.js';
import { estadoPrestamo, tablaPagos, partesCuota } from '../domain/prestamo.js';
import { dinero } from '../domain/dinero.js';
import { hoyISO, fechaCorta } from '../domain/fechas.js';

export function vistaModal() {
  const m = ui.modal;
  if (!m) return '';
  const fn = { movimiento, tarjeta, prestamo, pagar, recurrente, cuenta, regla, tabla }[m.tipo];
  if (!fn) return '';
  const { titulo, cuerpo } = fn(m);
  return `<div class="modal-fondo" data-accion="cerrar-fondo">
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="modal-cabeza"><h2>${esc(titulo)}</h2><button class="icono-boton" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
      <div class="modal-cuerpo">${cuerpo}</div>
    </div>
  </div>`;
}

const pie = (borrar = '') => `<div class="modal-pie">${borrar}<button type="submit" class="boton">Guardar</button></div>`;
const botonBorrar = (col, id) => (id ? `<button type="button" class="boton secundario malo" data-accion="borrar" data-col="${col}" data-id="${id}">Borrar</button>` : '');

function chipsCategorias(nombre, lista, valor) {
  return `<div class="chips">${lista.map(c => `<label class="chip-radio"><input type="radio" name="${nombre}" value="${c.id}" ${c.id === valor ? 'checked' : ''}><span>${c.icono} ${esc(c.nombre.split(' (')[0])}</span></label>`).join('')}</div>`;
}

function movimiento({ id, cuentaId: cuentaSugerida }) {
  const m = id ? obtener('movimientos', id) : null;
  const tipo = m?.tipo || 'gasto';
  const cuentaGasto = m && tipo !== 'pago' ? m.cuentaId : cuentaSugerida || 'efectivo';
  const sugerido = m ? patronSugerido(m.comercio) : '';
  const cuerpo = `<form data-form="movimiento" data-tipo="${tipo}" data-id="${id || ''}" data-categoria-original="${m?.categoriaId || ''}">
    ${m?.revisar ? `<div class="banda banda-info">🔎 ${m.origen === 'correo' ? 'Llegó de un correo del banco. ' : ''}Revisa la tarjeta y la categoría y guarda para confirmarlo.</div>` : ''}
    <div class="segmentos">
      ${[['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['pago', 'Pago a deuda'], ['reembolso', 'Devolución']].map(([v, t]) => `<label><input type="radio" name="tipo" value="${v}" ${tipo === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
    <label class="monto-grande"><span>$</span>${entrada('monto', m?.monto ?? '', { tipo: 'number', paso: '0.01', min: 0, ph: '0.00', extra: 'autofocus' })}</label>
    <div class="solo-gasto solo-ingreso solo-reembolso">${campo('Descripción o comercio', entrada('comercio', m?.comercio || '', { ph: 'Ej. Super Selectos' }))}</div>
    <div class="solo-gasto solo-reembolso">${campo('Categoría', chipsCategorias('categoriaId', CATEGORIAS, m?.categoriaId || 'super'))}</div>
    <div class="solo-ingreso">${campo('Tipo de ingreso', chipsCategorias('categoriaIngreso', INGRESOS, m?.categoriaId || 'salario'))}</div>
    <div class="solo-gasto solo-reembolso">${campo('Pagado con', selector('cuentaGasto', opcionesPagoCon(), cuentaGasto))}</div>
    <div class="solo-ingreso">${campo('Entró a', selector('cuentaIngreso', opcionesCuentas(), m?.tipo === 'ingreso' ? m.cuentaId : 'efectivo'))}</div>
    <div class="solo-pago">
      ${campo('Deuda que pagaste', selector('deuda', opcionesDeuda(), m?.tipo === 'pago' ? m.cuentaId : opcionesDeuda()[0]?.[0]))}
      ${campo('Pagaste desde', selector('desdeId', opcionesCuentas(), m?.desdeId || 'efectivo'))}
      <label class="interruptor"><input type="checkbox" name="extra" ${m?.extra ? 'checked' : ''}> Es un abono extra a capital (solo préstamos)</label>
    </div>
    ${campo('Fecha', entrada('fecha', m?.fecha || hoyISO(), { tipo: 'date', max: hoyISO() }))}
    ${campo('Nota (opcional)', entrada('nota', m?.nota || ''))}
    ${m && tipo !== 'pago' && sugerido ? `<div class="solo-gasto solo-reembolso"><label class="interruptor"><input type="checkbox" name="crearRegla"> Usar siempre esta categoría para “${esc(sugerido)}”</label><input type="hidden" name="patron" value="${esc(sugerido)}"></div>` : ''}
    ${m?.origen === 'correo' ? `<small class="tenue">Del correo: ${esc(m.banco || '')} ${m.ultimos4 ? `···${esc(m.ultimos4)}` : ''}</small>` : ''}
    ${pie(botonBorrar('movimientos', id))}
  </form>`;
  return { titulo: m ? 'Movimiento' : 'Anotar movimiento', cuerpo };
}

function tarjeta({ id }) {
  const t = id ? obtener('tarjetas', id) : null;
  const e = t ? estadoTarjeta(t, movs(), hoyISO()) : null;
  const cuerpo = `<form data-form="tarjeta" data-id="${id || ''}">
    ${campo('Banco', selector('banco', BANCOS, t?.banco || 'agricola'))}
    ${campo('Nombre para reconocerla', entrada('nombre', t?.nombre || '', { req: true, ph: 'Ej. Visa Oro Agrícola' }))}
    <div class="dos-col">
      ${campo('Últimos 4 dígitos', entrada('ultimos4', t?.ultimos4 || '', { req: true, ph: '1234', extra: 'inputmode="numeric" pattern="\\d{4}" maxlength="4"' }), 'Así se reconocen los correos')}
      ${campo('Límite de crédito', entrada('limite', t?.limite ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true }))}
    </div>
    <div class="dos-col">
      ${campo('Día de corte', entrada('diaCorte', t?.diaCorte ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
      ${campo('Día límite de pago', entrada('diaPago', t?.diaPago ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
    </div>
    <div class="dos-col">
      ${campo('Tasa de interés anual %', entrada('tasaAnual', t?.tasaAnual ?? '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Ej. 38.5' }), 'Viene en el estado de cuenta')}
      ${campo('Pago mínimo % del saldo', entrada('minimoPct', t?.minimoPct ?? 5, { tipo: 'number', paso: '0.1', min: 0 }), 'Aprox.; suele estar entre 3% y 10%')}
    </div>
    <fieldset class="grupo">
      <legend>${t ? 'Saldo' : 'Cómo está hoy'}</legend>
      ${campo('Saldo actual (lo que debes hoy)', entrada('saldoHoy', e ? e.saldoActual : '', { tipo: 'number', paso: '0.01', req: true }), t ? 'Cámbialo solo si no cuadra con tu banco' : '')}
      ${t ? '' : `
        ${campo('Pago de contado del último estado de cuenta', entrada('saldoCorte', '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Si no lo sabes, deja vacío' }))}
        ${campo('¿Cuánto ya abonaste de ese estado de cuenta?', entrada('pagadoCorte', '', { tipo: 'number', paso: '0.01', min: 0, ph: '0.00' }))}`}
    </fieldset>
    ${pie(botonBorrar('tarjetas', id))}
  </form>`;
  return { titulo: t ? 'Editar tarjeta' : 'Nueva tarjeta', cuerpo };
}

function prestamo({ id }) {
  const p = id ? obtener('prestamos', id) : null;
  const cuerpo = `<form data-form="prestamo" data-id="${id || ''}">
    ${campo('Banco', selector('banco', BANCOS, p?.banco || 'agricola'))}
    ${campo('Nombre', entrada('nombre', p?.nombre || '', { req: true, ph: 'Ej. Préstamo personal' }))}
    <div class="dos-col">
      ${campo('Monto original', entrada('monto', p?.monto ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true }))}
      ${campo('Tasa anual %', entrada('tasaAnual', p?.tasaAnual ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true }))}
    </div>
    <div class="dos-col">
      ${campo('Plazo en meses', entrada('plazoMeses', p?.plazoMeses ?? '', { tipo: 'number', min: 1, req: true }))}
      ${campo('Cuota que pagas', entrada('cuota', p?.cuota ?? '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Se calcula si la dejas vacía' }), 'Con seguros incluidos')}
    </div>
    ${campo('Fecha del primer pago', entrada('fechaPrimerPago', p?.fechaPrimerPago || '', { tipo: 'date', req: true }), 'El día de esta fecha se usa para todas las cuotas')}
    ${pie(botonBorrar('prestamos', id))}
  </form>`;
  return { titulo: p ? 'Editar préstamo' : 'Nuevo préstamo', cuerpo };
}

function pagar({ id }) {
  const hoy = hoyISO();
  const t = obtener('tarjetas', id);
  const p = obtener('prestamos', id);
  let opciones = [];
  let sugerido = '';
  let nombre = '';
  if (t) {
    const e = estadoTarjeta(t, movs(), hoy);
    nombre = `${t.nombre} ···${t.ultimos4}`;
    opciones = [['Pago de contado', e.contadoPendiente], ['Mínimo aprox.', e.minimoPendiente], ['Saldo total', e.saldoActual]].filter(o => o[1] > 0);
    sugerido = e.contadoPendiente || '';
  } else if (p) {
    const e = estadoPrestamo(p, movs(), hoy);
    nombre = p.nombre;
    opciones = [['Cuota', e.cuota]];
    sugerido = e.cuota;
  }
  const cuerpo = `<form data-form="pago" data-id="${id}">
    <p><b>${esc(nombre)}</b></p>
    <div class="chips">${opciones.map(([t2, v]) => `<button type="button" class="chip-boton" data-accion="poner-monto" data-monto="${v}">${t2}<b>${dinero(v)}</b></button>`).join('')}</div>
    <label class="monto-grande"><span>$</span>${entrada('monto', sugerido, { tipo: 'number', paso: '0.01', min: 0, req: true })}</label>
    ${campo('Pagaste desde', selector('desdeId', opcionesCuentas(), 'efectivo'))}
    ${campo('Fecha', entrada('fecha', hoy, { tipo: 'date', max: hoy }))}
    ${p ? `<label class="interruptor"><input type="checkbox" name="extra"> Es un abono extra a capital (además de la cuota)</label>` : ''}
    ${pie()}
  </form>`;
  return { titulo: 'Registrar pago', cuerpo };
}

function recurrente({ id }) {
  const r = id ? obtener('recurrentes', id) : null;
  const tipo = r?.tipo || 'gasto';
  const cuerpo = `<form data-form="recurrente" data-tipo="${tipo}" data-id="${id || ''}">
    <div class="segmentos">
      ${[['gasto', 'Gasto'], ['pago', 'Pago a deuda'], ['ingreso', 'Ingreso']].map(([v, t]) => `<label><input type="radio" name="tipo" value="${v}" ${tipo === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
    ${campo('Nombre', entrada('nombre', r?.nombre || '', { req: true, ph: 'Ej. Netflix, Internet, Salario' }))}
    <div class="dos-col">
      ${campo('Monto', entrada('monto', r?.monto ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true }))}
      ${campo('Día del mes', entrada('dia', r?.dia ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
    </div>
    <div class="solo-gasto">${campo('Categoría', chipsCategorias('categoriaId', CATEGORIAS, r?.categoriaId || 'suscripciones'))}</div>
    <div class="solo-gasto">${campo('Se cobra a', selector('cuentaGasto', opcionesPagoCon(), r?.tipo === 'gasto' ? r.cuentaId : 'efectivo'))}</div>
    <div class="solo-pago">
      ${campo('Deuda', selector('deuda', opcionesDeuda(), r?.tipo === 'pago' ? r.cuentaId : ''))}
      ${campo('Se paga desde', selector('desdeId', opcionesCuentas(), r?.desdeId || 'efectivo'))}
    </div>
    <div class="solo-ingreso">${campo('Entra a', selector('cuentaIngreso', opcionesCuentas(), r?.tipo === 'ingreso' ? r.cuentaId : 'efectivo'))}</div>
    <small class="tenue solo-gasto">Si se cobra a una tarjeta que te manda correos, no lo agregues aquí: ya llegará solo por el correo.</small>
    <label class="interruptor"><input type="checkbox" name="activo" ${r?.activo === false ? '' : 'checked'}> Activo</label>
    ${pie(botonBorrar('recurrentes', id))}
  </form>`;
  return { titulo: r ? 'Pago fijo' : 'Nuevo pago fijo', cuerpo };
}

function cuenta({ id }) {
  const c = id ? obtener('cuentas', id) : null;
  const cuerpo = `<form data-form="cuenta" data-id="${id || ''}">
    ${campo('Nombre', entrada('nombre', c?.nombre || '', { req: true, ph: 'Ej. Ahorro Agrícola' }))}
    ${c?.tipo === 'efectivo' ? '<input type="hidden" name="tipo" value="efectivo">' : `
      ${campo('Banco', selector('banco', BANCOS, c?.banco || 'agricola'))}
      ${campo('Últimos 4 de la tarjeta de débito', entrada('ultimos4', c?.ultimos4 || '', { ph: 'Opcional', extra: 'inputmode="numeric" maxlength="4"' }), 'Para reconocer las compras con débito en los correos')}
      <input type="hidden" name="tipo" value="banco">`}
    ${pie(c?.tipo === 'efectivo' ? '' : botonBorrar('cuentas', id))}
  </form>`;
  return { titulo: c ? 'Cuenta' : 'Nueva cuenta', cuerpo };
}

function regla({ id, patron }) {
  const r = id ? obtener('reglas', id) : null;
  const cuerpo = `<form data-form="regla" data-id="${id || ''}">
    ${campo('Si el comercio contiene', entrada('patron', r?.patron || patron || '', { req: true, ph: 'Ej. SELECTOS' }))}
    ${campo('Categoría', chipsCategorias('categoriaId', CATEGORIAS, r?.categoriaId || 'super'))}
    <label class="interruptor"><input type="checkbox" name="aplicar" checked> Aplicar también a los movimientos que ya tengo</label>
    ${pie(botonBorrar('reglas', id))}
  </form>`;
  return { titulo: r ? 'Regla' : 'Nueva regla', cuerpo };
}

function tabla({ id }) {
  const p = obtener('prestamos', id);
  const hoy = hoyISO();
  const extras = movs().filter(m => m.cuentaId === id && m.tipo === 'pago' && m.extra).map(m => ({ fecha: m.fecha, monto: m.monto }));
  const filas = tablaPagos(p, { extras });
  const { cargos } = partesCuota(p);
  const cuerpo = `<div class="tabla-scroll"><table class="tabla">
    <thead><tr><th>#</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th>${cargos ? '<th>Cargos</th>' : ''}<th>Saldo</th></tr></thead>
    <tbody>${filas.map(f => `<tr class="${f.fecha <= hoy ? 'pagada' : ''}">
      <td>${f.n}</td><td>${fechaCorta(f.fecha)} ${f.fecha.slice(2, 4)}</td><td>${dinero(f.cuota)}</td>
      <td>${dinero(f.capital + f.extra)}${f.extra ? ' *' : ''}</td><td>${dinero(f.interes)}</td>${cargos ? `<td>${dinero(f.cargos)}</td>` : ''}<td>${dinero(f.saldo)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <small class="tenue">Las cuotas en gris ya pasaron. * incluye abono extra. Es un cálculo con la tasa y el plazo que ingresaste; tu banco puede variar por centavos.</small>`;
  return { titulo: `Tabla de pagos · ${p.nombre}`, cuerpo };
}

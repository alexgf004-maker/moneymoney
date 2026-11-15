import { ui, esc, ic, campo, entrada, selector, opciones, marca, titulo } from '../ui.js';
import { obtener } from '../store.js';
import { movs, suscripcionesActuales, opcionesPagoCon, opcionesDeuda, opcionesCuentas, BANCOS, nombreCuenta, estadoDe, tarjetasDetectadas } from '../consultas.js';
import { CATEGORIAS, INGRESOS, patronSugerido } from '../domain/categorias.js';
import { estadoPrestamo, tablaPagos, partesCuota } from '../domain/prestamo.js';
import { saldoCuenta } from '../domain/cuentas.js';
import { dinero } from '../domain/dinero.js';
import { hoyISO, fechaCorta } from '../domain/fechas.js';

// Ventana con forma de hoja que sube desde abajo
export function vistaModal() {
  const m = ui.modal;
  const fn = m && { movimiento, tarjeta, prestamo, pagar, recurrente, cuenta, regla, tabla, plan, compartir }[m.tipo];
  if (!fn) return '';
  const { titulo, cuerpo } = fn(m);
  return `<div class="hoja-fondo" data-accion="cerrar-fondo">
    <div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="hoja-asa"></div>
      <div class="hoja-cab"><h2>${esc(titulo)}</h2><button class="ib chico" data-accion="cerrar" aria-label="Cerrar">${ic('x')}</button></div>
      <div class="hoja-cuerpo">${cuerpo}</div>
    </div>
  </div>`;
}

const pie = (borrar = '', texto = 'Guardar') => `<div class="hoja-pie">${borrar}<button type="submit" class="btn">${ic('check')} ${texto}</button></div>`;
const botonBorrar = (col, id) => (id ? `<button type="button" class="btn peligro" data-accion="borrar" data-col="${col}" data-id="${id}" aria-label="Borrar">${ic('borrar')}</button>` : '');
const cats = lista => lista.map(c => [c.id, c.nombre, c.icono]);
const TIPOS_MOV = [['gasto', 'Gasto', 'cat-compras'], ['ingreso', 'Ingreso', 'ingreso'], ['pago', 'Pago deuda', 'pago'], ['reembolso', 'Devolución', 'devolucion']];

// revision: id de un correo descartado (Más > Correos revisados), para anotarlo a mano con sus datos
function movimiento({ id, mov: tipoInicial, revision }) {
  const r = revision ? obtener('revision', revision) : null;
  const m = id ? obtener('movimientos', id) : r ? { monto: r.monto || 0, fecha: r.fecha, comercio: r.asunto, tipo: 'gasto' } : null;
  const tipo = m?.tipo || tipoInicial || 'gasto';
  const cuentaGasto = m && m.tipo !== 'pago' ? m.cuentaId : 'efectivo';
  const sugerido = m ? patronSugerido(m.comercio) : '';
  const deudas = opcionesDeuda();
  const cuerpo = `<form data-form="movimiento" data-tipo="${tipo}" data-id="${id || ''}">
    ${m?.revisar ? `<div class="aviso-fila" style="margin-top:0">${ic('revisar')}<span class="rt"><b>Revisa y guarda para confirmar</b><small style="white-space:normal">${m.origen === 'correo' ? 'Llegó de un correo del banco. ' : ''}${m.cuentaId ? 'Confirma la categoría.' : 'No reconocí la tarjeta: elige con qué se pagó.'}</small></span></div>` : ''}
    <label class="monto"><span>$</span>${entrada('monto', m && m.monto ? m.monto.toFixed(2) : '', { tipo: 'number', paso: '0.01', min: 0, ph: '0.00', extra: 'aria-label="Monto" data-enfocar' })}</label>
    ${opciones('tipo', TIPOS_MOV, tipo, 'tipos')}
    <div class="solo-gasto solo-ingreso solo-reembolso">${campo('Comercio o descripción', entrada('comercio', m?.comercio || '', { ph: 'Ej. Super Selectos' }))}</div>
    <div class="solo-gasto solo-reembolso">${campo('Categoría', opciones('categoriaId', cats(CATEGORIAS), m?.categoriaId || 'super'))}</div>
    <div class="solo-ingreso">${campo('Tipo de ingreso', opciones('categoriaIngreso', cats(INGRESOS), m?.categoriaId || 'salario'))}</div>
    <div class="solo-gasto solo-reembolso">${campo('Pagado con', selector('cuentaGasto', opcionesPagoCon(), cuentaGasto))}</div>
    <div class="solo-gasto">${m?.plan
      ? `<small class="mu">${ic('calendario')} Compra en cuotas: la tarjeta cobra la cuota en cada corte. Se edita en Deudas, en la tarjeta.</small>`
      : `${marca('tasaCero', 'Compra en cuotas (tasa cero) con tarjeta de crédito')}
        <div class="fila-campos">${campo('Número de cuotas', selector('meses', [3, 6, 9, 10, 12, 18, 24, 36].map(n => [n, `${n} meses`]), 6))}<span></span></div>`}</div>
    <div class="solo-ingreso">${campo('Entró a', selector('cuentaIngreso', opcionesCuentas(), m?.tipo === 'ingreso' ? m.cuentaId : 'efectivo'))}</div>
    <div class="solo-pago">
      ${deudas.length ? campo('Deuda que pagaste', selector('deuda', deudas, m?.tipo === 'pago' ? m.cuentaId : deudas[0][0])) : '<p class="mu">Primero agrega una tarjeta o un préstamo.</p>'}
      ${campo('Pagaste desde', selector('desdeId', opcionesCuentas(), m?.desdeId || 'efectivo'))}
      ${marca('extra', 'Abono extra a capital (solo préstamos)', !!m?.extra)}
    </div>
    <div class="fila-campos">
      ${campo('Fecha', entrada('fecha', m?.fecha || hoyISO(), { tipo: 'date', max: hoyISO() }))}
      ${campo('Nota', entrada('nota', m?.nota || '', { ph: 'Opcional' }))}
    </div>
    ${m && m.tipo !== 'pago' && sugerido ? `<div class="solo-gasto solo-reembolso">${marca('crearRegla', `Usar siempre esta categoría para "${esc(sugerido)}"`)}<input type="hidden" name="patron" value="${esc(sugerido)}"></div>` : ''}
    ${m?.origen === 'correo' ? `<small class="mu">Del correo de ${esc(m.banco || 'tu banco')}${m.ultimos4 ? ` · tarjeta ···${esc(m.ultimos4)}` : ''}</small>` : ''}
    ${pie(botonBorrar('movimientos', id), m?.revisar ? 'Confirmar' : 'Guardar')}
  </form>`;
  return { titulo: id ? 'Movimiento' : 'Anotar', cuerpo };
}

// Compra en cuotas de una tarjeta (tasa cero o extrafinanciamiento). pre: id de la tarjeta
function plan({ id, pre }) {
  const t = obtener('tarjetas', pre);
  const p = id ? t?.planes?.[id] : null;
  const e = p ? estadoDe(t).planes.find(x => x.id === id) : null;
  const tipo = p?.tipo || 'tasa0';
  const cuerpo = `<form data-form="plan" data-id="${id || ''}" data-tarjeta="${esc(pre)}" data-tipo="${tipo}">
    <p class="mu" style="margin:0 0 6px">${esc(t?.nombre || '')} ···${esc(t?.ultimos4 || '')}</p>
    ${opciones('tipo', [['tasa0', 'Tasa cero', 'calendario'], ['extra', 'Extrafinanciamiento', 'banco']], tipo, 'dos-op')}
    ${campo('Qué compraste o para qué fue', entrada('nombre', p?.nombre || '', { req: true, ph: 'Ej. Cocina, Extrafinanciamiento' }))}
    <div class="fila-campos">
      ${campo('Cuota mensual', entrada('cuota', p ? p.cuota.toFixed(2) : '', { tipo: 'number', paso: '0.01', min: 0, req: true, ph: '0.00' }))}
      ${campo('Total de cuotas', entrada('total', p?.total ?? '', { tipo: 'number', min: 1, req: true, ph: 'Ej. 12' }))}
    </div>
    ${campo('¿La pagas con alguien?', opciones('entre', [['1', 'Solo yo'], ['2', 'A mitad'], ['3', 'Entre 3'], ['4', 'Entre 4']], String(p?.entre || 1)), 'Si la pagas con alguien, en tus pagos del mes y en "Estás por terminar" cuenta solo tu parte. La tarjeta sigue con la cuota completa.')}
    ${campo('¿Cuántas cuotas ya te cobraron?', entrada('cobradas', e ? e.cobradasHoy : '', { tipo: 'number', min: 0, req: true, ph: 'Ej. 11' }), 'Contando la de tu último estado de cuenta. Si vas por la 11 de 12, pon 11.')}
    <div class="solo-extra">${marca('fueraDelLimite', 'No ocupa el límite de la tarjeta (es un crédito aparte)', p ? !!p.fueraDelLimite : true)}
      <small class="mu" style="margin:-8px 0 10px">Para saberlo: si límite = saldo + disponible + lo que falta de las compras a tasa cero, sin contar este extrafinanciamiento, márcala.</small></div>
    <div class="solo-extra">${campo('Tasa de interés anual % (opcional)', entrada('tasaAnual', p?.tasaAnual ?? '', { tipo: 'number', paso: '0.01', min: 0 }), 'Solo informativa: la cuota ya incluye el interés')}</div>
    <small class="mu">Lo que falta de esta compra se suma aparte al saldo de la tarjeta, como lo muestra el banco.</small>
    ${pie(id ? `<button type="button" class="btn peligro" data-accion="borrar-plan" data-tarjeta="${esc(pre)}" data-id="${esc(id)}" aria-label="Borrar">${ic('borrar')}</button>` : '')}
  </form>`;
  return { titulo: p ? 'Compra en cuotas' : 'Nueva compra en cuotas', cuerpo };
}

// pre: clave de una tarjeta detectada en los correos ("banco|1234"), para llenar el formulario
function tarjeta({ id, pre }) {
  const t = id ? obtener('tarjetas', id) : null;
  const e = t ? estadoDe(t) : null;
  const d = !t && pre ? tarjetasDetectadas().find(x => x.clave === pre) : null;
  const est = d?.estado;
  const dia = iso => (iso ? Number(iso.slice(8, 10)) : '');
  const v = t || (d ? { banco: d.banco, ultimos4: d.ultimos4, nombre: d.nombre ? titulo(d.nombre) : '', diaCorte: dia(est?.fechaCorte), diaPago: dia(est?.fechaPago) } : {});
  const cuerpo = `<form data-form="tarjeta" data-id="${id || ''}">
    ${est ? `<div class="aviso-fila" style="margin-top:0">${ic('correo')}<span class="rt"><b style="white-space:normal">Datos tomados de tu estado de cuenta</b><small style="white-space:normal">Corte del ${fechaCorta(est.fechaCorte)} · pago de contado ${dinero(est.contado)}. Completa el límite y revisa el saldo.</small></span></div>`
      : d ? `<div class="aviso-fila" style="margin-top:0">${ic('correo')}<span class="rt"><b style="white-space:normal">Encontrada en tus correos</b><small style="white-space:normal">Completa los datos que vienen en tu estado de cuenta.</small></span></div>` : ''}
    ${campo('Banco', selector('banco', BANCOS, v.banco || 'agricola'))}
    ${campo('Nombre para reconocerla', entrada('nombre', v.nombre || '', { req: true, ph: 'Ej. Visa Oro Agrícola' }))}
    <div class="fila-campos">
      ${campo('Últimos 4 dígitos', entrada('ultimos4', v.ultimos4 || '', { req: true, ph: '1234', extra: 'inputmode="numeric" pattern="\\d{4}" maxlength="4"' }))}
      ${campo('Límite', entrada('limite', t?.limite ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true, ph: '0.00' }))}
    </div>
    <div class="fila-campos">
      ${campo('Día de corte', entrada('diaCorte', v.diaCorte ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
      ${campo('Día límite de pago', entrada('diaPago', v.diaPago ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
    </div>
    <div class="fila-campos">
      ${campo('Interés anual %', entrada('tasaAnual', t?.tasaAnual ?? '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Ej. 38.5' }))}
      ${campo('Mínimo % del saldo', entrada('minimoPct', t?.minimoPct ?? 5, { tipo: 'number', paso: '0.1', min: 0 }))}
    </div>
    <small class="mu">Los últimos 4 dígitos sirven para reconocer los correos del banco. El interés y el mínimo vienen en tu estado de cuenta.</small>
    <fieldset>
      <legend>${t ? 'Saldo' : 'Cómo está hoy'}</legend>
      ${campo('Lo que debes hoy', entrada('saldoHoy', e ? e.saldoActual : '', { tipo: 'number', paso: '0.01', req: true, ph: '0.00' }), t ? 'Cámbialo solo si no cuadra con tu banco' : 'Lo ves en la app de tu banco como saldo actual')}
      ${t ? '' : `
        ${campo('Pago de contado de tu último estado de cuenta', entrada('saldoCorte', est ? est.contado.toFixed(2) : '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Si no lo sabes, déjalo vacío' }))}
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
    <div class="fila-campos">
      ${campo('Monto original', entrada('monto', p?.monto ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true, ph: '0.00' }))}
      ${campo('Interés anual %', entrada('tasaAnual', p?.tasaAnual ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true }))}
    </div>
    <div class="fila-campos">
      ${campo('Plazo en meses', entrada('plazoMeses', p?.plazoMeses ?? '', { tipo: 'number', min: 1, req: true }))}
      ${campo('Cuota que pagas', entrada('cuota', p?.cuota ?? '', { tipo: 'number', paso: '0.01', min: 0, ph: 'Opcional' }))}
    </div>
    ${campo('Fecha del primer pago', entrada('fechaPrimerPago', p?.fechaPrimerPago || '', { tipo: 'date', req: true }), 'Las cuotas se cuentan desde aquí, el mismo día de cada mes')}
    <small class="mu">Si la cuota incluye seguros, escríbela completa: la diferencia se muestra aparte como cargos.</small>
    ${pie(botonBorrar('prestamos', id))}
  </form>`;
  return { titulo: p ? 'Editar préstamo' : 'Nuevo préstamo', cuerpo };
}

function pagar({ id }) {
  const hoy = hoyISO();
  const t = obtener('tarjetas', id);
  const p = obtener('prestamos', id);
  let rapidos = [];
  let sugerido = '';
  if (t) {
    const e = estadoDe(t, hoy);
    rapidos = [['Pago de contado', e.contadoPendiente], ['Mínimo aprox.', e.minimoPendiente], ['Saldo total', e.saldoActual]].filter(o => o[1] > 0);
    sugerido = e.contadoPendiente ? e.contadoPendiente.toFixed(2) : '';
  } else if (p) {
    const e = estadoPrestamo(p, movs(), hoy);
    rapidos = [['Cuota', e.cuota]];
    sugerido = e.cuota.toFixed(2);
  }
  const cuerpo = `<form data-form="pago" data-id="${id}">
    <p class="mu" style="text-align:center;margin:0">${esc(nombreCuenta(id))}</p>
    <label class="monto"><span>$</span>${entrada('monto', sugerido, { tipo: 'number', paso: '0.01', min: 0, req: true, extra: 'aria-label="Monto del pago"' })}</label>
    ${rapidos.length ? `<div class="montos-rapidos">${rapidos.map(([n, v]) => `<button type="button" data-accion="poner-monto" data-monto="${v.toFixed(2)}">${n}<b>${dinero(v)}</b></button>`).join('')}</div>` : ''}
    <div class="fila-campos">
      ${campo('Desde', selector('desdeId', opcionesCuentas(), 'efectivo'))}
      ${campo('Fecha', entrada('fecha', hoy, { tipo: 'date', max: hoy }))}
    </div>
    ${p ? marca('extra', 'Es un abono extra a capital, además de la cuota') : ''}
    ${pie('', 'Registrar pago')}
  </form>`;
  return { titulo: 'Registrar pago', cuerpo };
}

function recurrente({ id }) {
  const r = id ? obtener('recurrentes', id) : null;
  const tipo = r?.tipo || 'gasto';
  const deudas = opcionesDeuda();
  const cuerpo = `<form data-form="recurrente" data-tipo="${tipo}" data-id="${id || ''}">
    ${opciones('tipo', [['gasto', 'Gasto', 'cat-compras'], ['pago', 'Pago deuda', 'pago'], ['ingreso', 'Ingreso', 'ingreso']], tipo, 'tipos')}
    ${campo('Nombre', entrada('nombre', r?.nombre || '', { req: true, ph: 'Ej. Netflix, Internet, Salario' }))}
    <div class="fila-campos">
      ${campo('Monto', entrada('monto', r?.monto ?? '', { tipo: 'number', paso: '0.01', min: 0, req: true, ph: '0.00' }))}
      ${campo('Día del mes', entrada('dia', r?.dia ?? '', { tipo: 'number', min: 1, max: 31, req: true }))}
    </div>
    <div class="solo-gasto">${campo('Categoría', opciones('categoriaId', cats(CATEGORIAS), r?.categoriaId || 'suscripciones'))}</div>
    <div class="solo-gasto">${campo('Se cobra a', selector('cuentaGasto', opcionesPagoCon(), r?.tipo === 'gasto' ? r.cuentaId : 'efectivo'))}
      <small class="mu">Si se cobra a una tarjeta que te manda correos, no hace falta: llegará solo.</small></div>
    <div class="solo-pago">
      ${deudas.length ? campo('Deuda', selector('deuda', deudas, r?.tipo === 'pago' ? r.cuentaId : deudas[0][0])) : '<p class="mu">Primero agrega una tarjeta o un préstamo.</p>'}
      ${campo('Se paga desde', selector('desdeId', opcionesCuentas(), r?.desdeId || 'efectivo'))}
    </div>
    <div class="solo-ingreso">${campo('Entra a', selector('cuentaIngreso', opcionesCuentas(), r?.tipo === 'ingreso' ? r.cuentaId : 'efectivo'))}
      ${marca('variable', 'El monto cambia cada vez: anotar el estimado y preguntarme cuánto fue', !!r?.variable)}</div>
    ${marca('activo', 'Activo', r?.activo !== false)}
    ${pie(botonBorrar('recurrentes', id))}
  </form>`;
  return { titulo: r ? 'Pago fijo' : 'Nuevo pago fijo', cuerpo };
}

function cuenta({ id }) {
  const c = id ? obtener('cuentas', id) : null;
  const saldo = c ? saldoCuenta(c, movs(), hoyISO()) : null;
  const cuerpo = `<form data-form="cuenta" data-id="${id || ''}">
    ${campo('Nombre', entrada('nombre', c?.nombre || '', { req: true, ph: 'Ej. Ahorro Agrícola' }))}
    ${campo(c?.tipo === 'efectivo' ? '¿Cuánto efectivo tienes hoy?' : '¿Cuánto tienes hoy en esta cuenta?', entrada('saldoHoy', saldo != null ? saldo.toFixed(2) : '', { tipo: 'number', paso: '0.01', ph: '0.00' }),
      saldo != null ? 'Cámbialo cuando no cuadre (por ejemplo, después de contar tu efectivo). Desde aquí la app lo va actualizando sola.' : 'Desde aquí la app lo va actualizando: suma tus ingresos y resta tus gastos y pagos.')}
    ${c?.tipo === 'efectivo' ? '<input type="hidden" name="tipo" value="efectivo">' : `
      ${campo('Banco', selector('banco', BANCOS, c?.banco || 'agricola'))}
      <div class="fila-campos">
        ${campo('Últimos 4 del número de cuenta', entrada('cuenta4', c?.cuenta4 || '', { ph: 'Opcional', extra: 'inputmode="numeric" maxlength="4"' }))}
        ${campo('Últimos 4 de la tarjeta de débito', entrada('ultimos4', c?.ultimos4 || '', { ph: 'Opcional', extra: 'inputmode="numeric" maxlength="4"' }))}
      </div>
      <small class="mu">Con el número de cuenta se reconoce desde dónde pagaste tus tarjetas; con la de débito, tus compras con débito.</small>
      <input type="hidden" name="tipo" value="banco">`}
    ${pie(c?.tipo === 'efectivo' ? '' : botonBorrar('cuentas', id))}
  </form>`;
  return { titulo: c ? 'Cuenta' : 'Nueva cuenta', cuerpo };
}

function regla({ id }) {
  const r = id ? obtener('reglas', id) : null;
  const cuerpo = `<form data-form="regla" data-id="${id || ''}">
    ${campo('Si el comercio contiene', entrada('patron', r?.patron || '', { req: true, ph: 'Ej. SELECTOS' }))}
    ${campo('Ponerle la categoría', opciones('categoriaId', cats(CATEGORIAS), r?.categoriaId || 'super'))}
    ${marca('aplicar', 'Aplicar también a los movimientos que ya tengo', true)}
    ${pie(botonBorrar('reglas', id))}
  </form>`;
  return { titulo: r ? 'Regla' : 'Nueva regla', cuerpo };
}

// Suscripción que pagas tú pero se comparte (el internet entre 4): solo cuenta tu parte. id = clave del comercio
function compartir({ id }) {
  const s = suscripcionesActuales().lista.find(x => x.clave === id);
  if (!s) return { titulo: 'Compartir', cuerpo: '<p class="mu">Ya no aparece esta suscripción.</p>' };
  const entre = String(s.compartida?.entre || 4);
  const exacta = s.compartida && !s.compartida.entre ? s.monto : '';
  const quitar = s.compartida ? `<button type="button" class="btn sec" data-accion="sus-no-compartida" data-clave="${esc(s.clave)}">Ya no la comparto</button>` : '';
  const cuerpo = `<form data-form="compartir" data-id="${esc(s.clave)}" data-total="${s.montoTotal}">
    <p class="mu" style="margin:0 0 14px">${esc(s.nombre)} cobra ${dinero(s.montoTotal)} al mes. En tus suscripciones solo contará lo que pagas tú. La tarjeta sigue debiendo el cobro completo.</p>
    ${campo('¿Entre cuántas personas lo pagan?', opciones('entre', [2, 3, 4, 5, 6].map(n => [String(n), `${n}`]), entre))}
    ${campo('O lo que pagas tú, si es otro monto', entrada('miParte', exacta, { tipo: 'number', paso: '0.01', min: 0, ph: 'Opcional' }), 'Si lo dejas vacío se divide el total en partes iguales')}
    ${pie(quitar)}
  </form>`;
  return { titulo: 'La pago con otros', cuerpo };
}

function tabla({ id }) {
  const p = obtener('prestamos', id);
  const hoy = hoyISO();
  const extras = movs().filter(m => m.cuentaId === id && m.tipo === 'pago' && m.extra).map(m => ({ fecha: m.fecha, monto: m.monto }));
  const filas = tablaPagos(p, { extras });
  const { cargos } = partesCuota(p);
  const siguiente = filas.find(f => f.fecha > hoy)?.n;
  const cuerpo = `<div class="tabla-caja"><table class="tabla">
    <thead><tr><th>#</th><th>Fecha</th><th>Cuota</th><th>Capital</th><th>Interés</th>${cargos ? '<th>Cargos</th>' : ''}<th>Saldo</th></tr></thead>
    <tbody>${filas.map(f => `<tr class="${f.fecha <= hoy ? 'pasada' : f.n === siguiente ? 'siguiente' : ''}">
      <td>${f.n}</td><td>${fechaCorta(f.fecha)} ${f.fecha.slice(2, 4)}</td><td>${dinero(f.cuota)}</td>
      <td>${dinero(f.capital + f.extra)}${f.extra ? '*' : ''}</td><td>${dinero(f.interes)}</td>${cargos ? `<td>${dinero(f.cargos)}</td>` : ''}<td>${dinero(f.saldo)}</td>
    </tr>`).join('')}</tbody>
  </table></div>
  <small class="mu" style="margin-top:12px">En gris, las cuotas que ya pasaron; resaltada, la siguiente. * incluye abono extra. Es un cálculo con la tasa y el plazo que ingresaste: tu banco puede variar por centavos.</small>`;
  return { titulo: p.nombre, cuerpo };
}

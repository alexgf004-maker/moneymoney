// Saldo de las cuentas de banco y del efectivo, y "¿cuánto puedo gastar hasta mi próximo salario?".
//
// Cuenta: { id, nombre, tipo: 'efectivo'|'banco', saldoInicial, fechaSaldo, cuenta4, ultimos4 }
// - saldoInicial: lo que había al configurarla o al último "ajustar saldo" (fechaSaldo). Los movimientos
//   posteriores se suman encima: ingresos y devoluciones suben; gastos y pagos hechos desde la cuenta bajan.

import { r2, sumar } from './dinero.js';
import { deISO, diasEntre, fechaConDia, sumarMeses } from './fechas.js';
import { estadoTarjeta, fechaPagoDe } from './tarjetas.js';
import { estadoPrestamo, tablaPagos } from './prestamo.js';

function efectoEnCuenta(m, id) {
  if (m.cuentaId === id && (m.tipo === 'ingreso' || m.tipo === 'reembolso')) return m.monto;
  if (m.cuentaId === id && m.tipo === 'gasto') return -m.monto;
  if (m.desdeId === id && m.tipo === 'pago') return -m.monto;
  return 0;
}

export function saldoCuenta(cuenta, movs, hoy) {
  if (cuenta.saldoInicial == null) return null; // todavía no se puso cuánto hay
  const desde = cuenta.fechaSaldo || '0000-00-00';
  return r2(cuenta.saldoInicial + sumar(movs.filter(m => m.fecha > desde && m.fecha <= hoy).map(m => efectoEnCuenta(m, cuenta.id))));
}

// Próximo ingreso fijo (salario): la fecha más cercana después de hoy entre los pagos fijos de tipo ingreso
export function proximoIngreso(recurrentes, hoy) {
  const d = deISO(hoy);
  const fechas = recurrentes
    .filter(r => r.tipo === 'ingreso' && r.activo !== false)
    .map(r => {
      const esteMes = fechaConDia(d.getFullYear(), d.getMonth(), r.dia);
      return { fecha: esteMes > hoy ? esteMes : fechaConDia(d.getFullYear(), d.getMonth() + 1, r.dia), monto: r.monto, nombre: r.nombre };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return fechas[0] || null;
}

// ¿Cuánto puedo gastar? Lo que hay en cuentas y efectivo, menos lo que hay que pagar desde ellas antes del
// próximo salario: pagos de contado de tarjetas, cuotas del préstamo y pagos fijos cobrados a una cuenta
// (los cobrados a una tarjeta no salen de la cuenta ahora: entran al pago de esa tarjeta).
export function cuantoPuedoGastar({ cuentas, movs, tarjetas, prestamos, recurrentes, estadosDe = () => [] }, hoy) {
  const conSaldo = cuentas.map(c => ({ c, saldo: saldoCuenta(c, movs, hoy) })).filter(x => x.saldo != null);
  if (!conSaldo.length) return null;
  const tienes = sumar(conSaldo.map(x => x.saldo));
  const ingreso = proximoIngreso(recurrentes, hoy);
  // Sin salario registrado se mira hasta fin de mes
  const hasta = ingreso ? ingreso.fecha : fechaConDia(deISO(hoy).getFullYear(), deISO(hoy).getMonth() + 1, 0);
  // El período siguiente: del próximo salario al que sigue (un mes después)
  const hasta2 = sumarMeses(hasta, 1);
  const todos = pagosConocidos({ cuentas, movs, tarjetas, prestamos, recurrentes, estadosDe }, hoy, hasta2);
  const pagos = todos.filter(p => p.fecha <= hasta);
  const siguientes = todos.filter(p => p.fecha > hasta);
  const comprometido = sumar(pagos.map(p => p.monto));
  // Lo que el próximo salario no alcanza a cubrir del período siguiente también se reserva desde ya
  const delSiguiente = sumar(siguientes.map(p => p.monto));
  const reservaSiguiente = ingreso ? r2(Math.max(0, delSiguiente - ingreso.monto)) : 0;
  const libre = r2(tienes - comprometido - reservaSiguiente);
  const dias = Math.max(1, diasEntre(hoy, hasta)); // los días de hoy hasta el día antes del salario
  return {
    tienes, cuentas: conSaldo, pagos, comprometido, siguientes, delSiguiente, reservaSiguiente, libre, hasta, dias, ingreso,
    porDia: libre > 0 ? r2(libre / dias) : 0,
    alcanza: libre >= 0,
  };
}

// Pagos ya conocidos hasta una fecha: pago de contado pendiente de cada tarjeta, cuotas de compras en cuotas que
// se cobrarán en los próximos cortes (se pagan unos días después del corte), cuotas del préstamo y pagos fijos
// cobrados a una cuenta.
function pagosConocidos({ cuentas, movs, tarjetas, prestamos, recurrentes, estadosDe }, hoy, hasta) {
  const pagos = [];
  for (const t of tarjetas) {
    const e = estadoTarjeta(t, movs, hoy, estadosDe(t));
    if (e.contadoPendiente > 0 && e.fechaPago <= hasta) pagos.push({ nombre: `${t.nombre} ···${t.ultimos4}`, fecha: e.fechaPago, monto: e.contadoPendiente });
    // Cuotas que entran en el próximo corte: se pagan en la fecha de pago de ese corte
    const corte = e.proximoCorte;
    const pagoCorte = fechaPagoDe(t, corte);
    if (pagoCorte <= hasta) {
      // Lo ya comprado en este ciclo más las cuotas que entran en ese corte: es el siguiente pago de contado
      const ciclo = Math.max(0, r2(e.saldoActual - e.contadoPendiente));
      const cuotas = sumar(e.planes.filter(p => p.proximaCuota === corte).map(p => p.cuota));
      if (ciclo + cuotas > 0) pagos.push({ nombre: `${t.nombre} ···${t.ultimos4} (próximo corte)`, fecha: pagoCorte, monto: r2(ciclo + cuotas) });
    }
  }
  for (const p of prestamos) {
    const filas = tablaPagos(p).filter(f => f.fecha > hoy && f.fecha <= hasta);
    const e = estadoPrestamo(p, movs, hoy);
    for (const f of filas) {
      if (f.fecha.slice(0, 7) === e.proxima?.fecha.slice(0, 7) && e.cuotaRegistrada) continue;
      pagos.push({ nombre: p.nombre, fecha: f.fecha, monto: e.cuota });
    }
  }
  const idsCuentas = new Set(cuentas.map(c => c.id));
  for (const r of recurrentes) {
    if (r.activo === false || r.tipo !== 'gasto' || !idsCuentas.has(r.cuentaId)) continue;
    const d = deISO(hoy);
    for (let k = 0; k < 3; k++) {
      const fecha = fechaConDia(d.getFullYear(), d.getMonth() + k, r.dia);
      if (fecha > hoy && fecha <= hasta) pagos.push({ nombre: r.nombre, fecha, monto: r.monto });
    }
  }
  return pagos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

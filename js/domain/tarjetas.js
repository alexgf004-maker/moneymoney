// Ciclo de una tarjeta de crédito: corte, fecha de pago, pago de contado y pago mínimo.
//
// Tarjeta: { id, banco, nombre, ultimos4, limite, diaCorte, diaPago, tasaAnual, minimoPct,
//            saldoInicial, fechaSaldo, saldoCorteInicial, pagadoCorteInicial }
// - saldoInicial: lo que se debía al configurarla (fechaSaldo). Los movimientos de después se suman encima.
// - saldoCorteInicial: el "pago de contado" del último estado de cuenta antes de configurarla, y
//   pagadoCorteInicial lo que ya se había abonado de ese corte. Sin esto la app no sabría cuánto falta pagar
//   del primer corte, porque no tiene los movimientos de antes.
//
// Movimientos que afectan la tarjeta (cuentaId = id de la tarjeta):
//   gasto -> aumenta la deuda · pago y reembolso -> la bajan

import { deISO, fechaConDia, sumarMeses, diasEntre } from './fechas.js';
import { r2, sumar } from './dinero.js';

export function ultimoCorte(tarjeta, hoy) {
  const d = deISO(hoy);
  const esteMes = fechaConDia(d.getFullYear(), d.getMonth(), tarjeta.diaCorte);
  return esteMes <= hoy ? esteMes : fechaConDia(d.getFullYear(), d.getMonth() - 1, tarjeta.diaCorte);
}

export const proximoCorte = (tarjeta, hoy) => sumarMeses(ultimoCorte(tarjeta, hoy), 1, tarjeta.diaCorte);

// La fecha límite de pago de un corte: el siguiente "día de pago" después del corte
export function fechaPagoDe(tarjeta, corte) {
  const d = deISO(corte);
  const mismoMes = fechaConDia(d.getFullYear(), d.getMonth(), tarjeta.diaPago);
  return mismoMes > corte ? mismoMes : fechaConDia(d.getFullYear(), d.getMonth() + 1, tarjeta.diaPago);
}

const efecto = m => (m.tipo === 'gasto' ? m.monto : m.tipo === 'pago' || m.tipo === 'reembolso' ? -m.monto : 0);

const deLaTarjeta = (tarjeta, movs) => movs.filter(m => m.cuentaId === tarjeta.id && m.fecha > tarjeta.fechaSaldo);

// Saldo al final del día `fecha` (solo para fechas desde que se configuró)
export function saldoEn(tarjeta, movs, fecha) {
  return r2((tarjeta.saldoInicial || 0) + sumar(deLaTarjeta(tarjeta, movs).filter(m => m.fecha <= fecha).map(efecto)));
}

function saldoAlCorte(tarjeta, movs, corte) {
  if (corte <= tarjeta.fechaSaldo) return r2(tarjeta.saldoCorteInicial ?? tarjeta.saldoInicial ?? 0);
  return saldoEn(tarjeta, movs, corte);
}

function pagadoDesde(tarjeta, movs, corte, hoy) {
  const abonos = deLaTarjeta(tarjeta, movs)
    .filter(m => (m.tipo === 'pago' || m.tipo === 'reembolso') && m.fecha > corte && m.fecha <= hoy)
    .map(m => m.monto);
  const previo = corte <= tarjeta.fechaSaldo ? tarjeta.pagadoCorteInicial || 0 : 0;
  return r2(previo + sumar(abonos));
}

export function estadoTarjeta(tarjeta, movs, hoy) {
  const corte = ultimoCorte(tarjeta, hoy);
  const fechaPago = fechaPagoDe(tarjeta, corte);
  const saldoActual = saldoEn(tarjeta, movs, hoy);
  const saldoCorte = Math.max(0, saldoAlCorte(tarjeta, movs, corte));
  const pagado = pagadoDesde(tarjeta, movs, corte, hoy);
  const contadoPendiente = r2(Math.max(0, saldoCorte - pagado));
  const minimo = r2(Math.min(contadoPendiente, Math.max(saldoCorte * (tarjeta.minimoPct ?? 5) / 100 - pagado, 0)));
  const tasaMensual = (tarjeta.tasaAnual || 0) / 12 / 100;
  const comprasCiclo = sumar(deLaTarjeta(tarjeta, movs).filter(m => m.tipo === 'gasto' && m.fecha > corte && m.fecha <= hoy).map(m => m.monto));
  const vencido = hoy > fechaPago && contadoPendiente > 0;
  return {
    saldoActual,
    disponible: r2((tarjeta.limite || 0) - saldoActual),
    uso: tarjeta.limite ? saldoActual / tarjeta.limite : 0,
    ultimoCorte: corte,
    proximoCorte: proximoCorte(tarjeta, hoy),
    fechaPago,
    diasParaPago: diasEntre(hoy, fechaPago),
    saldoCorte,
    pagadoDelCorte: pagado,
    contadoPendiente,
    minimoPendiente: minimo,
    // Si solo se paga el mínimo, el resto genera intereses (como mínimo esto; varios bancos además cobran intereses a las compras nuevas)
    interesSiMinimo: r2(Math.max(0, saldoCorte - pagado - minimo) * tasaMensual),
    comprasCiclo,
    vencido,
    alDia: contadoPendiente === 0,
  };
}

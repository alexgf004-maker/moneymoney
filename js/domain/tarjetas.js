// Ciclo de una tarjeta de crédito: corte, fecha de pago, pago de contado y pago mínimo.
//
// Tarjeta: { id, banco, nombre, ultimos4, limite, diaCorte, diaPago, tasaAnual, minimoPct,
//            saldoInicial, fechaSaldo, saldoCorteInicial, pagadoCorteInicial }
// - saldoInicial: lo que se debía al configurarla (fechaSaldo). Los movimientos de después se suman encima.
// - saldoCorteInicial: el "pago de contado" del último estado de cuenta antes de configurarla, y
//   pagadoCorteInicial lo que ya se había abonado de ese corte. Sin esto la app no sabría cuánto falta pagar
//   del primer corte, porque no tiene los movimientos de antes.
//
// Movimientos que afectan la tarjeta:
//   cuentaId = la tarjeta: gasto -> aumenta la deuda · pago y reembolso -> la bajan
//   desdeId = la tarjeta en un pago: se pagó OTRA deuda con esta tarjeta (p. ej. la Siman con la Cuscatlán) -> aumenta la deuda
//   plan = id de un plan de cuotas: la compra NO se suma completa; la tarjeta cobra la cuota en cada corte
//
// Compras en cuotas (tarjeta.planes): tasa cero y extrafinanciamientos.
//   { id, nombre, tipo: 'tasa0'|'extra', cuota, total, cobradas, corteRef, tasaAnual }
//   cobradas = cuotas ya incluidas en estados de cuenta hasta el corte corteRef. Cada corte siguiente cobra una
//   cuota más (un cargo en la fecha de corte), hasta llegar a `total`. Lo que falta no es parte del pago de
//   contado: se muestra aparte como "en cuotas", como lo hace el banco.

import { deISO, fechaConDia, sumarMeses, diasEntre } from './fechas.js';
import { r2, sumar } from './dinero.js';

const planesDe = t => Object.values(t.planes || {});

// Cargos de cuota que hace cada plan en los cortes siguientes a corteRef
export function cargosDePlanes(tarjeta) {
  const cargos = [];
  for (const p of planesDe(tarjeta)) {
    for (let i = (p.cobradas || 0) + 1, k = 1; i <= p.total; i++, k++) {
      cargos.push({ id: `plan_${p.id}_${i}`, tipo: 'cuota', cuentaId: tarjeta.id, monto: r2(p.cuota), fecha: sumarMeses(p.corteRef, k, tarjeta.diaCorte), plan: p.id, n: i });
    }
  }
  return cargos;
}

// Estado de cada plan a una fecha: cuántas cuotas van, cuánto falta y cuándo termina
export function estadoPlanes(tarjeta, hoy) {
  const cargos = cargosDePlanes(tarjeta);
  return planesDe(tarjeta).map(p => {
    const propios = cargos.filter(c => c.plan === p.id);
    const cobradas = (p.cobradas || 0) + propios.filter(c => c.fecha <= hoy).length;
    const restantes = Math.max(0, p.total - cobradas);
    const proxima = propios.find(c => c.fecha > hoy);
    return {
      ...p, cobradasHoy: cobradas, restantes, pendiente: r2(restantes * p.cuota),
      proximaCuota: proxima?.fecha || null, fin: propios.length ? propios[propios.length - 1].fecha : p.corteRef, activo: restantes > 0,
    };
  });
}

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

const esCargo = (m, id) => (m.tipo === 'gasto' && !m.plan) || m.tipo === 'cuota' || (m.tipo === 'pago' && m.desdeId === id && m.cuentaId !== id);

const efecto = id => m => (esCargo(m, id) ? m.monto : m.tipo === 'pago' || m.tipo === 'reembolso' ? -m.monto : 0);

// Movimientos de la tarjeta desde que se configuró, más las cuotas de sus compras en cuotas
const deLaTarjeta = (tarjeta, movs) => [...movs, ...cargosDePlanes(tarjeta)]
  .filter(m => (m.cuentaId === tarjeta.id || (m.tipo === 'pago' && m.desdeId === tarjeta.id)) && m.fecha > tarjeta.fechaSaldo);

// Saldo al final del día `fecha` (solo para fechas desde que se configuró)
export function saldoEn(tarjeta, movs, fecha) {
  return r2((tarjeta.saldoInicial || 0) + sumar(deLaTarjeta(tarjeta, movs).filter(m => m.fecha <= fecha).map(efecto(tarjeta.id))));
}

function saldoAlCorte(tarjeta, movs, corte) {
  if (corte <= tarjeta.fechaSaldo) return r2(tarjeta.saldoCorteInicial ?? tarjeta.saldoInicial ?? 0);
  return saldoEn(tarjeta, movs, corte);
}

function pagadoDesde(tarjeta, movs, corte, hoy) {
  const abonos = deLaTarjeta(tarjeta, movs)
    .filter(m => m.cuentaId === tarjeta.id && (m.tipo === 'pago' || m.tipo === 'reembolso') && m.fecha > corte && m.fecha <= hoy)
    .map(m => m.monto);
  const previo = corte <= tarjeta.fechaSaldo ? tarjeta.pagadoCorteInicial || 0 : 0;
  return r2(previo + sumar(abonos));
}

// Compara lo que dice el banco al corte con lo que la app calculó con los movimientos registrados.
// Solo tiene sentido si el corte es posterior a cuando se configuró la tarjeta (antes no hay movimientos).
// diferencia > 0: el banco cobra más (intereses, comisiones o algo que no llegó por correo).
export function conciliar(tarjeta, movs, real) {
  if (!real || !tarjeta.fechaSaldo || real.fechaCorte <= tarjeta.fechaSaldo) return null;
  const app = saldoEn(tarjeta, movs, real.fechaCorte);
  return { fechaCorte: real.fechaCorte, banco: r2(real.contado), app, diferencia: r2(real.contado - app) };
}

// Movimiento que deja el saldo de la app igual al del banco en la fecha de corte
export function movimientoDeAjuste(tarjeta, c) {
  return {
    id: `aj_${tarjeta.id}_${c.fechaCorte}`, fecha: c.fechaCorte, monto: Math.abs(c.diferencia),
    tipo: c.diferencia > 0 ? 'gasto' : 'reembolso', cuentaId: tarjeta.id, categoriaId: 'comisiones',
    comercio: 'Ajuste según estado de cuenta', origen: 'ajuste', revisar: false,
  };
}

// estados: los estados de cuenta del banco para esta tarjeta ({ fechaCorte, fechaPago, contado, minimo }).
// Si hay uno del ciclo actual, se usan sus números exactos en vez de calcularlos.
export function estadoDelCiclo(tarjeta, estados, hoy) {
  const calculado = ultimoCorte(tarjeta, hoy);
  const real = estados
    .filter(e => e.fechaCorte && e.fechaCorte <= hoy && e.contado != null)
    .sort((a, b) => b.fechaCorte.localeCompare(a.fechaCorte))[0];
  // Si ya pasó otro corte y su estado de cuenta todavía no llega, manda el cálculo
  return real && diasEntre(real.fechaCorte, calculado) <= 10 ? real : null;
}

export function estadoTarjeta(tarjeta, movs, hoy, estados = []) {
  const real = estadoDelCiclo(tarjeta, estados, hoy);
  const corte = real ? real.fechaCorte : ultimoCorte(tarjeta, hoy);
  const fechaPago = real?.fechaPago || fechaPagoDe(tarjeta, corte);
  const saldoActual = saldoEn(tarjeta, movs, hoy);
  const saldoCorte = real ? r2(real.contado) : Math.max(0, saldoAlCorte(tarjeta, movs, corte));
  const pagado = pagadoDesde(tarjeta, movs, corte, hoy);
  const contadoPendiente = r2(Math.max(0, saldoCorte - pagado));
  const minimoBase = real && real.minimo != null ? real.minimo : saldoCorte * (tarjeta.minimoPct ?? 5) / 100;
  const minimo = r2(Math.min(contadoPendiente, Math.max(minimoBase - pagado, 0)));
  const tasaMensual = (tarjeta.tasaAnual || 0) / 12 / 100;
  const comprasCiclo = sumar(deLaTarjeta(tarjeta, movs).filter(m => esCargo(m, tarjeta.id) && m.fecha > corte && m.fecha <= hoy).map(m => m.monto));
  const vencido = hoy > fechaPago && contadoPendiente > 0;
  const planes = estadoPlanes(tarjeta, hoy);
  const enCuotas = sumar(planes.map(p => p.pendiente));
  const deudaTotal = r2(saldoActual + enCuotas);
  return {
    saldoActual,
    planes,
    enCuotas,
    cuotasMes: sumar(planes.filter(p => p.activo).map(p => p.cuota)),
    deudaTotal,
    // Lo que falta en cuotas también ocupa el límite (el banco lo descuenta del disponible)
    disponible: r2((tarjeta.limite || 0) - deudaTotal),
    uso: tarjeta.limite ? deudaTotal / tarjeta.limite : 0,
    ultimoCorte: corte,
    proximoCorte: real ? sumarMeses(real.fechaCorte, 1, tarjeta.diaCorte) : proximoCorte(tarjeta, hoy),
    fuente: real ? 'banco' : 'calculado',
    conciliacion: conciliar(tarjeta, movs, real),
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

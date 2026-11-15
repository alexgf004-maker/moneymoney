// Préstamo con cuota fija (sistema francés), el que usan los bancos en El Salvador.
//
// Préstamo: { id, banco, nombre, monto, tasaAnual, plazoMeses, cuota, fechaPrimerPago }
// - cuota: la que cobra el banco. Si es mayor que la calculada, la diferencia son seguros y cargos que
//   no bajan la deuda (se muestran aparte).
// Abonos extra: movimientos { tipo: 'pago', cuentaId: id del préstamo, extra: true } — van directo a capital
// y acortan el plazo (la cuota se mantiene).

import { sumarMeses, deISO } from './fechas.js';
import { r2, sumar } from './dinero.js';

export function cuotaFrancesa(monto, tasaAnual, meses) {
  const i = tasaAnual / 12 / 100;
  if (!meses) return 0;
  if (!i) return r2(monto / meses);
  return r2(monto * i / (1 - Math.pow(1 + i, -meses)));
}

export function partesCuota(p) {
  const capitalEInteres = cuotaFrancesa(p.monto, p.tasaAnual, p.plazoMeses);
  const cuota = r2(p.cuota || capitalEInteres);
  return { cuota, capitalEInteres, cargos: r2(Math.max(0, cuota - capitalEInteres)) };
}

// Tabla de pagos. `extras`: [{ fecha, monto }] abonos a capital; `extraMensual`: abono adicional en cada
// cuota posterior a `extraDesde`.
export function tablaPagos(p, { extras = [], extraMensual = 0, extraDesde = '' } = {}) {
  const { capitalEInteres, cargos } = partesCuota(p);
  const i = p.tasaAnual / 12 / 100;
  const diaPago = deISO(p.fechaPrimerPago).getDate();
  const pendientes = [...extras].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let saldo = r2(p.monto);
  const filas = [];
  for (let n = 1; saldo > 0.005 && n <= 1200; n++) {
    const fecha = sumarMeses(p.fechaPrimerPago, n - 1, diaPago);
    let abonoExtra = 0;
    while (pendientes.length && pendientes[0].fecha <= fecha) {
      abonoExtra += pendientes.shift().monto;
    }
    saldo = r2(Math.max(0, saldo - abonoExtra));
    if (saldo <= 0.005) { filas.push({ n, fecha, cuota: 0, interes: 0, capital: 0, extra: r2(abonoExtra), cargos: 0, saldo: 0 }); break; }
    const interes = r2(saldo * i);
    let capital = r2(capitalEInteres - interes);
    // Última cuota del plazo (o si solo quedan centavos por redondeo): se paga todo lo que queda,
    // para no inventar una cuota extra de centavos al final
    if (n >= p.plazoMeses || saldo - capital < 1) capital = saldo;
    let extraCuota = fecha > extraDesde ? r2(extraMensual) : 0;
    if (capital + extraCuota >= saldo) { capital = Math.min(capital, saldo); extraCuota = r2(saldo - capital); }
    saldo = r2(saldo - capital - extraCuota);
    filas.push({ n, fecha, cuota: r2(interes + capital + cargos), interes, capital, extra: r2(abonoExtra + extraCuota), cargos, saldo });
  }
  return filas;
}

const extrasDe = (p, movs) => movs.filter(m => m.cuentaId === p.id && m.tipo === 'pago' && m.extra).map(m => ({ fecha: m.fecha, monto: m.monto }));

export function estadoPrestamo(p, movs, hoy) {
  const filas = tablaPagos(p, { extras: extrasDe(p, movs) });
  const pagadas = filas.filter(f => f.fecha <= hoy);
  const ultima = pagadas[pagadas.length - 1];
  const proxima = filas.find(f => f.fecha > hoy) || null;
  const saldo = ultima ? ultima.saldo : r2(p.monto - sumar(extrasDe(p, movs).filter(e => e.fecha <= hoy).map(e => e.monto)));
  const original = tablaPagos(p);
  // ¿Ya se registró el pago de la cuota de este mes?
  const mesProxima = proxima?.fecha.slice(0, 7);
  const cuotaRegistrada = !!proxima && movs.some(m => m.cuentaId === p.id && m.tipo === 'pago' && !m.extra && m.fecha.slice(0, 7) === mesProxima);
  return {
    saldo,
    cuotasPagadas: pagadas.length,
    cuotasTotales: filas.length,
    cuotasRestantes: filas.length - pagadas.length,
    avance: p.monto ? 1 - saldo / p.monto : 0,
    capitalPagado: r2(p.monto - saldo),
    interesPagado: sumar(pagadas.map(f => f.interes)),
    interesRestante: sumar(filas.filter(f => f.fecha > hoy).map(f => f.interes)),
    proxima,
    cuotaRegistrada,
    fechaFin: filas[filas.length - 1]?.fecha,
    mesesAhorradosPorAbonos: original.length - filas.length,
    ...partesCuota(p),
  };
}

// ¿Qué pasa si desde hoy se abona `extraMensual` más en cada cuota, o `abonoUnico` hoy?
export function simularAbono(p, movs, hoy, { extraMensual = 0, abonoUnico = 0 } = {}) {
  const extras = extrasDe(p, movs);
  const base = tablaPagos(p, { extras });
  const conAbono = abonoUnico > 0 ? [...extras, { fecha: hoy, monto: abonoUnico }] : extras;
  const nueva = tablaPagos(p, { extras: conAbono, extraMensual, extraDesde: hoy });
  const futuras = f => f.filter(x => x.fecha > hoy);
  const interes = f => sumar(futuras(f).map(x => x.interes));
  return {
    cuotasAntes: futuras(base).length,
    cuotasDespues: futuras(nueva).length,
    mesesMenos: base.length - nueva.length,
    interesAhorrado: r2(interes(base) - interes(nueva)),
    fechaFinAntes: base[base.length - 1]?.fecha,
    fechaFinDespues: nueva[nueva.length - 1]?.fecha,
  };
}

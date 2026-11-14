// Plan para salir de deudas: con un monto fijo al mes, ¿en qué orden pagar y cuánto se tarda?
// - avalancha: el dinero extra va a la deuda con la tasa más alta (paga menos intereses)
// - bola: el dinero extra va a la deuda más pequeña (se liquidan deudas antes, motiva más)
// Deuda: { id, nombre, saldo, tasaAnual, minimo }

import { r2, sumar } from './dinero.js';

const ORDEN = {
  avalancha: (a, b) => b.tasaAnual - a.tasaAnual || a.saldo - b.saldo,
  bola: (a, b) => a.saldo - b.saldo || b.tasaAnual - a.tasaAnual,
};

export function simularPlan(deudas, presupuestoMensual, metodo = 'avalancha', { soloMinimos = false } = {}) {
  const vivas = deudas.filter(d => d.saldo > 0).map(d => ({ ...d, saldo: r2(d.saldo), minimo: r2(Math.max(d.minimo || 0, 1)) }));
  const minimos = sumar(vivas.map(d => Math.min(d.minimo, d.saldo)));
  if (!soloMinimos && presupuestoMensual < minimos) {
    return { viable: false, minimos, meses: 0, interesTotal: 0, liquidaciones: [] };
  }
  const liquidaciones = [];
  let interesTotal = 0;
  let mes = 0;
  while (vivas.some(d => d.saldo > 0) && mes < 600) {
    mes++;
    for (const d of vivas) {
      if (d.saldo <= 0) continue;
      const interes = r2(d.saldo * d.tasaAnual / 12 / 100);
      d.saldo = r2(d.saldo + interes);
      interesTotal += interes;
    }
    let disponible = soloMinimos ? Infinity : presupuestoMensual;
    for (const d of vivas) {
      if (d.saldo <= 0) continue;
      const pago = Math.min(d.minimo, d.saldo, disponible);
      d.saldo = r2(d.saldo - pago);
      disponible -= pago;
    }
    if (!soloMinimos) {
      for (const d of [...vivas].filter(x => x.saldo > 0).sort(ORDEN[metodo])) {
        if (disponible <= 0) break;
        const pago = Math.min(d.saldo, disponible);
        d.saldo = r2(d.saldo - pago);
        disponible = r2(disponible - pago);
      }
    }
    for (const d of vivas) {
      if (d.saldo <= 0 && !liquidaciones.some(l => l.id === d.id)) liquidaciones.push({ id: d.id, nombre: d.nombre, mes });
    }
    // Si el mínimo ni siquiera cubre los intereses, la deuda nunca baja
    if (soloMinimos && mes === 600) break;
  }
  const terminado = !vivas.some(d => d.saldo > 0);
  return { viable: true, terminado, minimos, meses: mes, interesTotal: r2(interesTotal), liquidaciones };
}

export function compararPlanes(deudas, presupuestoMensual) {
  return {
    avalancha: simularPlan(deudas, presupuestoMensual, 'avalancha'),
    bola: simularPlan(deudas, presupuestoMensual, 'bola'),
    soloMinimos: simularPlan(deudas, 0, 'avalancha', { soloMinimos: true }),
  };
}

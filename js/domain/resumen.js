// Totales del mes, presupuestos, pagos fijos y la agenda de próximos pagos.

import { r2, sumar, dinero } from './dinero.js';
import { mesDe, deISO, diasDelMes, fechaConDia, sumarDias } from './fechas.js';
import { estadoTarjeta } from './tarjetas.js';
import { estadoPrestamo } from './prestamo.js';

// Lo que cuenta como gasto: compras (y los reembolsos lo restan). Los pagos a tarjetas o al préstamo no son
// gasto nuevo: el gasto ya se contó cuando se hizo la compra.
export function gastosDelMes(movs, mes) {
  return movs.filter(m => mesDe(m.fecha) === mes && (m.tipo === 'gasto' || m.tipo === 'reembolso'));
}

const valor = m => (m.tipo === 'reembolso' ? -m.monto : m.monto);

export function totalGastado(movs, mes) {
  return sumar(gastosDelMes(movs, mes).map(valor));
}

export function totalIngresos(movs, mes) {
  return sumar(movs.filter(m => mesDe(m.fecha) === mes && m.tipo === 'ingreso').map(m => m.monto));
}

export function porCategoria(movs, mes) {
  const t = {};
  for (const m of gastosDelMes(movs, mes)) t[m.categoriaId || 'otros'] = r2((t[m.categoriaId || 'otros'] || 0) + valor(m));
  return Object.entries(t).map(([categoriaId, total]) => ({ categoriaId, total })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
}

// Lo gastado hasta el mismo día del mes anterior, para comparar parejo
export function gastadoMismoDia(movs, mes, dia) {
  return sumar(gastosDelMes(movs, mes).filter(m => deISO(m.fecha).getDate() <= dia).map(valor));
}

// presupuestos: { categoriaId: límite mensual }
export function estadoPresupuestos(presupuestos, movs, mes, hoy) {
  const gastos = Object.fromEntries(porCategoria(movs, mes).map(x => [x.categoriaId, x.total]));
  const [a, m] = mes.split('-').map(Number);
  const total = diasDelMes(a, m - 1);
  const transcurridos = mesDe(hoy) === mes ? deISO(hoy).getDate() : total;
  return Object.entries(presupuestos)
    .filter(([, limite]) => limite > 0)
    .map(([categoriaId, limite]) => {
      const gastado = gastos[categoriaId] || 0;
      const pct = gastado / limite;
      const proyeccion = r2(gastado / transcurridos * total);
      const nivel = pct >= 1 ? 'excedido' : pct >= 0.8 || proyeccion > limite * 1.05 ? 'alerta' : 'ok';
      return { categoriaId, limite, gastado, pct, proyeccion, nivel, disponible: r2(limite - gastado) };
    })
    .sort((x, y) => y.pct - x.pct);
}

// Pagos fijos: { id, nombre, monto, dia, tipo ('gasto'|'pago'|'ingreso'), cuentaId, desdeId, categoriaId, desde, activo }
// Devuelve los movimientos que ya tocaba crear (uno por mes, con id fijo para no repetirlos).
export function recurrentesPendientes(recurrentes, idsExistentes, hoy) {
  const nuevos = [];
  for (const r of recurrentes) {
    if (r.activo === false || !r.desde) continue;
    const inicio = deISO(r.desde);
    for (let k = 0; k < 600; k++) {
      const fecha = fechaConDia(inicio.getFullYear(), inicio.getMonth() + k, r.dia);
      if (fecha > hoy) break;
      if (fecha < r.desde) continue;
      const id = `rec_${r.id}_${fecha.slice(0, 7)}`;
      if (idsExistentes.has(id)) continue;
      nuevos.push({
        id, fecha, monto: r2(r.monto), tipo: r.tipo || 'gasto', cuentaId: r.cuentaId, desdeId: r.desdeId || null,
        categoriaId: r.categoriaId || 'otros', comercio: r.nombre, origen: 'fijo', recurrenteId: r.id,
      });
    }
  }
  return nuevos;
}

export function proximaFechaRecurrente(r, hoy) {
  const d = deISO(hoy);
  const esteMes = fechaConDia(d.getFullYear(), d.getMonth(), r.dia);
  return esteMes >= hoy ? esteMes : fechaConDia(d.getFullYear(), d.getMonth() + 1, r.dia);
}

// Agenda: todo lo que hay que pagar en los próximos `dias`, más lo vencido
export function proximosPagos({ tarjetas, prestamos, recurrentes, movs, estadosDe = () => [] }, hoy, dias = 30) {
  const hasta = sumarDias(hoy, dias);
  const lista = [];
  for (const t of tarjetas) {
    const e = estadoTarjeta(t, movs, hoy, estadosDe(t));
    if (e.contadoPendiente > 0 && e.fechaPago <= hasta) {
      lista.push({ fecha: e.fechaPago, titulo: `${t.nombre} ···${t.ultimos4}`, detalle: `Mínimo aprox. ${dinero(e.minimoPendiente)}`, monto: e.contadoPendiente, tipo: 'tarjeta', id: t.id, vencido: e.vencido });
    }
  }
  for (const p of prestamos) {
    const e = estadoPrestamo(p, movs, hoy);
    if (e.proxima && e.proxima.fecha <= hasta && !e.cuotaRegistrada) {
      lista.push({ fecha: e.proxima.fecha, titulo: p.nombre, detalle: `Cuota ${e.cuotasPagadas + 1} de ${e.cuotasTotales}`, monto: e.cuota, tipo: 'prestamo', id: p.id });
    }
  }
  for (const r of recurrentes) {
    if (r.activo === false || r.tipo === 'ingreso' || prestamos.some(p => p.id === r.cuentaId)) continue;
    const fecha = proximaFechaRecurrente(r, hoy);
    if (fecha <= hasta) lista.push({ fecha, titulo: r.nombre, detalle: 'Pago fijo', monto: r.monto, tipo: 'fijo', id: r.id });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

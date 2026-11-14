// Une los datos guardados con las reglas de domain/ para lo que piden las pantallas.

import { lista, obtener } from './store.js';
import { estadoTarjeta } from './domain/tarjetas.js';
import { estadoPrestamo } from './domain/prestamo.js';
import { r2, sumar } from './domain/dinero.js';
import { hoyISO } from './domain/fechas.js';

export const movs = () => lista('movimientos');
export const tarjetas = () => lista('tarjetas').sort((a, b) => (a.banco + a.nombre).localeCompare(b.banco + b.nombre));
export const prestamos = () => lista('prestamos');
export const cuentas = () => lista('cuentas').sort((a, b) => (a.id === 'efectivo' ? -1 : b.id === 'efectivo' ? 1 : a.nombre.localeCompare(b.nombre)));
export const reglas = () => lista('reglas');
export const recurrentes = () => lista('recurrentes').sort((a, b) => a.dia - b.dia);

export const BANCOS = [
  ['agricola', 'Banco Agrícola'], ['bac', 'BAC'], ['cuscatlan', 'Banco Cuscatlán'], ['credicomer', 'Credicomer'], ['siman', 'Siman'], ['otro', 'Otro'],
];
export const nombreBanco = id => (BANCOS.find(b => b[0] === id) || [id, id])[1];

export function nombreCuenta(id) {
  if (!id) return 'Sin cuenta';
  const t = obtener('tarjetas', id);
  if (t) return `${t.nombre} ···${t.ultimos4}`;
  const p = obtener('prestamos', id);
  if (p) return p.nombre;
  return obtener('cuentas', id)?.nombre || 'Cuenta borrada';
}

// Con qué se puede pagar un gasto: efectivo, cuentas y tarjetas
export const opcionesPagoCon = () => [
  ...cuentas().map(c => [c.id, c.nombre]),
  ...tarjetas().map(t => [t.id, `Tarjeta ${t.nombre} ···${t.ultimos4}`]),
];

// A qué deuda se puede abonar
export const opcionesDeuda = () => [
  ...tarjetas().map(t => [t.id, `${t.nombre} ···${t.ultimos4}`]),
  ...prestamos().map(p => [p.id, p.nombre]),
];

export const opcionesCuentas = () => cuentas().map(c => [c.id, c.nombre]);

export function resumenDeudas(hoy = hoyISO()) {
  const m = movs();
  const ts = tarjetas().map(t => ({ t, e: estadoTarjeta(t, m, hoy) }));
  const ps = prestamos().map(p => ({ p, e: estadoPrestamo(p, m, hoy) }));
  const totalTarjetas = sumar(ts.map(x => x.e.saldoActual));
  const totalPrestamos = sumar(ps.map(x => x.e.saldo));
  return { ts, ps, totalTarjetas, totalPrestamos, total: r2(totalTarjetas + totalPrestamos) };
}

// Las deudas en el formato del plan (domain/deudas.js)
export function deudasParaPlan(hoy = hoyISO()) {
  const { ts, ps } = resumenDeudas(hoy);
  return [
    ...ts.filter(x => x.e.saldoActual > 0).map(({ t, e }) => ({
      id: t.id, nombre: `${t.nombre} ···${t.ultimos4}`, saldo: e.saldoActual, tasaAnual: t.tasaAnual || 0,
      minimo: Math.max(r2(e.saldoActual * (t.minimoPct ?? 5) / 100), Math.min(10, e.saldoActual)),
    })),
    ...ps.filter(x => x.e.saldo > 0).map(({ p, e }) => ({
      id: p.id, nombre: p.nombre, saldo: e.saldo, tasaAnual: p.tasaAnual || 0, minimo: e.capitalEInteres,
    })),
  ];
}

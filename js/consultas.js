// Une los datos guardados con las reglas de domain/ para lo que piden las pantallas.

import { lista, obtener } from './store.js';
import { estadoTarjeta } from './domain/tarjetas.js';
import { estadoPrestamo } from './domain/prestamo.js';
import { r2, sumar } from './domain/dinero.js';
import { hoyISO } from './domain/fechas.js';
import { cuantoPuedoGastar } from './domain/cuentas.js';

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

// Estados de cuenta de una tarjeta: por sus últimos 4, o por banco si el correo no los trae y es la única de ese banco
export function estadosDe(t) {
  const unica = tarjetas().filter(x => x.banco === t.banco).length === 1;
  return lista('estados').filter(e => (e.ultimos4 ? e.ultimos4 === t.ultimos4 : unica && e.banco === t.banco));
}

export const estadoDe = (t, hoy = hoyISO()) => estadoTarjeta(t, movs(), hoy, estadosDe(t));

// Tarjetas que aparecen en los correos (compras, pagos o estados de cuenta) y todavía no están registradas
export function tarjetasDetectadas() {
  const conocidas = new Set([...tarjetas(), ...cuentas()].flatMap(x => [x.ultimos4, x.cuenta4]).filter(Boolean));
  const mapa = new Map();
  const de = (banco, ultimos4) => {
    const clave = `${banco}|${ultimos4}`;
    if (!mapa.has(clave)) mapa.set(clave, { clave, banco, ultimos4, nombre: null, estado: null, compras: 0, desde: null });
    return mapa.get(clave);
  };
  for (const m of movs()) {
    // Las de débito no se proponen como tarjetas de crédito: se asignan a una cuenta al revisarlas
    if (m.cuentaId || !m.ultimos4 || m.debito || conocidas.has(m.ultimos4)) continue;
    const d = de(m.banco, m.ultimos4);
    if (m.tipo === 'gasto') d.compras++;
    if (!d.desde || m.fecha < d.desde) d.desde = m.fecha;
  }
  const estados = [...lista('estados')].sort((a, b) => a.fechaCorte.localeCompare(b.fechaCorte));
  for (const e of estados) {
    let u4 = e.ultimos4;
    if (!u4) {
      // Sin dígitos: si ya hay una tarjeta registrada de ese banco, el estado es de ella
      if (tarjetas().some(t => t.banco === e.banco)) continue;
      const delBanco = [...mapa.values()].filter(d => d.banco === e.banco);
      if (delBanco.length !== 1) continue;
      u4 = delBanco[0].ultimos4;
    }
    if (conocidas.has(u4)) continue;
    const d = de(e.banco, u4);
    d.estado = e;
    d.nombre = e.nombre || d.nombre;
  }
  return [...mapa.values()];
}

export function resumenDeudas(hoy = hoyISO()) {
  const m = movs();
  const ts = tarjetas().map(t => ({ t, e: estadoTarjeta(t, m, hoy, estadosDe(t)) }));
  const ps = prestamos().map(p => ({ p, e: estadoPrestamo(p, m, hoy) }));
  // Incluye lo que falta de las compras en cuotas: también es deuda
  const totalTarjetas = sumar(ts.map(x => x.e.deudaTotal));
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
    // Cada compra en cuotas: pago fijo sin intereses (en el extrafinanciamiento la cuota ya trae su interés)
    ...ts.flatMap(({ t, e }) => e.planes.filter(p => p.activo).map(p => ({
      id: `${t.id}_${p.id}`, nombre: `${p.nombre} (cuotas ${t.nombre})`, saldo: p.pendiente, tasaAnual: 0, minimo: p.cuota,
    }))),
    ...ps.filter(x => x.e.saldo > 0).map(({ p, e }) => ({
      id: p.id, nombre: p.nombre, saldo: e.saldo, tasaAnual: p.tasaAnual || 0, minimo: e.capitalEInteres,
    })),
  ];
}

// ¿Cuánto puedo gastar hasta el próximo salario? (domain/cuentas.js)
export function disponibleParaGastar(hoy = hoyISO()) {
  return cuantoPuedoGastar({ cuentas: cuentas(), movs: movs(), tarjetas: tarjetas(), prestamos: prestamos(), recurrentes: recurrentes(), estadosDe }, hoy);
}

// Datos de ejemplo para ver cómo se ve la app antes de cargar los reales.

import { hoyISO, sumarDias, sumarMeses, deISO } from './domain/fechas.js';
import { categorizar } from './domain/categorias.js';

export function datosEjemplo() {
  const hoy = hoyISO();
  const dHoy = deISO(hoy).getDate();
  const tarjetas = [
    { id: 'tdemo1', banco: 'agricola', nombre: 'Visa Agrícola', ultimos4: '4821', limite: 2500, diaCorte: 5, diaPago: 25, tasaAnual: 38.5, minimoPct: 5, saldoInicial: 840, fechaSaldo: sumarDias(hoy, -40), saldoCorteInicial: 790, pagadoCorteInicial: 0 },
    { id: 'tdemo2', banco: 'bac', nombre: 'Mastercard BAC', ultimos4: '1093', limite: 1500, diaCorte: 18, diaPago: 8, tasaAnual: 42, minimoPct: 4, saldoInicial: 610, fechaSaldo: sumarDias(hoy, -40), saldoCorteInicial: 580, pagadoCorteInicial: 0 },
    { id: 'tdemo3', banco: 'siman', nombre: 'Tarjeta Siman', ultimos4: '7710', limite: 800, diaCorte: 28, diaPago: 15, tasaAnual: 45, minimoPct: 6, saldoInicial: 230, fechaSaldo: sumarDias(hoy, -40), saldoCorteInicial: 230, pagadoCorteInicial: 0 },
  ];
  const prestamos = [
    { id: 'pdemo1', banco: 'cuscatlan', nombre: 'Préstamo personal', monto: 8000, tasaAnual: 16.5, plazoMeses: 48, cuota: 238.5, fechaPrimerPago: sumarMeses(hoy, -14, 20) },
  ];
  const compras = [
    ['SUPER SELECTOS ESCALON', 64.2, 'tdemo1', 2], ['PUMA SANTA ELENA', 30, 'tdemo2', 3], ['POLLO CAMPERO', 14.75, 'tdemo1', 4],
    ['NETFLIX.COM', 9.99, 'tdemo2', 6], ['FARMACIA SAN NICOLAS', 22.4, 'efectivo', 7], ['WALMART CONSTITUCION', 88.1, 'tdemo1', 9],
    ['UBER *TRIP', 6.5, 'tdemo2', 10], ['SIMAN GALERIAS', 45, 'tdemo3', 12], ['PUPUSERIA LA ESQUINA', 8, 'efectivo', 13],
    ['CINEMARK', 18, 'tdemo2', 15], ['TIGO', 25, 'efectivo', 16], ['TEXACO LAS CASCADAS', 35, 'tdemo1', 18], ['ALMACEN XYZ', 19.9, 'tdemo1', 1],
    ['SUPER SELECTOS', 52.3, 'tdemo1', 33], ['PIZZA HUT', 21, 'tdemo2', 36], ['DELSUR', 41.2, 'efectivo', 38], ['WALMART', 70.4, 'tdemo1', 42],
  ];
  const movimientos = compras.map(([comercio, monto, cuentaId, haceDias], i) => {
    return {
      id: `mdemo${i}`, fecha: sumarDias(hoy, -haceDias), monto, tipo: 'gasto', cuentaId, comercio,
      categoriaId: categorizar(comercio).categoriaId, origen: cuentaId === 'efectivo' ? 'manual' : 'correo',
      revisar: comercio === 'ALMACEN XYZ',
    };
  });
  movimientos.push({ id: 'mdemo-sal', fecha: sumarDias(hoy, -Math.min(dHoy - 1, 10)), monto: 1250, tipo: 'ingreso', cuentaId: 'efectivo', categoriaId: 'salario', comercio: 'Salario', origen: 'manual' });
  const presupuestos = [
    { id: 'super', limite: 250 }, { id: 'comida', limite: 60 }, { id: 'gasolina', limite: 120 }, { id: 'entretenimiento', limite: 25 },
  ];
  const recurrentes = [
    { id: 'rdemo1', nombre: 'Internet Claro', monto: 35, dia: 22, tipo: 'gasto', cuentaId: 'efectivo', categoriaId: 'servicios', desde: hoy, activo: true },
  ];
  return { tarjetas, prestamos, movimientos, presupuestos, recurrentes };
}

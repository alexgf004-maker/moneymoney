import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ultimoCorte, fechaPagoDe, estadoTarjeta } from '../js/domain/tarjetas.js';
import { cuotaFrancesa, tablaPagos, estadoPrestamo, simularAbono } from '../js/domain/prestamo.js';
import { simularPlan, compararPlanes } from '../js/domain/deudas.js';
import { categorizar, patronSugerido } from '../js/domain/categorias.js';
import { estadoPresupuestos, recurrentesPendientes, totalGastado, proximosPagos } from '../js/domain/resumen.js';
import { procesarEntrante } from '../js/domain/entrantes.js';
import { leerMonto, dinero } from '../js/domain/dinero.js';
import { fechaConDia, sumarMeses } from '../js/domain/fechas.js';

test('montos en los dos formatos', () => {
  assert.equal(leerMonto('1,234.56'), 1234.56);
  assert.equal(leerMonto('1.234,56'), 1234.56);
  assert.equal(leerMonto('$ 25'), 25);
  assert.equal(leerMonto('1,234'), 1234);
  assert.equal(dinero(-5), '-$5.00');
  assert.equal(dinero(1234.5), '$1,234.50');
});

test('fechas con días que no existen en el mes', () => {
  assert.equal(fechaConDia(2026, 1, 31), '2026-02-28');
  assert.equal(sumarMeses('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(sumarMeses('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(fechaConDia(2026, 12, 5), '2027-01-05');
});

const tarjeta = {
  id: 't1', banco: 'agricola', nombre: 'Visa', ultimos4: '1234', limite: 1000, diaCorte: 5, diaPago: 25,
  tasaAnual: 36, minimoPct: 5, saldoInicial: 300, fechaSaldo: '2026-11-10', saldoCorteInicial: 250, pagadoCorteInicial: 0,
};

test('corte y fecha de pago', () => {
  assert.equal(ultimoCorte(tarjeta, '2026-11-14'), '2026-11-05');
  assert.equal(ultimoCorte(tarjeta, '2026-11-04'), '2026-10-05');
  assert.equal(fechaPagoDe(tarjeta, '2026-11-05'), '2026-11-25');
  // Corte el 18, pago el 8 → el pago cae el mes siguiente
  assert.equal(fechaPagoDe({ diaPago: 8 }, '2026-11-18'), '2026-12-08');
});

test('pago de contado del primer corte y compras nuevas', () => {
  const movs = [
    { id: 'a', cuentaId: 't1', tipo: 'gasto', monto: 50, fecha: '2026-11-12' },
    { id: 'b', cuentaId: 't1', tipo: 'pago', monto: 100, fecha: '2026-11-13' },
  ];
  const e = estadoTarjeta(tarjeta, movs, '2026-11-14');
  assert.equal(e.saldoActual, 250);
  assert.equal(e.saldoCorte, 250);
  assert.equal(e.contadoPendiente, 150);
  assert.equal(e.fechaPago, '2026-11-25');
  assert.equal(e.comprasCiclo, 50);
  assert.equal(e.alDia, false);
});

test('el siguiente corte toma el saldo calculado con los movimientos', () => {
  const movs = [
    { id: 'a', cuentaId: 't1', tipo: 'gasto', monto: 50, fecha: '2026-11-12' },
    { id: 'b', cuentaId: 't1', tipo: 'pago', monto: 250, fecha: '2026-11-20' },
    { id: 'c', cuentaId: 't1', tipo: 'gasto', monto: 30, fecha: '2026-12-07' },
  ];
  const e = estadoTarjeta(tarjeta, movs, '2026-12-10');
  assert.equal(e.ultimoCorte, '2026-12-05');
  assert.equal(e.saldoCorte, 100); // 300 + 50 - 250
  assert.equal(e.contadoPendiente, 100);
  assert.equal(e.saldoActual, 130);
  assert.equal(e.minimoPendiente, 5);
});

test('cuota francesa y tabla del préstamo', () => {
  const c = cuotaFrancesa(10000, 12, 12);
  assert.equal(c, 888.49);
  const p = { id: 'p1', monto: 10000, tasaAnual: 12, plazoMeses: 12, fechaPrimerPago: '2026-01-20' };
  const filas = tablaPagos(p);
  assert.equal(filas.length, 12);
  assert.equal(filas[0].interes, 100);
  assert.ok(filas[11].saldo === 0);
});

test('seguros dentro de la cuota y estado del préstamo', () => {
  const p = { id: 'p1', monto: 10000, tasaAnual: 12, plazoMeses: 12, cuota: 900, fechaPrimerPago: '2026-01-20' };
  const e = estadoPrestamo(p, [], '2026-03-25');
  assert.equal(e.cargos, 11.51);
  assert.equal(e.cuotasPagadas, 3);
  assert.equal(e.proxima.fecha, '2026-04-20');
});

test('abonar extra acorta el préstamo', () => {
  const p = { id: 'p1', monto: 8000, tasaAnual: 16.5, plazoMeses: 48, fechaPrimerPago: '2026-01-20' };
  const s = simularAbono(p, [], '2026-06-01', { extraMensual: 100 });
  assert.ok(s.mesesMenos > 8, `meses menos: ${s.mesesMenos}`);
  assert.ok(s.interesAhorrado > 400);
  const conAbono = estadoPrestamo(p, [{ cuentaId: 'p1', tipo: 'pago', extra: true, monto: 1000, fecha: '2026-03-01' }], '2026-06-01');
  assert.ok(conAbono.mesesAhorradosPorAbonos >= 6);
});

test('plan de deudas: avalancha paga menos intereses que bola de nieve', () => {
  const deudas = [
    { id: 'a', nombre: 'A', saldo: 2000, tasaAnual: 45, minimo: 80 },
    { id: 'b', nombre: 'B', saldo: 500, tasaAnual: 20, minimo: 25 },
  ];
  const c = compararPlanes(deudas, 400);
  assert.ok(c.avalancha.interesTotal <= c.bola.interesTotal);
  assert.equal(c.bola.liquidaciones[0].id, 'b');
  assert.equal(c.avalancha.liquidaciones[0].id, 'a');
  assert.ok(c.soloMinimos.interesTotal > c.avalancha.interesTotal);
  assert.equal(simularPlan(deudas, 50).viable, false);
});

test('categorías: reglas base y del usuario', () => {
  assert.equal(categorizar('SUPER SELECTOS ESCALON').categoriaId, 'super');
  assert.equal(categorizar('PUMA SANTA ELENA').categoriaId, 'gasolina');
  assert.equal(categorizar('UNO LOS PROCERES').categoriaId, 'gasolina');
  assert.equal(categorizar('UNOCASA').categoriaId, 'otros');
  assert.equal(categorizar('Farmacia Económica').categoriaId, 'salud');
  assert.equal(categorizar('ALMACEN XYZ').segura, false);
  assert.equal(categorizar('SUPER SELECTOS', [{ patron: 'selectos', categoriaId: 'hogar' }]).categoriaId, 'hogar');
  assert.equal(patronSugerido('WALMART CONSTITUCION 0234 SAN SALVADOR'), 'WALMART CONSTITUCION');
});

test('presupuesto: alerta por ritmo de gasto', () => {
  const movs = [{ tipo: 'gasto', monto: 120, fecha: '2026-11-10', categoriaId: 'super' }, { tipo: 'pago', monto: 500, fecha: '2026-11-10', cuentaId: 't1' }];
  const [e] = estadoPresupuestos({ super: 250 }, movs, '2026-11', '2026-11-10');
  assert.equal(e.nivel, 'alerta'); // 120 en 10 días → 360 al mes
  assert.equal(totalGastado(movs, '2026-11'), 120); // los pagos a tarjetas no son gasto
});

test('pagos fijos: uno por mes, sin repetir', () => {
  const r = [{ id: 'n', nombre: 'Netflix', monto: 9.99, dia: 31, tipo: 'gasto', cuentaId: 'efectivo', desde: '2026-09-15' }];
  const nuevos = recurrentesPendientes(r, new Set(), '2026-11-14');
  assert.deepEqual(nuevos.map(n => n.fecha), ['2026-09-30', '2026-10-31']);
  assert.equal(recurrentesPendientes(r, new Set(nuevos.map(n => n.id)), '2026-11-14').length, 0);
});

test('agenda de pagos', () => {
  const lista = proximosPagos({ tarjetas: [tarjeta], prestamos: [], recurrentes: [], movs: [] }, '2026-11-14', 15);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].fecha, '2026-11-25');
  assert.equal(lista[0].monto, 250);
});

test('movimiento desde correo: tarjeta por últimos 4 y categoría', () => {
  const m = procesarEntrante({ id: 'x1', banco: 'agricola', fecha: '2026-11-14', monto: 12.5, comercio: 'POLLO CAMPERO', ultimos4: '1234', tipo: 'gasto', confianza: 'alta' }, { tarjetas: [tarjeta], reglas: [] });
  assert.equal(m.id, 'gm_x1');
  assert.equal(m.cuentaId, 't1');
  assert.equal(m.categoriaId, 'comida');
  assert.equal(m.revisar, false);
  const raro = procesarEntrante({ id: 'x2', banco: 'bac', fecha: '2026-11-14', monto: 5, comercio: 'ZZZ', ultimos4: '9999', confianza: 'alta' }, { tarjetas: [tarjeta], reglas: [] });
  assert.equal(raro.cuentaId, null);
  assert.equal(raro.revisar, true);
});

test('estado de cuenta del banco: manda sobre el cálculo', () => {
  const t = { ...tarjeta, diaCorte: 23, diaPago: 17, saldoInicial: 300, fechaSaldo: '2026-11-01', saldoCorteInicial: 280 };
  const estados = [{ fechaCorte: '2026-10-23', fechaPago: '2026-11-17', contado: 129.11, minimo: 5 }];
  const movs = [{ cuentaId: 't1', tipo: 'pago', monto: 29.11, fecha: '2026-11-10' }];
  const e = estadoTarjeta(t, movs, '2026-11-14', estados);
  assert.equal(e.fuente, 'banco');
  assert.equal(e.saldoCorte, 129.11);
  assert.equal(e.contadoPendiente, 100);
  assert.equal(e.minimoPendiente, 0); // el mínimo de $5 ya quedó cubierto con el abono
  assert.equal(e.fechaPago, '2026-11-17');
  // Pasado el siguiente corte sin estado nuevo, vuelve al cálculo
  assert.equal(estadoTarjeta(t, movs, '2026-12-01', estados).fuente, 'calculado');
});

test('pago desde correo: reconoce la cuenta de origen', () => {
  const m = procesarEntrante({ id: 'p1', banco: 'bac', tipo: 'pago', fecha: '2026-11-06', monto: 92.33, ultimos4: '1234', origen4: '9999', confianza: 'alta' },
    { tarjetas: [tarjeta], reglas: [], cuentas: [{ id: 'c1', nombre: 'Ahorro', cuenta4: '9999' }] });
  assert.equal(m.tipo, 'pago');
  assert.equal(m.cuentaId, 't1');
  assert.equal(m.desdeId, 'c1');
  assert.equal(m.categoriaId, null);
  assert.equal(m.revisar, false);
});

test('Uber Eats es comida, no transporte', () => {
  assert.equal(categorizar('DLC UBER EATS -I- SAN SALVADOR SV').categoriaId, 'comida');
  assert.equal(categorizar('UBER *TRIP').categoriaId, 'transporte');
});

test('pagar una tarjeta con otra: baja una deuda y sube la otra', () => {
  const siman = { ...tarjeta, id: 'ts', ultimos4: '3333', saldoInicial: 200, fechaSaldo: '2026-03-01' };
  const cusca = { ...tarjeta, id: 'tc', ultimos4: '7777', saldoInicial: 100, fechaSaldo: '2026-03-01' };
  const m = procesarEntrante({ id: 'x', banco: 'siman', tipo: 'pago', fecha: '2026-03-10', monto: 177.84, ultimos4: '3333', origen4: '7777', confianza: 'alta' },
    { tarjetas: [siman, cusca], reglas: [], cuentas: [] });
  assert.equal(m.cuentaId, 'ts');
  assert.equal(m.desdeId, 'tc');
  assert.equal(estadoTarjeta(siman, [m], '2026-03-11').saldoActual, 22.16);
  assert.equal(estadoTarjeta(cusca, [m], '2026-03-11').saldoActual, 277.84);
  assert.equal(totalGastado([m], '2026-03'), 0); // pasar deuda de una tarjeta a otra no es gasto
});

test('el mismo movimiento en dos correos no se repite', async () => {
  const { esDuplicado } = await import('../js/domain/entrantes.js');
  const a = { id: 'gm_1', tipo: 'gasto', monto: 10, ultimos4: '1111', fecha: '2026-11-05' };
  assert.equal(esDuplicado({ ...a, id: 'gm_2', fecha: '2026-11-06' }, [a]), true);
  assert.equal(esDuplicado({ ...a, id: 'gm_2', monto: 11 }, [a]), false);
});

test('seguros que cobra el banco a la tarjeta van a intereses y cargos', () => {
  assert.equal(categorizar('MEDICARE BAC -C').categoriaId, 'comisiones');
  assert.equal(categorizar('ACCIDENTES PERSONALES').categoriaId, 'comisiones');
});

test('al corte, la app compara con el banco y puede ajustar la diferencia', async () => {
  const { movimientoDeAjuste } = await import('../js/domain/tarjetas.js');
  const t = { ...tarjeta, diaCorte: 15, diaPago: 5, saldoInicial: 255.15, fechaSaldo: '2026-11-14' };
  const movs = [{ id: 'm1', cuentaId: 't1', tipo: 'gasto', monto: 40, fecha: '2026-11-14' }, { id: 'm2', cuentaId: 't1', tipo: 'gasto', monto: 10, fecha: '2026-11-15' }];
  const estados = [{ fechaCorte: '2026-11-15', fechaPago: '2026-12-05', contado: 270.15, minimo: 25 }];
  const e = estadoTarjeta(t, movs, '2026-11-16', estados);
  // m1 es del mismo día de la configuración (ya incluido en el saldo inicial); m2 sí cuenta: 255.15 + 10 = 265.15
  assert.deepEqual(e.conciliacion, { fechaCorte: '2026-11-15', banco: 270.15, app: 265.15, diferencia: 5 });
  const aj = movimientoDeAjuste(t, e.conciliacion);
  const despues = estadoTarjeta(t, [...movs, aj], '2026-11-16', estados);
  assert.equal(despues.conciliacion.diferencia, 0);
  assert.equal(aj.categoriaId, 'comisiones');
});

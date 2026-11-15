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

test('compras en cuotas: solo la cuota del mes entra al pago de contado', () => {
  // Cocina a tasa cero: 6 cuotas de $100, ya van 4 (la 4ta en el corte del 5 nov). Extrafinanciamiento: 11 de 12, $50
  const t = {
    ...tarjeta, diaCorte: 5, diaPago: 25, saldoInicial: 300, fechaSaldo: '2026-11-10', saldoCorteInicial: 250, pagadoCorteInicial: 0,
    planes: {
      p1: { id: 'p1', nombre: 'Cocina', tipo: 'tasa0', cuota: 100, total: 6, cobradas: 4, corteRef: '2026-11-05' },
      p2: { id: 'p2', nombre: 'Extrafinanciamiento', tipo: 'extra', cuota: 50, total: 12, cobradas: 11, corteRef: '2026-11-05' },
    },
  };
  const hoy = estadoTarjeta(t, [], '2026-11-14');
  assert.equal(hoy.saldoActual, 300);
  assert.equal(hoy.enCuotas, 250); // 2 x 100 + 1 x 50
  assert.equal(hoy.deudaTotal, 550);
  assert.equal(hoy.cuotasMes, 150);
  assert.equal(hoy.contadoPendiente, 250);
  // Al corte del 5 dic se cobran la 5ta de la cocina y la última del extrafinanciamiento: 300 + 150
  const dic = estadoTarjeta(t, [{ cuentaId: 't1', tipo: 'pago', monto: 300, fecha: '2026-11-20' }], '2026-12-06');
  assert.equal(dic.saldoCorte, 150);
  assert.equal(dic.enCuotas, 100);
  const extra = dic.planes.find(p => p.id === 'p2');
  assert.equal(extra.activo, false);
  assert.equal(extra.fin, '2026-12-05');
});

test('una compra marcada en cuotas no se suma completa a la tarjeta', () => {
  const t = { ...tarjeta, saldoInicial: 0, fechaSaldo: '2026-11-01', planes: { p: { id: 'p', nombre: 'TV', tipo: 'tasa0', cuota: 50, total: 12, cobradas: 0, corteRef: '2026-11-05' } } };
  const compra = { cuentaId: 't1', tipo: 'gasto', monto: 600, fecha: '2026-11-08', plan: 'p' };
  const e = estadoTarjeta(t, [compra], '2026-11-14');
  assert.equal(e.saldoActual, 0);
  assert.equal(e.enCuotas, 600);
  assert.equal(totalGastado([compra], '2026-11'), 600); // el gasto cuenta completo el mes de la compra
});

test('un extrafinanciamiento fuera del límite no baja el disponible', () => {
  const t = {
    ...tarjeta, limite: 500, diaCorte: 9, diaPago: 30, saldoInicial: 100, fechaSaldo: '2026-11-14',
    planes: {
      ex: { id: 'ex', nombre: 'Extra', tipo: 'extra', cuota: 50, total: 12, cobradas: 10, corteRef: '2026-11-09', fueraDelLimite: true },
      tv: { id: 'tv', nombre: 'TV', tipo: 'tasa0', cuota: 5, total: 36, cobradas: 13, corteRef: '2026-11-09' },
    },
  };
  const e = estadoTarjeta(t, [], '2026-11-15');
  assert.equal(e.enCuotas, 215); // 2 x 50 + 23 x 5
  assert.equal(e.deudaTotal, 315);
  assert.equal(e.disponible, 285); // 500 - 100 - 115 (el extrafinanciamiento no cuenta)
});

test('saldo de una cuenta: ingresos suben, gastos y pagos desde la cuenta bajan', async () => {
  const { saldoCuenta } = await import('../js/domain/cuentas.js');
  const c = { id: 'c1', nombre: 'Ahorro', tipo: 'banco', saldoInicial: 1000, fechaSaldo: '2026-11-15' };
  const movs = [
    { tipo: 'ingreso', cuentaId: 'c1', monto: 800, fecha: '2026-11-25' },
    { tipo: 'gasto', cuentaId: 'c1', monto: 20, fecha: '2026-11-16' },
    { tipo: 'pago', cuentaId: 't1', desdeId: 'c1', monto: 129.11, fecha: '2026-11-17' },
    { tipo: 'gasto', cuentaId: 'c1', monto: 999, fecha: '2026-11-15' }, // del mismo día del ajuste: ya incluido
    { tipo: 'gasto', cuentaId: 't1', monto: 50, fecha: '2026-11-16' }, // con tarjeta: no toca la cuenta
  ];
  assert.equal(saldoCuenta(c, movs, '2026-11-20'), 850.89);
  assert.equal(saldoCuenta(c, movs, '2026-11-26'), 1650.89);
  assert.equal(saldoCuenta({ id: 'x' }, movs, '2026-11-20'), null);
});

test('cuánto puedo gastar hasta el próximo salario', async () => {
  const { cuantoPuedoGastar } = await import('../js/domain/cuentas.js');
  const cuentas = [{ id: 'c1', nombre: 'Ahorro', saldoInicial: 1444.26, fechaSaldo: '2026-11-15' }, { id: 'efectivo', nombre: 'Efectivo', saldoInicial: 96, fechaSaldo: '2026-11-15' }];
  const t = { ...tarjeta, diaCorte: 23, diaPago: 17, saldoInicial: 300, fechaSaldo: '2026-11-15', saldoCorteInicial: 129.11, pagadoCorteInicial: 0 };
  const recurrentes = [
    { id: 's', nombre: 'Salario', tipo: 'ingreso', monto: 800, dia: 25, cuentaId: 'c1', variable: true },
    { id: 'n', nombre: 'Internet', tipo: 'gasto', monto: 35, dia: 20, cuentaId: 'c1' },
    { id: 'x', nombre: 'Netflix', tipo: 'gasto', monto: 10, dia: 18, cuentaId: 't1' }, // a la tarjeta: no sale de la cuenta ahora
  ];
  const r = cuantoPuedoGastar({ cuentas, movs: [], tarjetas: [t], prestamos: [], recurrentes }, '2026-11-15');
  assert.equal(r.tienes, 1540.26);
  assert.equal(r.hasta, '2026-11-25');
  assert.equal(r.comprometido, 164.11); // 129.11 de la tarjeta + 35 de internet
  assert.equal(r.libre, 1376.15);
  assert.equal(r.dias, 10);
  assert.equal(r.porDia, 137.62);
});

test('salario variable: se anota el estimado y queda por confirmar', () => {
  const [m] = recurrentesPendientes([{ id: 's', nombre: 'Salario', tipo: 'ingreso', monto: 800, dia: 25, cuentaId: 'c1', desde: '2026-11-15', variable: true }], new Set(), '2026-11-25');
  assert.equal(m.monto, 800);
  assert.equal(m.revisar, true);
});

test('lo que el próximo salario no alcanza a cubrir se reserva desde ya', async () => {
  const { cuantoPuedoGastar } = await import('../js/domain/cuentas.js');
  const cuentas = [{ id: 'c1', nombre: 'Ahorro', saldoInicial: 1000, fechaSaldo: '2026-11-15' }];
  // Tarjeta: contado 100 el 17 nov; ya compró 900 en este ciclo (se paga el 17 dic) + una cuota de 200 en el corte del 23 nov
  const t = {
    ...tarjeta, diaCorte: 23, diaPago: 17, saldoInicial: 1000, fechaSaldo: '2026-11-15', saldoCorteInicial: 100, pagadoCorteInicial: 0,
    planes: { p: { id: 'p', nombre: 'Lavadora', tipo: 'tasa0', cuota: 200, total: 3, cobradas: 1, corteRef: '2026-10-23' } },
  };
  const recurrentes = [{ id: 's', nombre: 'Salario', tipo: 'ingreso', monto: 800, dia: 25, cuentaId: 'c1' }];
  const r = cuantoPuedoGastar({ cuentas, movs: [], tarjetas: [t], prestamos: [], recurrentes }, '2026-11-15');
  assert.equal(r.comprometido, 100);
  assert.equal(r.delSiguiente, 1100); // 900 de compras del ciclo + 200 de la cuota
  assert.equal(r.reservaSiguiente, 300); // el salario de 800 no alcanza: faltan 300
  assert.equal(r.libre, 600);
});

test('gastos hormiga: compras de menos de $10 y dónde se van', async () => {
  const { gastosHormiga } = await import('../js/domain/habitos.js');
  const g = (comercio, monto, fecha) => ({ tipo: 'gasto', comercio, monto, fecha, categoriaId: 'comida' });
  const movs = [
    g('STARBUCKS ESCALON', 4.5, '2026-11-02'), g('STARBUCKS ESCALON', 5, '2026-11-05'), g('STARBUCKS MULTIPLAZA', 4.5, '2026-11-09'),
    g('UBER *TRIP', 3.2, '2026-11-03'), g('WALMART', 88, '2026-11-04'), g('STARBUCKS', 4, '2026-10-20'),
    { ...g('TV', 5, '2026-11-06'), plan: 'p' },
  ];
  const h = gastosHormiga(movs, '2026-11', '2026-11-10');
  assert.equal(h.veces, 4);
  assert.equal(h.total, 17.2);
  assert.equal(h.anterior, 4);
  assert.equal(h.porComercio[0].clave, 'STARBUCKS ESCALON');
  assert.equal(h.proyeccionMes, 51.6); // 17.20 en 10 días -> 30 días
});

test('suscripciones: se detectan por repetición mensual o por ser un servicio conocido', async () => {
  const { suscripciones } = await import('../js/domain/habitos.js');
  const g = (comercio, monto, fecha, categoriaId = 'otros') => ({ tipo: 'gasto', comercio, monto, fecha, categoriaId, cuentaId: 't1' });
  const movs = [
    g('APP GIMNASIO', 25, '2026-09-10'), g('APP GIMNASIO', 25, '2026-10-10'), g('APP GIMNASIO', 25, '2026-11-10'),
    g('NETFLIX.COM', 9.99, '2026-11-08', 'suscripciones'),
    g('SUPER SELECTOS', 60, '2026-10-02'), g('SUPER SELECTOS', 15, '2026-11-02'), // montos distintos: no es suscripción
    g('STARBUCKS', 5, '2026-10-01'), g('STARBUCKS', 5, '2026-10-03'), g('STARBUCKS', 5, '2026-11-01'), // varias al mes: no
  ];
  const s = suscripciones(movs, [], '2026-11-14', { 'NETFLIXCOM': { cancelar: true } });
  assert.deepEqual(s.lista.map(x => x.clave).sort(), ['APP GIMNASIO', 'NETFLIXCOM']);
  assert.equal(s.alMes, 25); // Netflix está marcada para cancelar
  assert.equal(s.paraCancelar, 9.99);
  assert.equal(s.alAnio, 300);
});

test('línea de tiempo: cuánto se libera cada mes al terminar los compromisos', async () => {
  const { lineaDeTiempo } = await import('../js/domain/habitos.js');
  const t = lineaDeTiempo([
    { nombre: 'Lavadora', tipo: 'cuotas', mensual: 177.66, fin: '2026-12-21' },
    { nombre: 'Cocina', tipo: 'cuotas', mensual: 61.5, fin: '2027-01-23' },
    { nombre: 'Extra OLE', tipo: 'cuotas', mensual: 56.87, fin: '2027-01-09' },
    { nombre: 'Netflix', tipo: 'suscripcion', mensual: 9.99, fin: null },
  ], '2026-11-15');
  assert.equal(t.mensualHoy, 306.02);
  assert.deepEqual(t.hitos.map(h => [h.mes, h.libera, h.quedaAlMes]), [['2027-01', 177.66, 128.36], ['2027-02', 118.37, 9.99]]);
});

test('agenda: el mismo día va primero el pago más caro', () => {
  const t = (id, ultimos4, diaPago, monto) => ({ ...tarjeta, id, ultimos4, nombre: id, diaCorte: 20, diaPago, saldoInicial: monto, fechaSaldo: '2026-11-21', saldoCorteInicial: monto, pagadoCorteInicial: 0 });
  const lista = proximosPagos({ tarjetas: [t('a', '1111', 11, 50), t('b', '2222', 12, 80), t('c', '3333', 13, 40), t('d', '4444', 13, 200)], prestamos: [], recurrentes: [], movs: [] }, '2026-12-09', 15);
  assert.deepEqual(lista.map(x => x.id), ['a', 'b', 'd', 'c']);
});

test('préstamo de 60 cuotas termina en la 60, sin cuota extra de centavos', () => {
  const p = { id: 'p', monto: 7500, tasaAnual: 12.45, plazoMeses: 60, cuota: 180.93, fechaPrimerPago: '2026-08-27' };
  const filas = tablaPagos(p);
  assert.equal(filas.length, 60);
  assert.equal(filas[59].fecha, '2031-07-27');
  assert.equal(filas[59].saldo, 0);
  const e = estadoPrestamo(p, [], '2026-11-15');
  assert.equal(e.cuotasPagadas, 3);
  assert.equal(e.cuotasTotales, 60);
  assert.equal(e.cargos, 12.39);
});

test('estás por terminar: lo que acaba en 12 meses, con avance y lo que quedará al mes', async () => {
  const { lineaDeTiempo, porTerminar } = await import('../js/domain/habitos.js');
  const linea = lineaDeTiempo([
    { nombre: 'Lavadora', tipo: 'cuotas', mensual: 177.66, fin: '2026-12-21', hechas: 1, total: 3 },
    { nombre: 'Extra OLE', tipo: 'cuotas', mensual: 56.87, fin: '2027-01-09', hechas: 10, total: 12 },
    { nombre: 'Celular', tipo: 'cuotas', mensual: 4.69, fin: '2028-10-05', hechas: 2, total: 24 },
    { nombre: 'Préstamo', tipo: 'prestamo', mensual: 180.93, fin: '2031-07-27', hechas: 4, total: 60 },
  ], '2026-11-15');
  const p = porTerminar(linea, '2026-11-15');
  assert.deepEqual(p.items.map(i => [i.nombre, i.libreDesde]), [['Lavadora', '2027-01'], ['Extra OLE', '2027-02']]);
  assert.equal(p.desde, '2027-02');
  assert.equal(p.mensualHoy, 420.15);
  assert.equal(p.quedaAlMes, 185.62);
  assert.equal(porTerminar(lineaDeTiempo([{ nombre: 'Préstamo', mensual: 100, fin: '2031-01-01' }], '2026-11-15'), '2026-11-15'), null);
});

test('las claves de suscripciones no llevan puntos (Firebase no los acepta)', async () => {
  const { claveComercio } = await import('../js/domain/habitos.js');
  assert.equal(claveComercio('PEDIDOSYA.COM SV'), 'PEDIDOSYACOM');
  assert.ok(!/[.#$[\]/]/.test(claveComercio('GOOGLE *ChatGPT g.co/')));
});

test('suscripción compartida: cuenta solo tu parte', async () => {
  const { suscripciones } = await import('../js/domain/habitos.js');
  const g = (comercio, monto, fecha) => ({ id: comercio + fecha, tipo: 'gasto', comercio, monto, fecha, cuentaId: 't', categoriaId: 'servicios' });
  const movs = [g('TELECOM -C', 47.88, '2026-09-30'), g('TELECOM -C', 47.88, '2026-10-31'), g('NETFLIX', 9.99, '2026-10-08'), g('NETFLIX', 9.99, '2026-11-08')];
  const entre4 = suscripciones(movs, [], '2026-11-14', { TELECOM: { entre: 4 } });
  const tel = entre4.lista.find(x => x.clave === 'TELECOM');
  assert.equal(tel.monto, 11.97);
  assert.equal(tel.montoTotal, 47.88);
  assert.deepEqual({ ...tel.compartida }, { entre: 4 });
  assert.equal(entre4.alMes, 21.96);
  const exacta = suscripciones(movs, [], '2026-11-14', { TELECOM: { entre: 4, miParte: 12 } });
  assert.equal(exacta.lista.find(x => x.clave === 'TELECOM').monto, 12);
  assert.equal(suscripciones(movs, [], '2026-11-14', {}).lista.find(x => x.clave === 'TELECOM').compartida, null);
});

test('cuentas: mover dinero entre cuentas y pagos del mismo día después de poner el saldo', async () => {
  const { saldoCuenta, movimientosDeCuenta } = await import('../js/domain/cuentas.js');
  const agricola = { id: 'a', saldoInicial: 1444.26, fechaSaldo: '2026-11-15', saldoMomento: 1000 };
  const binance = { id: 'b', saldoInicial: 70, fechaSaldo: '2026-11-01' };
  const movs = [
    { id: 'p1', tipo: 'pago', monto: 129.11, fecha: '2026-11-15', cuentaId: 't', desdeId: 'a', creado: 2000 }, // después de poner el saldo
    { id: 'p0', tipo: 'pago', monto: 50, fecha: '2026-11-15', cuentaId: 't', desdeId: 'a', creado: 500 },     // antes: ya estaba incluido
    { id: 'x', tipo: 'transferencia', monto: 50, fecha: '2026-11-16', desdeId: 'a', cuentaId: 'b', creado: 3000 },
  ];
  assert.equal(saldoCuenta(agricola, movs, '2026-11-16'), 1265.15);
  assert.equal(saldoCuenta(binance, movs, '2026-11-16'), 120);
  const d = movimientosDeCuenta(agricola, movs, '2026-11');
  assert.deepEqual(d.lista.map(x => [x.m.id, x.efecto]), [['x', -50], ['p1', -129.11], ['p0', -50]]);
  assert.equal(d.salio, 229.11);
  assert.equal(d.entro, 0);
  assert.equal(saldoCuenta({ ...agricola, saldoMomento: undefined }, movs, '2026-11-16'), 1394.26); // cuentas viejas: el mismo día no cuenta
});

test('cuentas: un pago sin cuenta de origen se enlaza con el aviso de salida de tu banco', async () => {
  const { vincularPagos } = await import('../js/domain/cuentas.js');
  const cuentas = [{ id: 'a', banco: 'agricola', cuenta4: '1111' }, { id: 'b', banco: 'otro' }];
  const pagos = [{ id: 'p', tipo: 'pago', monto: 129.11, fecha: '2026-11-15', origen: 'correo' }, { id: 'q', tipo: 'pago', monto: 10, fecha: '2026-11-15', origen: 'correo', origen4: '1111' }, { id: 'r', tipo: 'pago', monto: 77, fecha: '2026-11-15', origen: 'correo' }];
  const salidas = [{ id: 's1', banco: 'agricola', monto: 129.11, fecha: '2026-11-15' }];
  const c = vincularPagos(pagos, cuentas, salidas, []);
  assert.deepEqual(c.map(x => [x.id, x.desdeId, x.salidaId || null]), [['p', 'a', 's1'], ['q', 'a', null]]);
  // El mismo aviso no se usa dos veces
  assert.equal(vincularPagos([{ ...pagos[0], id: 'p2' }], cuentas, salidas, [{ salidaId: 's1' }]).length, 0);
});

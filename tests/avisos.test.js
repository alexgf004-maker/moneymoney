// Pruebas de los avisos de pago (apps-script/Avisos.gs). Datos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { module: { exports: {} } };
vm.runInNewContext(readFileSync(new URL('../apps-script/Avisos.gs', import.meta.url), 'utf8'), ctx);
const { armarRecordatorio } = ctx.module.exports;
const plano = o => JSON.parse(JSON.stringify(o));

const p = (id, titulo, fecha, monto, extra = {}) => ({ id, titulo, fecha, monto, minimo: 5, tipo: 'tarjeta', vencido: false, ...extra });

test('un solo pago: aviso con monto y mínimo', () => {
  const r = armarRecordatorio([p('a', 'Pedidos Ya ···7915', '2026-11-17', 129.11)], '2026-11-16', {});
  assert.equal(r.titulo, 'Mañana vence Pedidos Ya ···7915');
  assert.equal(r.cuerpo, 'Paga $129.11 para no pagar intereses (mínimo $5.00).');
});

test('no avisa todavía a 4 días o más', () => {
  assert.equal(armarRecordatorio([p('a', 'Visa ···1111', '2026-11-20', 50)], '2026-11-16', {}), null);
});

test('varios urgentes en días cercanos: un solo aviso con todos y el total', () => {
  const pagos = [p('a', 'Tarjeta A ···1111', '2026-12-11', 50), p('b', 'Tarjeta B ···2222', '2026-12-12', 80), p('c', 'Tarjeta C ···3333', '2026-12-13', 40), p('d', 'Tarjeta D ···4444', '2026-12-13', 200)];
  const r = armarRecordatorio(pagos, '2026-12-10', {});
  assert.equal(r.titulo, '4 pagos urgentes: $370.00');
  assert.deepEqual(r.cuerpo.split('\n'), ['Tarjeta A ···1111: $50.00, mañana', 'Tarjeta B ···2222: $80.00, en 2 días', 'Tarjeta D ···4444: $200.00, en 3 días', 'Tarjeta C ···3333: $40.00, en 3 días']);
});

test('no repite el mismo aviso, pero sí avisa al cambiar de etapa', () => {
  const pagos = [p('a', 'Visa ···1111', '2026-11-20', 50)];
  const primero = armarRecordatorio(pagos, '2026-11-17', {});
  const avisados = Object.fromEntries(primero.claves.map(c => [c, true]));
  assert.equal(armarRecordatorio(pagos, '2026-11-18', avisados), null); // sigue en la etapa "pronto"
  assert.equal(armarRecordatorio(pagos, '2026-11-19', avisados).titulo, 'Mañana vence Visa ···1111');
});

test('vencido: avisa cada día; si ya llegó el pago por correo, no avisa', () => {
  const pagos = [p('a', 'BAC ···5710', '2026-11-05', 64.49)];
  assert.equal(armarRecordatorio(pagos, '2026-11-07', {}).titulo, 'Venció el pago de BAC ···5710');
  assert.equal(armarRecordatorio(pagos, '2026-11-07', {}, { 5710: '2026-11-06' }), null);
  assert.deepEqual(plano(armarRecordatorio(pagos, '2026-11-08', { 'a|2026-11-05|vencido-2026-11-07': true }).claves), ['a|2026-11-05|vencido-2026-11-08']);
});

test('imagen grande según el caso', () => {
  assert.equal(armarRecordatorio([p('a', 'Visa ···1111', '2026-11-18', 50)], '2026-11-16', {}).imagen, 'aviso-pago.jpg');
  assert.equal(armarRecordatorio([p('a', 'Visa ···1111', '2026-11-16', 50)], '2026-11-16', {}).imagen, 'aviso-hoy.jpg');
  assert.equal(armarRecordatorio([p('a', 'Visa ···1111', '2026-11-16', 50), p('b', 'BAC ···2222', '2026-11-17', 40)], '2026-11-16', {}).imagen, 'aviso-urgentes.jpg');
  assert.equal(armarRecordatorio([p('a', 'Visa ···1111', '2026-11-10', 50), p('b', 'BAC ···2222', '2026-11-17', 40)], '2026-11-16', {}).imagen, 'aviso-vencido.jpg');
});

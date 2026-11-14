// Pruebas del lector de correos (apps-script/Lector.gs). Los ejemplos son inventados con los formatos más
// comunes; cuando lleguen correos reales de cada banco se agregan aquí (con datos cambiados).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const codigo = readFileSync(new URL('../apps-script/Lector.gs', import.meta.url), 'utf8');
const ctx = { module: { exports: {} } };
vm.runInNewContext(codigo, ctx);
const { leerCorreo } = ctx.module.exports;

test('compra con etiquetas (tabla HTML)', () => {
  const r = leerCorreo({
    de: 'Alertas <alertas@bancoagricola.com>',
    asunto: 'Notificación de transacción',
    cuerpo: '<table><tr><td>Comercio:</td><td>SUPER SELECTOS ESCALON</td></tr><tr><td>Monto:</td><td>USD 45.30</td></tr><tr><td>Tarjeta:</td><td>VISA ****1234</td></tr></table>',
    fecha: '2026-11-14',
  });
  assert.equal(r.banco, 'agricola');
  assert.equal(r.monto, 45.3);
  assert.equal(r.ultimos4, '1234');
  assert.equal(r.comercio, 'SUPER SELECTOS ESCALON');
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.confianza, 'alta');
});

test('compra en una frase', () => {
  const r = leerCorreo({
    de: 'notificacion@baccredomatic.com',
    asunto: 'Compra aprobada',
    cuerpo: 'Se realizó una compra con tu tarjeta terminada en 5678 por $1,250.00 en PRICESMART SANTA ELENA el día 14/11/2026.',
    fecha: '2026-11-14',
  });
  assert.equal(r.banco, 'bac');
  assert.equal(r.monto, 1250);
  assert.equal(r.ultimos4, '5678');
  assert.equal(r.comercio, 'PRICESMART SANTA ELENA');
});

test('pago recibido y reversión', () => {
  const pago = leerCorreo({ de: 'x@bancocuscatlan.com', asunto: 'Pago recibido', cuerpo: 'Hemos recibido tu pago de $300.00 a tu tarjeta terminada en 4321.', fecha: '2026-11-14' });
  assert.equal(pago.tipo, 'pago');
  assert.equal(pago.monto, 300);
  const rev = leerCorreo({ de: 'x@credicomer.com.sv', asunto: 'Reversión de compra', cuerpo: 'Reversión de transacción. Comercio: AMAZON. Monto: $20.00. Tarjeta XXXX1111', fecha: '2026-11-14' });
  assert.equal(rev.tipo, 'reembolso');
  assert.equal(rev.comercio, 'AMAZON');
});

test('ignora promociones y remitentes que no son bancos', () => {
  assert.equal(leerCorreo({ de: 'promo@bancoagricola.com', asunto: '¡Aprovecha nuestras ofertas!', cuerpo: 'Viaja este verano', fecha: '2026-11-14' }), null);
  assert.equal(leerCorreo({ de: 'amigo@gmail.com', asunto: 'Compra', cuerpo: 'Compra por $10 en X', fecha: '2026-11-14' }), null);
});

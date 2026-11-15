// Pruebas del lector de correos (apps-script/Lector.gs). Los ejemplos copian el FORMATO de correos reales
// de cada banco (nov 2026), con nombres, números de tarjeta y montos inventados: el repositorio es público.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const codigo = readFileSync(new URL('../apps-script/Lector.gs', import.meta.url), 'utf8');
const ctx = { module: { exports: {} } };
vm.runInNewContext(codigo, ctx);
const { leerCorreo } = ctx.module.exports;
const plano = o => JSON.parse(JSON.stringify(o));

test('Agrícola: alerta de compra (Plan Alerta 365)', () => {
  const r = leerCorreo({
    de: 'Plan Alerta 365 <alertas@bancoagricola.com>',
    asunto: 'Notificación de Plan Alerta 365',
    cuerpo: `<div>Notificación de</div><h1>Plan Alerta 365</h1>
      <p>Estimado(a): <b>JUAN PEREZ LOPEZ</b></p>
      <p>Por este medio deseamos informarle que su tarjeta de crédito 1111 ha realizado una compra por USD 26.85 en N1CO*VIDRI LOURDES N1C COLON</p>
      <p>Fecha/Hora: 03/11/2026 15:21:03</p>
      <p>En caso de no haber realizado esta transacción, por favor reportarla llamando al teléfono 2210-0000 Call Center de Bancoagrícola.</p>`,
    fecha: '2026-11-04',
  });
  assert.deepEqual(plano(r), {
    tipo: 'gasto', monto: 26.85, ultimos4: '1111', comercio: 'N1CO*VIDRI LOURDES N1C COLON', fecha: '2026-11-03',
    origen4: null, confianza: 'alta', banco: 'agricola', asunto: 'Notificación de Plan Alerta 365',
  });
});

test('Credicomer: alerta monetaria (etiqueta y valor en líneas separadas)', () => {
  const r = leerCorreo({
    de: 'ALERTAS CREDICOMER <alertas@credicomer.com.sv>',
    asunto: 'ALERTA MONETARIA TARJETAS CREDICOMER',
    cuerpo: `<h2>Transacción Exitosa</h2><p>Te presentamos el comprobante de la Transacción realizada</p>
      <div><div>Cliente</div><div>JUAN PEREZ LOPEZ</div></div>
      <div><div>Número de tarjeta</div><div>**** **** **** 2222</div></div>
      <div><div>Monto</div><div>$ 7.39</div></div>
      <div><div>Comercio</div><div>DLC UBER EATS -I- SAN SALVADOR SV</div></div>
      <div><div>Fecha</div><div>07/11/2026</div></div>`,
    fecha: '2026-11-07',
  });
  assert.equal(r.banco, 'credicomer');
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.monto, 7.39);
  assert.equal(r.ultimos4, '2222');
  assert.equal(r.comercio, 'DLC UBER EATS -I- SAN SALVADOR SV');
  assert.equal(r.fecha, '2026-11-07');
});

test('BAC: abono a la tarjeta por Transfer365 (es un pago, con la cuenta de origen)', () => {
  const r = leerCorreo({
    de: 'notificaciones@notificacionesbac.com',
    asunto: 'Notificación de Crédito Transfer365 del Banco Central de Reserva',
    cuerpo: `<p>Estimado(a): JUAN PEREZ,</p>
      <p>BAC le notifica que ha recibido un abono a su tarjeta: ************3333 por medio del Sistema Transfer365 del Banco Central de Reserva.</p>
      <p><u>Detalle de la transferencia</u><br>Fecha de aplicación: 2026-11-06 04:11:03<br>Referencia: VPE5100000000000000000000001<br>
      Cliente Origen: JUAN PEREZ LOPEZ<br>Cuenta Origen: **********4444<br>Concepto: pago<br>Banco Origen: AGRÍCOLA<br>Monto: $92.33</p>`,
    fecha: '2026-11-06',
  });
  assert.equal(r.banco, 'bac');
  assert.equal(r.tipo, 'pago');
  assert.equal(r.monto, 92.33);
  assert.equal(r.ultimos4, '3333');
  assert.equal(r.origen4, '4444');
  assert.equal(r.fecha, '2026-11-06');
});

test('Agrícola: pago de tarjeta propia (monto solo en el PDF adjunto)', () => {
  const sinPdf = {
    de: 'canalesdigitales@bancoagricola.com',
    asunto: 'Notificación de transacción',
    cuerpo: '<p>Por este medio deseamos informarte que se ha aplicado satisfactoriamente tu transacción: <i>Pago de tarjeta de crédito propia</i></p><ul><li>ID: abc123</li><li>Fecha/hora: 14/11/2026 10:25:21</li></ul>',
    fecha: '2026-11-14',
  };
  assert.equal(leerCorreo(sinPdf), null);
  const r = leerCorreo({ ...sinPdf, adjunto: 'Bancoagrícola\nPago de tarjeta de crédito propia\nDatos del ticket\nTarjeta **** 5555\nFecha de pago 14/11/2026\nMonto del pago $463.61\nConcepto Ya\nDesde 1234566666 CA\nEstado FINALIZADO' });
  assert.equal(r.tipo, 'pago');
  assert.equal(r.monto, 463.61);
  assert.equal(r.ultimos4, '5555');
  assert.equal(r.origen4, '6666');
  assert.equal(r.fecha, '2026-11-14');
});

test('Cuscatlán: estado de cuenta digital', () => {
  const r = leerCorreo({
    de: 'Banco Cuscatlan <estadosdecuenta@bancocuscatlan.com>',
    asunto: 'Estado de Cuenta Digital',
    cuerpo: `<h1>Estado de Cuenta Digital</h1><p>Estimado(a) Cliente: JUAN PEREZ LOPEZ</p>
      <p>Adjunto encontrarás el estado de cuenta mensual de tu Tarjeta de Crédito CASH BACK PEDIDOS YA VISA CUSCATLAN.</p>
      <p>Tarjeta Nº</p><p>431063******7777</p>
      <table><tr><td>Fecha de corte:</td><td>23/10/2026</td></tr><tr><td>Última fecha de pago:</td><td>17/11/2026</td></tr>
      <tr><td>Pago mínimo:</td><td>$5.00</td></tr><tr><td>Pago de contado:</td><td>$129.11</td></tr></table>`,
    fecha: '2026-10-24',
  });
  assert.deepEqual(plano(r), {
    tipo: 'estado', ultimos4: '7777', nombre: 'CASH BACK PEDIDOS YA VISA CUSCATLAN', fechaCorte: '2026-10-23', fechaPago: '2026-11-17',
    contado: 129.11, minimo: 5, banco: 'cuscatlan', asunto: 'Estado de Cuenta Digital',
  });
});

test('BAC: estado de cuenta (número con XX y fechas con guiones)', () => {
  const r = leerCorreo({
    de: 'BAC Credomatic <estadosdecuenta@baccredomatic.com>',
    asunto: 'Estado de cuenta Tarjeta de Crédito',
    cuerpo: `<h1>Tarjeta de Crédito</h1><p>Estimado/a cliente, JUAN PEREZ</p><p>Por este medio te enviamos el estado de cuenta de tu tarjeta.</p>
      <table><tr><td>Tipo de cuenta</td></tr><tr><td>4568-46XX-XXXX-8888</td></tr></table>
      <table><tr><td>Fecha de corte<br>09-11-2026</td><td>Fecha de vencimiento<br>30-11-2026</td></tr></table>
      <table><tr><td>Pago mínimo dólares</td><td>$ 59.00</td></tr><tr><td>Pago de contado dólares</td><td>$ 101.35</td></tr></table>`,
    fecha: '2026-11-10',
  });
  assert.equal(r.tipo, 'estado');
  assert.equal(r.banco, 'bac');
  assert.equal(r.ultimos4, '8888');
  assert.equal(r.fechaCorte, '2026-11-09');
  assert.equal(r.fechaPago, '2026-11-30');
  assert.equal(r.minimo, 59);
  assert.equal(r.contado, 101.35);
});

test('EMMA (Credicomer): estado de cuenta con moneda local y dólares', () => {
  const r = leerCorreo({
    de: 'EMMA Estados de Cuenta <estados@emmapay.com>',
    asunto: 'Estado de Cuenta VISA EMMA',
    cuerpo: `<p>Estimado(a) Cliente, Adjunto encontrará el Estado de Cuenta de su Tarjeta.</p>
      <table><tr><td><b>Resumen de su Estado de Cuenta</b></td></tr>
      <tr><td>Pago de Contado Moneda Local:</td><td>0.00</td></tr><tr><td>Pago de Contado Dólares:</td><td>$ 38.69</td></tr>
      <tr><td>Pago Mínimo Moneda Local</td><td>0.00</td></tr><tr><td>Pago Mínimo Dólares:</td><td>$ 5.00</td></tr>
      <tr><td>Fecha de Corte:</td><td>08/11/2026</td></tr><tr><td>Fecha Límite Para Pago de Contado:</td><td></td></tr>
      <tr><td>Fecha Límite Para Pago Mínimo</td><td>04/12/2026</td></tr></table>`,
    fecha: '2026-11-09',
  });
  assert.equal(r.tipo, 'estado');
  assert.equal(r.banco, 'credicomer');
  assert.equal(r.nombre, 'VISA EMMA');
  assert.equal(r.contado, 38.69);
  assert.equal(r.minimo, 5);
  assert.equal(r.fechaCorte, '2026-11-08');
  assert.equal(r.fechaPago, '2026-12-04');
});

test('formatos generales: reversión y frase con "terminada en"', () => {
  const rev = leerCorreo({ de: 'x@credicomer.com.sv', asunto: 'Reversión de compra', cuerpo: 'Reversión de transacción. Comercio: AMAZON. Monto: $20.00. Tarjeta XXXX1111', fecha: '2026-11-14' });
  assert.equal(rev.tipo, 'reembolso');
  assert.equal(rev.comercio, 'AMAZON');
  const c = leerCorreo({ de: 'notificacion@baccredomatic.com', asunto: 'Compra aprobada', cuerpo: 'Se realizó una compra con tu tarjeta terminada en 5678 por $1,250.00 en PRICESMART SANTA ELENA el día 14/11/2026.', fecha: '2026-11-14' });
  assert.equal(c.monto, 1250);
  assert.equal(c.ultimos4, '5678');
  assert.equal(c.comercio, 'PRICESMART SANTA ELENA');
  assert.equal(c.fecha, '2026-11-14');
});

test('ignora promociones y correos que no son de bancos', () => {
  assert.equal(leerCorreo({ de: 'promo@bancoagricola.com', asunto: '¡Aprovecha nuestras ofertas!', cuerpo: 'Viaja este verano', fecha: '2026-11-14' }), null);
  assert.equal(leerCorreo({ de: 'amigo@gmail.com', asunto: 'Compra', cuerpo: 'Compra por $10 en X', fecha: '2026-11-14' }), null);
});

test('Siman: movimiento en tarjeta CREDISIMAN (comercio en minúsculas)', () => {
  const r = leerCorreo({
    de: 'Notificaciones <notificaciones@credisiman.com>',
    asunto: 'Juan Perez, notificación de movimiento en su tarjeta CREDISIMAN 21/07/2026',
    cuerpo: '<p>Estimado(a) JUAN PEREZ</p><p>Se le informa que su tarjeta <b>CREDISIMAN</b> <b>3333</b> ha realizado <b>compra</b> por USD <b>$ 44.99</b> en <b>PM.Merliot</b>.</p><p>Cualquier consulta o información adicional, comuníquese al teléfono <b>2298-0000</b>.</p>',
    fecha: '2026-07-21',
  });
  assert.equal(r.banco, 'siman');
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.monto, 44.99);
  assert.equal(r.ultimos4, '3333');
  assert.equal(r.comercio, 'PM.Merliot');
});

test('Cuscatlán: compra con tarjeta titular', () => {
  const r = leerCorreo({
    de: 'Notificaciones <notificaciones@bancocuscatlan.com>',
    asunto: 'Compra con Tarjeta de Credito Titular',
    cuerpo: '<p><b>Estimado Cliente: JUAN</b></p><p>Se ha realizado una compra con su tarjeta titular de Banco CUSCATLAN XXXXXXXXXX7777 por USD 15.23 en POLLO CAMPERO C710 SAN MA el día 2026-11-05 12:56. Consultas al 22120000.</p>',
    fecha: '2026-11-05',
  });
  assert.equal(r.banco, 'cuscatlan');
  assert.equal(r.monto, 15.23);
  assert.equal(r.ultimos4, '7777');
  assert.equal(r.comercio, 'POLLO CAMPERO C710 SAN MA');
  assert.equal(r.fecha, '2026-11-05');
});

test('BAC: compra con "Detalles del movimiento" en tabla y monto sin $', () => {
  const r = leerCorreo({
    de: 'Alertas BAC <alertas@notificacionesbaccr.com>',
    asunto: 'Alerta de compra',
    cuerpo: `<h2>Estimado/a: JUAN PEREZ LOPEZ</h2><p>Se acaba de realizar una compra con tu tarjeta <b>MASTERCARD</b> terminada en <b>4444</b></p>
      <h3>Detalles del movimiento:</h3>
      <table><tr><td><img alt=""></td><td><img alt=""></td></tr><tr><td>Comercio</td><td>Monto</td></tr><tr><td>WALMART CONSTITUCION</td><td>177.78</td></tr></table>
      <table><tr><td>Fecha y hora</td></tr><tr><td>2026/10/17-11:06:03</td></tr></table>`,
    fecha: '2026-10-17',
  });
  assert.equal(r.banco, 'bac');
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.monto, 177.78);
  assert.equal(r.ultimos4, '4444');
  assert.equal(r.comercio, 'WALMART CONSTITUCION');
  assert.equal(r.fecha, '2026-10-17');
});

test('Cuscatlán: pago de servicio "Siman en línea" = pago a la tarjeta Siman desde la tarjeta Cuscatlán', () => {
  const cuerpo = (servicio, asociacion) => `<h2>Pago de servicio</h2><p>Hola, Juan</p><p>Le informamos que el resultado del pago de servicio es el siguiente: <b>exitoso.</b></p>
    <div><b>Pago exitoso</b></div><div>Tu producto</div><div><b>Juan Perez</b></div><div>************7777</div><div>Tarjeta de Credito - Banco CUSCATLAN</div>
    <div>Servicio pagado:</div><div><b>${servicio}</b></div><div>Número de asociación:</div><div><b>${asociacion}</b></div>
    <div>Monto</div><div><b>$177.84</b></div><div>Fecha y hora</div><div><b>10/03/2026 11:33:35</b></div>`;
  const r = leerCorreo({ de: 'Banco Cuscatlan <notificaciones@bancocuscatlan.com>', asunto: 'Pago de servicio', cuerpo: cuerpo('Siman en línea', '6000000000003333'), fecha: '2026-03-10' });
  assert.equal(r.tipo, 'pago');
  assert.equal(r.banco, 'siman');
  assert.equal(r.ultimos4, '3333');
  assert.equal(r.origen4, '7777');
  assert.equal(r.monto, 177.84);
  assert.equal(r.fecha, '2026-03-10');
  // Si lo pagado no es una tarjeta, es un gasto en la tarjeta Cuscatlán
  const luz = leerCorreo({ de: 'Banco Cuscatlan <notificaciones@bancocuscatlan.com>', asunto: 'Pago de servicio', cuerpo: cuerpo('DELSUR', '1234567'), fecha: '2026-03-10' });
  assert.equal(luz.tipo, 'gasto');
  assert.equal(luz.ultimos4, '7777');
  assert.equal(luz.comercio, 'DELSUR');
});

test('publicidad del banco con montos no es un movimiento', () => {
  const promo = (asunto, cuerpo) => leerCorreo({ de: 'Banco Agrícola <promociones@bancoagricola.com>', asunto, cuerpo, fecha: '2026-11-13' });
  assert.equal(promo('¡Tu moto de trabajo te espera!', 'Obtén un crédito de hasta $3,000.00 para tu moto. Solicítalo hoy y paga tu compra en cuotas.'), null);
  assert.equal(promo('El Extra que necesitas. Tómalo ya', 'Tienes disponible un préstamo de $2,100.00 con tu tarjeta. Pago a 12 meses.'), null);
  // Sin dígitos de tarjeta tampoco cuenta, aunque el asunto no parezca publicidad
  assert.equal(promo('Notificación', 'Te informamos sobre un cargo de $20.00 en tu cuenta.'), null);
});

test('Agrícola: transferencias de la cuenta no son movimientos de tarjeta', () => {
  const leer = cuerpo => leerCorreo({ de: 'canalesdigitales@bancoagricola.com', asunto: 'Notificación de transacción', cuerpo, fecha: '2026-11-13' });
  assert.equal(leer('Se ha aplicado satisfactoriamente tu transacción: Transferencia a terceros. Cuenta origen ****9999. Monto $20.00'), null);
  assert.equal(leer('Hemos recibido un abono a tu cuenta de ahorro ****9999 por $50.00'), null);
});

test('compra con tarjeta de débito queda marcada como débito', () => {
  const r = leerCorreo({ de: 'alertas@bancoagricola.com', asunto: 'Plan Alerta 365', cuerpo: 'Su tarjeta de débito 1234 ha realizado una compra por USD 12.00 en SUPER SELECTOS', fecha: '2026-11-13' });
  assert.equal(r.tipo, 'gasto');
  assert.equal(r.ultimos4, '1234');
  assert.equal(r.debito, true);
});

test('el análisis dice qué pasó con cada correo del banco', () => {
  const { analizarCorreo } = ctx.module.exports;
  const a = c => analizarCorreo({ fecha: '2026-11-13', ...c }).resultado;
  assert.equal(a({ de: 'alertas@bancoagricola.com', asunto: 'Plan Alerta 365', cuerpo: 'su tarjeta de crédito 1111 ha realizado una compra por USD 5.00 en TIENDA' }), 'movimiento');
  assert.equal(a({ de: 'promo@bancoagricola.com', asunto: 'El Extra que necesitas', cuerpo: 'préstamo de $2,100.00' }), 'publicidad');
  assert.equal(a({ de: 'alertas@bancoagricola.com', asunto: 'Notificación', cuerpo: 'Se realizó un cargo de $20.00' }), 'sin-tarjeta');
  assert.equal(a({ de: 'amigo@gmail.com', asunto: 'Hola', cuerpo: 'nos vemos' }), 'ajeno');
});

test('BAC: estado de cuenta con etiquetas en una fila y valores en la de abajo, y acentos en código', () => {
  const r = leerCorreo({
    de: 'BAC Credomatic <estadosdecuenta@baccredomatic.com>',
    asunto: 'Estado de Cuenta Digital BAC Credomatic',
    cuerpo: `<p>Por este medio te enviamos el estado de cuenta de tu tarjeta.</p>
      <table><tr><td>Tipo de cuenta</td></tr><tr><td>4568-46XX-XXXX-8888</td></tr></table>
      <table><tr><td>Fecha de corte</td><td></td><td>Fecha de vencimiento</td></tr><tr><td>09-11-2026</td><td></td><td>30-11-2026</td></tr></table>
      <table><tr><td>Pago m&#237;nimo d&#243;lares</td><td>Pago de contado d&#243;lares</td></tr><tr><td>&#36; 59.00</td><td>&#36; 101.35</td></tr></table>`,
    fecha: '2026-11-10',
  });
  assert.equal(r.tipo, 'estado');
  assert.equal(r.ultimos4, '8888');
  assert.equal(r.fechaCorte, '2026-11-09');
  assert.equal(r.fechaPago, '2026-11-30');
  assert.equal(r.minimo, 59);
  assert.equal(r.contado, 101.35);
});

test('publicidad sin montos ni tarjeta no queda "por revisar"; Transfer365 de tu cuenta es transferencia', () => {
  const { analizarCorreo } = ctx.module.exports;
  const promo = analizarCorreo({ de: 'promos@bancocuscatlan.com', asunto: '15% OFF en videojuegos', cuerpo: 'Paga con tu tarjeta de crédito Cuscatlán y obtén 15% de descuento en tu compra.', fecha: '2026-11-11' });
  assert.equal(promo.resultado, 'aviso');
  const salida = analizarCorreo({ de: 'notificaciones@bancoagricola.com', asunto: 'Transfer365 - Notificación de transferencia', cuerpo: 'Banco Agrícola. Transfer365. Has realizado una transferencia. Monto: $129.11. Banco destino: Banco Cuscatlán', fecha: '2026-11-15' });
  assert.equal(salida.resultado, 'transferencia');
});

test('BAC: estado de cuenta tal como lo lee Gmail ("dólares" en la línea siguiente)', () => {
  const r = leerCorreo({
    de: 'BAC Credomatic <estadosdecuenta@baccredomatic.com>',
    asunto: 'Estado de Cuenta Digital BAC Credomatic',
    cuerpo: `|\nTarjeta de Crédito\n|\nEstimado/a cliente, JUAN PEREZ\nPor este medio te enviamos el estado de cuenta de tu tarjeta.\n|\nTipo de cuenta\n4568-46XX-XXXX-8888\n|\n|\nFecha de corte\n09-11-2026\n|\nFecha de vencimiento\n30-11-2026\n|\n|\nPago mínimo\ndólares\n|\n$ 59.00\n|\n|\nPago de contado\ndólares\n|\n$ 101.35\n|\n-->\n|\nAntes de imprimir este correo verifique si es necesario hacerlo.`,
    fecha: '2026-11-10',
  });
  assert.equal(r.tipo, 'estado');
  assert.equal(r.ultimos4, '8888');
  assert.equal(r.fechaCorte, '2026-11-09');
  assert.equal(r.fechaPago, '2026-11-30');
  assert.equal(r.minimo, 59);
  assert.equal(r.contado, 101.35);
});

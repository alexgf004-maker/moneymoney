// Lee el texto de un correo del banco y saca lo que sirve:
//  - compra, pago o devolución: { tipo, monto, ultimos4, comercio, fecha, origen4, confianza }
//  - estado de cuenta: { tipo: 'estado', ultimos4, nombre, fechaCorte, fechaPago, contado, minimo }
// No usa nada propio de Google: las pruebas lo cargan igual en Node (tests/lector.test.js).
//
// Formatos vistos en correos reales (nov 2026):
//  Agrícola  "su tarjeta de crédito 1234 ha realizado una compra por USD 26.85 en COMERCIO / Fecha/Hora: dd/mm/aaaa"
//  Agrícola  "Pago de tarjeta de crédito propia" (el monto viene solo en el PDF adjunto: Tarjeta **** 1234 / Monto del pago)
//  Credicomer "Número de tarjeta / **** **** **** 1234 / Monto / $ 7.39 / Comercio / X / Fecha / dd/mm/aaaa" (etiqueta y valor en líneas)
//  BAC       "ha recibido un abono a su tarjeta: ****1234 ... Cuenta Origen: ****5678 ... Monto: $92.33" (Transfer365)
//  Estados de cuenta de Cuscatlán, BAC y EMMA (Credicomer): fecha de corte, fecha límite, pago mínimo y de contado

var BANCOS = [
  { id: 'agricola', nombre: 'Banco Agrícola', remitentes: ['bancoagricola', 'agricola'], texto: /banco\s?agr[ií]cola/i },
  { id: 'bac', nombre: 'BAC', remitentes: ['baccredomatic', 'credomatic', 'bac.com', 'notificacionesbac'], texto: /\bBAC\b|credomatic/ },
  { id: 'cuscatlan', nombre: 'Banco Cuscatlán', remitentes: ['cuscatlan'], texto: /cuscatl[aá]n/i },
  { id: 'credicomer', nombre: 'Credicomer', remitentes: ['credicomer', 'emmapay', 'emma'], texto: /credicomer|visa emma|emmapay/i },
  { id: 'siman', nombre: 'Siman', remitentes: ['siman'], texto: /\bsiman\b/i },
];

// Palabras para la búsqueda en Gmail (remitente o asunto)
var BUSQUEDA_REMITENTES = ['bancoagricola', 'baccredomatic', 'credomatic', 'cuscatlan', 'credicomer', 'emmapay', 'emma', 'siman'];
var BUSQUEDA_ASUNTOS = ['"estado de cuenta"', '"alerta"', '"transfer365"', '"notificación"', '"transacción"', '"compra"'];

function bancoPorRemitente(de) {
  var t = String(de || '').toLowerCase();
  for (var i = 0; i < BANCOS.length; i++) {
    for (var j = 0; j < BANCOS[i].remitentes.length; j++) {
      if (t.indexOf(BANCOS[i].remitentes[j]) >= 0) return BANCOS[i];
    }
  }
  return null;
}

function bancoPorTexto(texto) {
  var inicio = String(texto || '').slice(0, 1500);
  for (var i = 0; i < BANCOS.length; i++) if (BANCOS[i].texto.test(inicio)) return BANCOS[i];
  return null;
}

function textoPlano(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table)[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#36;/g, '$').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\| ?(\| ?)+/g, ' | ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function leerNumero(s) {
  s = String(s).replace(/[^\d.,]/g, '');
  var p = s.lastIndexOf('.'), c = s.lastIndexOf(',');
  if (c > p) s = s.length - c - 1 <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(/,/g, '');
  return Math.round(parseFloat(s) * 100) / 100;
}

var DOS = function (n) { return (n < 10 ? '0' : '') + n; };

// dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd -> aaaa-mm-dd
function leerFecha(s) {
  var m = String(s || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + DOS(+m[2]) + '-' + DOS(+m[3]);
  m = String(s || '').match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return m[3] + '-' + DOS(+m[2]) + '-' + DOS(+m[1]);
  return null;
}

var FECHA = '(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4}|\\d{4}-\\d{1,2}-\\d{1,2})';
// Separador entre etiqueta y valor: dos puntos, barra de tabla o salto de línea
var SEP = '[\\s:|]*';

function fechaEtiquetada(texto, etiquetas) {
  for (var i = 0; i < etiquetas.length; i++) {
    var m = texto.match(new RegExp(etiquetas[i] + SEP + FECHA, 'i'));
    if (m) return leerFecha(m[1]);
  }
  return null;
}

function buscarMonto(texto) {
  var etiquetado = texto.match(/(?:monto(?: del pago)?|valor|importe|total)[^\d$\n]{0,20}\n?[\s:|]*(?:US\s?\$|USD|\$)?\s?([\d.,]*\d)/i);
  if (etiquetado) return leerNumero(etiquetado[1]);
  var conSigno = texto.match(/(?:US\s?\$|USD\s?|\$)\s?([\d.,]*\d)/);
  return conSigno ? leerNumero(conSigno[1]) : null;
}

function buscarUltimos4(texto) {
  var m = texto.match(/(?:terminad[ao]|finalizad[ao]|que termina|con terminaci[oó]n)\s*(?:en)?\s*[:#]?\s*\**\s*(\d{4})\b/i)
    || texto.match(/tarjeta(?: de cr[eé]dito| de d[eé]bito)?[\s:|]*(\d{4})\b(?!\s*[-\/]\d)/i)
    || texto.match(/(?:\*{2,}|[xX]{2,}|•{2,})[\s-]?(\d{4})\b/);
  return m ? m[1] : null;
}

// Últimos 4 de la cuenta de donde salió un pago (Transfer365 o comprobante)
function buscarOrigen4(texto) {
  var m = texto.match(/cuenta origen[\s:|]*[*xX]*(\d{4})\b/i) || texto.match(/\bdesde[\s:|]*\d*(\d{4})\s*(?:CA|CC|AH)?\b/i);
  return m ? m[1] : null;
}

function limpiarComercio(s) {
  return String(s || '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\b(el d[ií]a|fecha|hora|por un monto|monto|con (tu|su) tarjeta)\b[\s\S]*$/i, '')
    .replace(/[.,;:\-\s]+$/, '')
    .trim()
    .slice(0, 60);
}

function buscarComercio(texto) {
  var m = texto.match(/(?:comercio|establecimiento|nombre del comercio)[\s:|]*\n?[\s:|]*([^\n|]{2,60})/i);
  if (m && /[A-Za-z]/.test(limpiarComercio(m[1]))) return limpiarComercio(m[1]);
  // "... en NOMBRE DEL COMERCIO": se toma el primero que tenga letras ("terminada en 5678" no cuenta)
  var re = /\ben(?: el comercio)?\s+([A-Z0-9][A-Z0-9 .&*'\/-]{2,50})(?=\s+(?:el d[ií]a|por|con)\b|[.,\n]|$)/g;
  while ((m = re.exec(texto))) {
    var c = limpiarComercio(m[1]);
    if (/[A-Za-z]/.test(c)) return c;
  }
  return null;
}

function tipoDe(texto) {
  if (/reversi[oó]n|devoluci[oó]n|anulaci[oó]n|reembolso/i.test(texto)) return 'reembolso';
  if (/(ha recibido|hemos recibido|recibimos|aplicamos|se ha aplicado)\s+(tu|su|un)?\s*(pago|abono)|abono a (tu|su) tarjeta|pago (a|de) (tu|su) tarjeta|pago de tarjeta de cr[eé]dito/i.test(texto)) return 'pago';
  return 'gasto';
}

var PALABRAS_TRANSACCION = /compra|consumo|transacci[oó]n|cargo|retiro|pago|abono|autoriz|d[eé]bito|reversi|devoluci/i;

function lectorTransaccion(texto) {
  if (!PALABRAS_TRANSACCION.test(texto)) return null;
  var monto = buscarMonto(texto);
  if (!monto) return null;
  var tipo = tipoDe(texto);
  var datos = {
    tipo: tipo,
    monto: monto,
    ultimos4: buscarUltimos4(texto),
    comercio: tipo === 'pago' ? null : buscarComercio(texto),
    fecha: fechaEtiquetada(texto, ['fecha\\s*\\/\\s*hora', 'fecha de aplicaci[oó]n', 'fecha de pago', 'fecha aplicada', 'fecha']),
    origen4: tipo === 'pago' ? buscarOrigen4(texto) : null,
  };
  datos.confianza = datos.ultimos4 && (tipo === 'pago' || datos.comercio) ? 'alta' : 'baja';
  return datos;
}

// En los estados de cuenta a veces hay montos en moneda local y en dólares: se prefiere el de dólares
function montoDeEstado(texto, etiqueta) {
  var re = new RegExp(etiqueta + '([^\\n:|$\\d]{0,25})' + SEP + '(?:US\\s?\\$|\\$)?\\s?([\\d.,]*\\d)', 'gi');
  var m, opciones = [];
  while ((m = re.exec(texto))) opciones.push({ label: m[1].toLowerCase(), valor: leerNumero(m[2]) });
  if (!opciones.length) return null;
  var dolares = opciones.filter(function (o) { return /d[oó]lar/.test(o.label); })[0];
  if (dolares) return dolares.valor;
  var noLocal = opciones.filter(function (o) { return !/local/.test(o.label); })[0];
  return (noLocal || opciones[0]).valor;
}

function esEstadoDeCuenta(texto) {
  return /estado de cuenta/i.test(texto) && /pago de contado/i.test(texto) && /fecha de corte/i.test(texto);
}

function lectorEstado(texto, asunto) {
  var nombre = (texto.match(/[Tt]arjeta de [Cc]r[eé]dito\s+([A-Z][A-Z0-9 ]{3,40}?)\s*\./) || String(asunto || '').match(/[Ee]stado de [Cc]uenta\s+([A-Z][A-Z0-9 ]{3,30})$/) || [])[1] || null;
  return {
    tipo: 'estado',
    ultimos4: buscarUltimos4(texto),
    nombre: nombre ? nombre.trim() : null,
    fechaCorte: fechaEtiquetada(texto, ['fecha de corte']),
    fechaPago: fechaEtiquetada(texto, ['[uú]ltima fecha de pago', 'fecha de vencimiento', 'fecha l[ií]mite para pago de contado', 'fecha l[ií]mite(?: para)?(?: de)? pago(?: m[ií]nimo)?', 'fecha l[ií]mite']),
    contado: montoDeEstado(texto, 'pago de contado'),
    minimo: montoDeEstado(texto, 'pago m[ií]nimo'),
  };
}

// correo: { de, asunto, cuerpo (html o texto), fecha 'AAAA-MM-DD', adjunto (texto de un PDF, opcional) }
function leerCorreo(correo) {
  var texto = String(correo.asunto || '') + '\n' + textoPlano(correo.cuerpo) + (correo.adjunto ? '\n' + correo.adjunto : '');
  var banco = bancoPorRemitente(correo.de) || bancoPorTexto(texto);
  if (!banco) return null;
  var datos;
  if (esEstadoDeCuenta(texto)) {
    datos = lectorEstado(texto, correo.asunto);
    if (!datos.fechaCorte || datos.contado === null) return null;
  } else {
    datos = (banco.leer && banco.leer(texto)) || lectorTransaccion(texto);
    if (!datos) return null;
    datos.fecha = datos.fecha || correo.fecha;
  }
  datos.banco = banco.id;
  datos.asunto = String(correo.asunto || '').slice(0, 120);
  return datos;
}

if (typeof module !== 'undefined') module.exports = { leerCorreo: leerCorreo, textoPlano: textoPlano, leerFecha: leerFecha, BANCOS: BANCOS };

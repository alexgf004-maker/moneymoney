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
//  Cuscatlán "compra con su tarjeta titular de Banco CUSCATLAN XXXXXXXXXX1234 por USD 15.23 en COMERCIO el día aaaa-mm-dd"
//  Cuscatlán "Pago de servicio" (Tu producto ****1234 / Servicio pagado / Número de asociación / Monto): si el servicio es
//            una tarjeta (p. ej. "Siman en línea") es un pago a esa tarjeta hecho DESDE la tarjeta Cuscatlán
//  BAC       "compra con tu tarjeta MASTERCARD terminada en 1234 / Detalles del movimiento: Comercio | Monto / X | 177.78" (sin $)
//  Siman     "su tarjeta CREDISIMAN 1234 ha realizado compra por USD $ 44.99 en PM.Merliot."
//  Estados de cuenta de Cuscatlán, BAC y EMMA (Credicomer): fecha de corte, fecha límite, pago mínimo y de contado

var BANCOS = [
  { id: 'agricola', nombre: 'Banco Agrícola', remitentes: ['bancoagricola', 'agricola'], texto: /banco\s?agr[ií]cola/i },
  { id: 'bac', nombre: 'BAC', remitentes: ['baccredomatic', 'credomatic', 'bac.com', 'bac.net', 'notificacionesbac'], texto: /\bBAC\b|credomatic/i },
  { id: 'cuscatlan', nombre: 'Banco Cuscatlán', remitentes: ['cuscatlan'], texto: /cuscatl[aá]n/i },
  { id: 'credicomer', nombre: 'Credicomer', remitentes: ['credicomer', 'emmapay', 'emma'], texto: /credicomer|visa emma|emmapay/i },
  { id: 'siman', nombre: 'Siman', remitentes: ['siman'], texto: /credisiman|\bsiman\b/i },
];

// Palabras para la búsqueda en Gmail (remitente o asunto)
// (Varios bancos escriben desde "notificaciones@..." o "alertas@...": el lector descarta lo que no sea de un banco)
var BUSQUEDA_REMITENTES = ['bancoagricola', 'baccredomatic', 'credomatic', 'cuscatlan', 'credicomer', 'emmapay', 'emma', 'siman', 'credisiman', 'notificaciones', 'notificacion', 'alertas'];
var BUSQUEDA_ASUNTOS = ['"estado de cuenta"', '"alerta"', '"transfer365"', '"notificación"', '"transacción"', '"compra"', '"credisiman"', '"pago de servicio"', '"movimiento"'];

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

// dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd o aaaa/mm/dd -> aaaa-mm-dd
function leerFecha(s) {
  var m = String(s || '').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (m) return m[1] + '-' + DOS(+m[2]) + '-' + DOS(+m[3]);
  m = String(s || '').match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return m[3] + '-' + DOS(+m[2]) + '-' + DOS(+m[1]);
  return null;
}

var FECHA = '(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4}|\\d{4}[\\/-]\\d{1,2}[\\/-]\\d{1,2})';
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
    || texto.match(/(?:\*{2,}|[xX]{2,}|•{2,})[\s-]?(\d{4})\b/)
    || texto.match(/tarjeta(?:\s+[A-Za-z]{3,15}){1,2}\s+(\d{4})\b(?!\s*[-\/]\d)/i);
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
  // Lo más común: "... por USD 26.85 en COMERCIO" (justo después del monto)
  var trasMonto = texto.match(/(?:US\s?\$|USD|\$)\s?\$?\s?[\d.,]*\d\s+en\s+([^\n]{2,60}?)(?=\s+el d[ií]a\b|\.\s|\.$|\n|,|$)/i);
  if (trasMonto && /[A-Za-z]/.test(trasMonto[1])) return limpiarComercio(trasMonto[1]);
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

// Asuntos de publicidad: ofertas de préstamos, tarjetas o seguros con montos que no son movimientos
var PUBLICIDAD = /te ofrec|ofrecemos|ofrece|necesitas|aprovech|pre-?aprobad|promoci[oó]n|oferta|solic[ií]ta(?:lo|la)?\b|cotiza|te espera|beneficio|\bgana|participa|sorteo|descuento|cashback de|hasta \$|\bextra\b/i;

var PALABRAS_TRANSACCION = /compra|consumo|transacci[oó]n|cargo|retiro|pago|abono|autoriz|d[eé]bito|reversi|devoluci/i;

function lectorTransaccion(texto) {
  if (!PALABRAS_TRANSACCION.test(texto)) return null;
  var monto = buscarMonto(texto);
  if (!monto) return null;
  var tipo = tipoDe(texto);
  // Transferencias y abonos de la cuenta de banco no son movimientos de tarjeta (salvo que sean un pago A una tarjeta)
  if (/abono a (tu|su) cuenta|cr[eé]dito a (tu|su) cuenta|dep[oó]sito/i.test(texto)) return null;
  if (/transferencia|env[ií]o de dinero|pago a terceros|cuenta de ahorro|cuenta corriente/i.test(texto) && tipo !== 'pago') return null;
  if (tipo === 'pago' && !/tarjeta/i.test(texto)) return null;
  var datos = {
    tipo: tipo,
    monto: monto,
    ultimos4: buscarUltimos4(texto),
    comercio: tipo === 'pago' ? null : buscarComercio(texto),
    fecha: fechaEtiquetada(texto, ['fecha\\s*\\/\\s*hora', 'fecha y hora', 'fecha de aplicaci[oó]n', 'fecha de pago', 'fecha aplicada', 'el d[ií]a', 'fecha']),
    origen4: tipo === 'pago' ? buscarOrigen4(texto) : null,
  };
  datos.confianza = datos.ultimos4 && (tipo === 'pago' || datos.comercio) ? 'alta' : 'baja';
  return datos;
}

// BAC: "Detalles del movimiento" en tabla (Comercio | Monto / valor | valor). Se leen los valores en orden.
function lectorDetalles(texto) {
  var i = texto.search(/detalles del movimiento/i);
  if (i < 0) return null;
  var celdas = texto.slice(i).split(/[|\n]/).map(function (c) { return c.replace(/\s+/g, ' ').trim(); })
    .filter(function (c) { return c && !/^(detalles del movimiento:?|comercio|monto|fecha y hora|fecha|hora|lugar)$/i.test(c); });
  var monto = null, comercio = null, fecha = null;
  celdas.forEach(function (c) {
    if (monto === null && /^(?:US\s?\$|USD|\$)?\s?[\d,]*\d\.\d{2}$/.test(c)) monto = leerNumero(c);
    else if (!fecha && leerFecha(c)) fecha = leerFecha(c);
    else if (!comercio && /[A-Za-z]{2}/.test(c) && !/estimad|consult|llam|correo|banca|tel[eé]fono/i.test(c)) comercio = limpiarComercio(c);
  });
  if (!monto) return null;
  var ultimos4 = buscarUltimos4(texto);
  return { tipo: tipoDe(texto), monto: monto, ultimos4: ultimos4, comercio: comercio, fecha: fecha, origen4: null, confianza: ultimos4 && comercio ? 'alta' : 'baja' };
}

// Cuscatlán: pago de servicio con una tarjeta. Si lo pagado es otra tarjeta, es un pago a esa tarjeta.
function lectorServicio(texto) {
  if (!/pago de servicio/i.test(texto) || !/servicio pagado/i.test(texto)) return null;
  var monto = buscarMonto(texto);
  if (!monto) return null;
  var servicio = limpiarComercio((texto.match(/servicio pagado[\s:|]*\n?[\s:|]*([^\n|]{2,60})/i) || [])[1] || '');
  var producto4 = (texto.match(/tu producto[\s\S]{0,160}?(?:\*{2,}|[xX]{2,})(\d{4})\b/i) || [])[1] || null;
  var asociacion4 = (texto.match(/n[uú]mero de (?:asociaci[oó]n|referencia|tarjeta|cuenta|contrato)[\s:|]*\n?[\s:|]*[*xX\d -]*?(\d{4})\b/i) || [])[1] || null;
  var fecha = fechaEtiquetada(texto, ['fecha y hora', 'fecha']);
  var destino = bancoPorTexto(servicio);
  if (destino || /tarjeta|cr[eé]dito/i.test(servicio)) {
    return { tipo: 'pago', monto: monto, ultimos4: asociacion4, comercio: servicio || null, fecha: fecha, origen4: producto4, banco: destino ? destino.id : null, confianza: asociacion4 ? 'alta' : 'baja' };
  }
  return { tipo: 'gasto', monto: monto, ultimos4: producto4, comercio: servicio || 'Pago de servicio', fecha: fecha, origen4: null, confianza: producto4 && servicio ? 'alta' : 'baja' };
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

// Analiza un correo y dice qué pasó con él, para el registro de "Correos revisados" de la app.
// resultado: movimiento | estado | publicidad | sin-tarjeta | sin-movimiento | estado-incompleto | ajeno (no es de un banco)
// correo: { de, asunto, cuerpo (html o texto), fecha 'AAAA-MM-DD', adjunto (texto de un PDF, opcional) }
function analizarCorreo(correo) {
  var texto = String(correo.asunto || '') + '\n' + textoPlano(correo.cuerpo) + (correo.adjunto ? '\n' + correo.adjunto : '');
  var banco = bancoPorRemitente(correo.de) || bancoPorTexto(texto);
  var deBanco = banco ? banco.id : null;
  var nada = function (resultado, monto) { return { datos: null, banco: deBanco, resultado: deBanco ? resultado : 'ajeno', monto: monto || null }; };
  if (PUBLICIDAD.test(String(correo.asunto || ''))) return nada('publicidad');
  var datos;
  if (esEstadoDeCuenta(texto)) {
    if (!banco) return nada('ajeno');
    datos = lectorEstado(texto, correo.asunto);
    if (!datos.fechaCorte || datos.contado === null) return nada('estado-incompleto');
  } else {
    datos = lectorServicio(texto) || lectorDetalles(texto) || (banco && banco.leer && banco.leer(texto)) || lectorTransaccion(texto);
    if (!datos) {
      // Transferencias, abonos y pagos desde la cuenta de banco: se ignoran a propósito (no son de tarjeta)
      if (/transferencia|env[ií]o de dinero|pago a terceros|abono a (tu|su) cuenta|dep[oó]sito|cuenta de ahorro|cuenta corriente|pago de servicio/i.test(texto)) return nada('transferencia');
      return nada(PALABRAS_TRANSACCION.test(texto) ? 'sin-movimiento' : 'aviso');
    }
    // Un movimiento real siempre dice con qué tarjeta: sin dígitos es publicidad u otro aviso
    if (!datos.ultimos4) return nada('sin-tarjeta', datos.monto);
    // Sin banco reconocido solo se acepta una alerta clara de tarjeta (con dígitos y monto)
    if (!banco && !(/tarjeta/i.test(texto) && datos.confianza === 'alta')) return nada('ajeno');
    datos.fecha = datos.fecha || correo.fecha;
  }
  datos.banco = datos.banco || deBanco;
  if (datos.tipo !== 'estado' && /tarjeta de d[eé]bito/i.test(texto)) datos.debito = true;
  datos.asunto = String(correo.asunto || '').slice(0, 120);
  return { datos: datos, banco: datos.banco, resultado: datos.tipo === 'estado' ? 'estado' : 'movimiento', monto: datos.monto || datos.contado || null };
}

function leerCorreo(correo) {
  return analizarCorreo(correo).datos;
}

if (typeof module !== 'undefined') module.exports = { leerCorreo: leerCorreo, analizarCorreo: analizarCorreo, textoPlano: textoPlano, leerFecha: leerFecha, BANCOS: BANCOS };

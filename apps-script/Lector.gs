// Lee el texto de un correo de alerta del banco y saca: monto, comercio, últimos 4 de la tarjeta y tipo.
// Este archivo no usa nada propio de Google: las pruebas lo cargan igual en Node (tests/lector.test.js).
//
// Cada banco tiene su lista de remitentes. Mientras no tengamos un correo real de cada uno, todos usan el
// lector general, que busca los patrones típicos ("Monto: $12.50", "terminada en 1234", "Comercio: X").
// Cuando llegue un ejemplo real se agrega `leer` al banco con el formato exacto.

var BANCOS = [
  { id: 'agricola', nombre: 'Banco Agrícola', remitentes: ['bancoagricola.com'] },
  { id: 'bac', nombre: 'BAC', remitentes: ['baccredomatic.com', 'notificacionesbaccr.com', 'bac.net'] },
  { id: 'cuscatlan', nombre: 'Banco Cuscatlán', remitentes: ['bancocuscatlan.com', 'cuscatlan.com.sv', 'cuscatlan.com'] },
  { id: 'credicomer', nombre: 'Credicomer', remitentes: ['credicomer.com.sv', 'credicomer.com'] },
  { id: 'siman', nombre: 'Siman', remitentes: ['siman.com', 'tarjetasiman.com', 'simancredit.com'] },
];

function bancoPorRemitente(de) {
  var texto = String(de || '').toLowerCase();
  for (var i = 0; i < BANCOS.length; i++) {
    for (var j = 0; j < BANCOS[i].remitentes.length; j++) {
      if (texto.indexOf(BANCOS[i].remitentes[j]) >= 0) return BANCOS[i];
    }
  }
  return null;
}

function textoPlano(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#36;/g, '$').replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
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

var PALABRAS_TRANSACCION = /compra|consumo|transacci[oó]n|cargo|retiro|pago|abono|autoriz|d[eé]bito|reversi|devoluci/i;

function tipoDe(texto) {
  if (/reversi[oó]n|devoluci[oó]n|anulaci[oó]n|reembolso/i.test(texto)) return 'reembolso';
  if (/(hemos recibido|recibimos|aplicamos|aplicado)\s+(tu|su|un)?\s*(pago|abono)|pago (a|de) (tu|su) tarjeta|abono a (tu|su) tarjeta/i.test(texto)) return 'pago';
  return 'gasto';
}

function buscarMonto(texto) {
  var etiquetado = texto.match(/(?:monto|valor|importe|total|cantidad)[^\d$\n]{0,25}(?:US\s?\$|USD|\$)?\s?([\d.,]+\d)/i);
  if (etiquetado) return leerNumero(etiquetado[1]);
  var conSigno = texto.match(/(?:US\s?\$|USD\s?|\$)\s?([\d.,]+\d)/);
  return conSigno ? leerNumero(conSigno[1]) : null;
}

function buscarUltimos4(texto) {
  var m = texto.match(/(?:terminad[ao]|finalizad[ao]|que termina|con terminaci[oó]n|final)\s*(?:en)?\s*[:#]?\s*\**\s*(\d{4})\b/i)
    || texto.match(/(?:\*{2,}|x{2,}|X{2,}|•{2,}|#)\s?-?\s?(\d{4})\b/)
    || texto.match(/tarjeta[^\n\d]{0,30}(\d{4})\b/i);
  return m ? m[1] : null;
}

function limpiarComercio(s) {
  return String(s || '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\b(el d[ií]a|fecha|hora|por un monto|por|monto|con (tu|su) tarjeta)\b[\s\S]*$/i, '')
    .replace(/[.,;:\-\s]+$/, '')
    .trim()
    .slice(0, 60);
}

function buscarComercio(texto) {
  var m = texto.match(/(?:comercio|establecimiento|negocio|lugar|nombre del comercio|descripci[oó]n)[\s:|]*[:|][\s:|]*([^\n|]{2,60})/i)
    || texto.match(/\ben(?: el comercio)?\s+([A-Z][A-Z0-9 .&*'\/-]{2,50})(?=\s+(?:el d[ií]a|por|con|fecha|$)|[.,\n])/);
  return m ? limpiarComercio(m[1]) : null;
}

function lectorGeneral(texto) {
  if (!PALABRAS_TRANSACCION.test(texto)) return null;
  var monto = buscarMonto(texto);
  if (!monto) return null;
  var ultimos4 = buscarUltimos4(texto);
  var comercio = buscarComercio(texto);
  return {
    monto: monto,
    ultimos4: ultimos4,
    comercio: comercio,
    tipo: tipoDe(texto),
    confianza: ultimos4 && comercio ? 'alta' : 'baja',
  };
}

// correo: { de, asunto, cuerpo (html o texto), fecha 'AAAA-MM-DD' }
function leerCorreo(correo) {
  var banco = bancoPorRemitente(correo.de);
  if (!banco) return null;
  var texto = correo.asunto + '\n' + textoPlano(correo.cuerpo);
  var datos = (banco.leer && banco.leer(texto)) || lectorGeneral(texto);
  if (!datos) return null;
  datos.banco = banco.id;
  datos.fecha = datos.fecha || correo.fecha;
  datos.asunto = String(correo.asunto || '').slice(0, 120);
  return datos;
}

if (typeof module !== 'undefined') module.exports = { leerCorreo: leerCorreo, textoPlano: textoPlano, BANCOS: BANCOS };

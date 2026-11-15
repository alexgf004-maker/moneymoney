// Arma los avisos de pago a partir de la agenda que guarda la app (usuarios/{uid}/agenda).
// No usa nada propio de Google: las pruebas lo cargan en Node (tests/avisos.test.js).
//
// Cuándo se avisa de un pago: 3 días antes (o 2), el día anterior, el mismo día y, si se venció, una vez por día.
// Si varios pagos son urgentes a la vez, sale UN solo aviso con todos y el total.

function diasHasta_(desde, hasta) {
  var a = desde.split('-'), b = hasta.split('-');
  return Math.round((Date.UTC(+b[0], +b[1] - 1, +b[2]) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
}

function dinero_(n) {
  return '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Etapa de aviso de un pago hoy (o null si todavía no toca avisar)
function etapaAviso(pago, hoy) {
  var dias = diasHasta_(hoy, pago.fecha);
  if (pago.vencido || dias < 0) return 'vencido-' + hoy; // una vez por día mientras siga vencido
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'manana';
  if (dias <= 3) return 'pronto';
  return null;
}

function cuando_(pago, hoy) {
  var dias = diasHasta_(hoy, pago.fecha);
  if (pago.vencido || dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return 'en ' + dias + ' días';
}

// pagos: [{ id, titulo, fecha, monto, minimo, tipo, vencido }] · avisados: { clave: true }
// pagados: { ultimos4: 'AAAA-MM-DD' } pagos a tarjetas que llegaron por correo después de guardar la agenda
// Devuelve { titulo, cuerpo, claves } o null si no hay nada nuevo que avisar.
function armarRecordatorio(pagos, hoy, avisados, pagados) {
  avisados = avisados || {};
  pagados = pagados || {};
  var urgentes = (pagos || []).filter(function (p) {
    var u4 = (String(p.titulo).match(/(\d{4})\s*$/) || [])[1];
    // Si ya llegó un pago a esa tarjeta en los últimos 25 días, no se avisa (la agenda puede estar vieja)
    if (u4 && pagados[u4] && diasHasta_(pagados[u4], p.fecha) <= 25) return false;
    return etapaAviso(p, hoy) !== null;
  });
  if (!urgentes.length) return null;
  var claves = urgentes.map(function (p) { return p.id + '|' + p.fecha + '|' + etapaAviso(p, hoy); });
  var nuevas = claves.filter(function (c) { return !avisados[c]; });
  if (!nuevas.length) return null;
  urgentes.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : b.monto - a.monto; });
  var total = urgentes.reduce(function (s, p) { return s + Number(p.monto || 0); }, 0);
  var titulo, cuerpo;
  if (urgentes.length === 1) {
    var p = urgentes[0];
    var c = cuando_(p, hoy);
    titulo = c === 'vencido' ? 'Venció el pago de ' + p.titulo : c === 'hoy' ? 'Hoy vence ' + p.titulo : c === 'mañana' ? 'Mañana vence ' + p.titulo : p.titulo + ' vence ' + c;
    cuerpo = 'Paga ' + dinero_(p.monto) + (p.tipo === 'tarjeta' ? ' para no pagar intereses' + (p.minimo ? ' (mínimo ' + dinero_(p.minimo) + ')' : '') : '') + '.';
  } else {
    var vencidos = urgentes.filter(function (p) { return cuando_(p, hoy) === 'vencido'; }).length;
    titulo = urgentes.length + ' pagos urgentes: ' + dinero_(total) + (vencidos ? ' (' + vencidos + ' vencido' + (vencidos > 1 ? 's' : '') + ')' : '');
    cuerpo = urgentes.map(function (p) { return p.titulo + ': ' + dinero_(p.monto) + ', ' + cuando_(p, hoy); }).join('\n');
  }
  return { titulo: titulo, cuerpo: cuerpo, claves: claves };
}

if (typeof module !== 'undefined') module.exports = { armarRecordatorio: armarRecordatorio, etapaAviso: etapaAviso };

// Script de Gmail para MoneyMoney. Corre en la cuenta de Google del usuario, cada 5 minutos:
// busca los correos de alerta de los bancos, los lee (Lector.gs) y deja cada compra en Firebase,
// en usuarios/{UID}/entrantes. La app los toma de ahí, les pone tarjeta y categoría.
//
// Configuración (Proyecto -> Configuración -> Propiedades del script):
//   FIREBASE_URL  https://TU-PROYECTO-default-rtdb.firebaseio.com
//   UID           el código que muestra la app en Más -> Conexión con Gmail
//
// Pasos: ver apps-script/README.md. Después de configurar, ejecutar `instalar` una vez.

var ETIQUETA = 'MoneyMoney';
var DIAS_ATRAS = 3;

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = String(p.getProperty('FIREBASE_URL') || '').replace(/\/+$/, '');
  var uid = p.getProperty('UID');
  if (!url || !uid) throw new Error('Faltan FIREBASE_URL o UID en las propiedades del script.');
  return { url: url, uid: uid };
}

function consulta_(dias) {
  return '(from:(' + BUSQUEDA_REMITENTES.join(' OR ') + ') OR subject:(' + BUSQUEDA_ASUNTOS.join(' OR ') + ')) newer_than:' + (dias || DIAS_ATRAS) + 'd';
}

// Texto de un PDF adjunto (comprobantes de pago). Usa el servicio avanzado de Drive: lo convierte a documento
// de Google, lo exporta como texto y lo borra. Si Drive no está activado o el PDF tiene clave, devuelve ''.
function textoDePdf_(msg) {
  if (typeof Drive === 'undefined') return '';
  var pdf = msg.getAttachments().filter(function (a) { return a.getContentType() === 'application/pdf' && a.getSize() < 3000000; })[0];
  if (!pdf) return '';
  try {
    var archivo = Drive.Files.create({ name: 'moneymoney-temporal', mimeType: 'application/vnd.google-apps.document' }, pdf.copyBlob(), { ocrLanguage: 'es' });
    var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + archivo.id + '/export?mimeType=text/plain', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
    Drive.Files.remove(archivo.id);
    return res.getResponseCode() === 200 ? res.getContentText() : '';
  } catch (e) {
    Logger.log('No se pudo leer el PDF: ' + e.message);
    return '';
  }
}

function leerMensaje_(msg) {
  var correo = { de: msg.getFrom(), asunto: msg.getSubject(), cuerpo: msg.getBody() || msg.getPlainBody(), fecha: fechaISO_(msg.getDate()) };
  var datos = leerCorreo(correo);
  if (!datos && (bancoPorRemitente(correo.de) || bancoPorTexto(textoPlano(correo.cuerpo)))) {
    correo.adjunto = textoDePdf_(msg);
    if (correo.adjunto) datos = leerCorreo(correo);
  }
  return { correo: correo, datos: datos };
}

// Ids de correos ya enviados (con la fecha), para no mandar dos veces el mismo
function procesados_() {
  var crudo = PropertiesService.getScriptProperties().getProperty('PROCESADOS');
  return crudo ? JSON.parse(crudo) : {};
}

function guardarProcesados_(mapa) {
  var limite = Date.now() - (DIAS_ATRAS + 2) * 86400000;
  Object.keys(mapa).forEach(function (k) { if (mapa[k] < limite) delete mapa[k]; });
  PropertiesService.getScriptProperties().setProperty('PROCESADOS', JSON.stringify(mapa));
}

function enviar_(cfg, ruta, datos) {
  var res = UrlFetchApp.fetch(cfg.url + '/usuarios/' + cfg.uid + '/' + ruta + '.json', {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(datos),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('Firebase respondió ' + res.getResponseCode() + ': ' + res.getContentText());
}

function fechaISO_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function procesarCorreos(dias) {
  dias = typeof dias === 'number' ? dias : DIAS_ATRAS;
  var cfg = config_();
  var hechos = procesados_();
  var etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  var hilos = [];
  for (var desde = 0; desde < 500; desde += 100) {
    var pagina = GmailApp.search(consulta_(dias), desde, 100);
    hilos = hilos.concat(pagina);
    if (pagina.length < 100) break;
  }
  var enviados = 0, noLeidos = 0;
  hilos.forEach(function (hilo) {
    var tocado = false;
    hilo.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (hechos[id]) return;
      var leido = leerMensaje_(msg);
      var correo = leido.correo, datos = leido.datos;
      var texto = textoPlano(correo.cuerpo);
      if (datos) {
        datos.id = id;
        enviar_(cfg, 'entrantes/' + id, datos);
        enviados++;
      } else if ((bancoPorRemitente(correo.de) || bancoPorTexto(texto)) && PALABRAS_TRANSACCION.test(correo.asunto + ' ' + texto)) {
        // Correo del banco que no se pudo leer (promoción o formato nuevo): se guarda el inicio para mejorar el lector
        enviar_(cfg, 'noLeidos/' + id, { id: id, fecha: correo.fecha, de: correo.de, asunto: correo.asunto.slice(0, 120), texto: texto.slice(0, 600) });
        noLeidos++;
      }
      hechos[id] = Date.now();
      tocado = true;
    });
    if (tocado) hilo.addLabel(etiqueta);
  });
  guardarProcesados_(hechos);
  Logger.log('Movimientos enviados: ' + enviados + ' · correos no reconocidos: ' + noLeidos);
}

// Ejecutar UNA vez: crea la revisión automática cada 5 minutos
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarCorreos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyMinutes(5).create();
  procesarCorreos();
  Logger.log('Listo: se revisará el correo cada 5 minutos.');
}

// Ejecutar UNA vez después de instalar: trae los últimos 60 días (compras, pagos y estados de cuenta)
function importarHistorial() {
  procesarCorreos(60);
}

// Para revisar sin enviar nada: muestra en el registro lo que se leería de los últimos correos
function probar() {
  GmailApp.search(consulta_(30), 0, 30).forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      Logger.log(msg.getFrom() + ' | ' + msg.getSubject() + ' -> ' + JSON.stringify(leerMensaje_(msg).datos));
    });
  });
}

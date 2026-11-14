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

function consulta_() {
  var dominios = [];
  BANCOS.forEach(function (b) { dominios = dominios.concat(b.remitentes); });
  return 'from:(' + dominios.join(' OR ') + ') newer_than:' + DIAS_ATRAS + 'd';
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

function procesarCorreos() {
  var cfg = config_();
  var hechos = procesados_();
  var etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  var hilos = GmailApp.search(consulta_(), 0, 100);
  var enviados = 0, noLeidos = 0;
  hilos.forEach(function (hilo) {
    var tocado = false;
    hilo.getMessages().forEach(function (msg) {
      var id = msg.getId();
      if (hechos[id]) return;
      var correo = { de: msg.getFrom(), asunto: msg.getSubject(), cuerpo: msg.getBody() || msg.getPlainBody(), fecha: fechaISO_(msg.getDate()) };
      var datos = leerCorreo(correo);
      if (datos) {
        datos.id = id;
        enviar_(cfg, 'entrantes/' + id, datos);
        enviados++;
      } else if (bancoPorRemitente(correo.de)) {
        // Correo del banco que no se pudo leer (promoción o formato nuevo): se guarda el inicio para mejorar el lector
        enviar_(cfg, 'noLeidos/' + id, { id: id, fecha: correo.fecha, de: correo.de, asunto: correo.asunto.slice(0, 120), texto: textoPlano(correo.cuerpo).slice(0, 600) });
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

// Para revisar sin enviar nada: muestra en el registro lo que se leería de los últimos correos
function probar() {
  GmailApp.search(consulta_(), 0, 20).forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      var datos = leerCorreo({ de: msg.getFrom(), asunto: msg.getSubject(), cuerpo: msg.getBody(), fecha: fechaISO_(msg.getDate()) });
      Logger.log(msg.getSubject() + ' -> ' + JSON.stringify(datos));
    });
  });
}

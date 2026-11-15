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
  var analisis = analizarCorreo(correo);
  // Si es de un banco y no se entendió, se intenta con el PDF adjunto (comprobantes de pago)
  if (!analisis.datos && analisis.banco && analisis.resultado !== 'publicidad') {
    correo.adjunto = textoDePdf_(msg);
    if (correo.adjunto) {
      var conPdf = analizarCorreo(correo);
      if (conPdf.datos) analisis = conPdf;
    }
  }
  return { correo: correo, datos: analisis.datos, analisis: analisis };
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

// dias: cuántos días atrás buscar. forzar: volver a revisar también los correos ya procesados (para llenar el
// registro de "Correos revisados"); la app no duplica movimientos porque cada correo tiene su propio id.
function procesarCorreos(dias, forzar) {
  dias = typeof dias === 'number' ? dias : DIAS_ATRAS;
  var inicio = Date.now();
  var cfg = config_();
  var hechos = procesados_();
  var props = PropertiesService.getScriptProperties();
  var revisados = forzar ? JSON.parse(props.getProperty('REVISADOS') || '{}') : {};
  var etiqueta = GmailApp.getUserLabelByName(ETIQUETA) || GmailApp.createLabel(ETIQUETA);
  var hilos = [];
  for (var desde = 0; desde < 500; desde += 100) {
    var pagina = GmailApp.search(consulta_(dias), desde, 100);
    hilos = hilos.concat(pagina);
    if (pagina.length < 100) break;
  }
  var enviados = 0, noLeidos = 0, revisadosAhora = 0, incompleto = false;
  for (var h = 0; h < hilos.length && !incompleto; h++) {
    var tocado = false;
    var mensajes = hilos[h].getMessages();
    for (var k = 0; k < mensajes.length; k++) {
      // Google corta a los 6 minutos: a los 4.5 se guarda lo avanzado y se sigue en la próxima ejecución
      if (Date.now() - inicio > 270000) { incompleto = true; break; }
      var msg = mensajes[k];
      var id = msg.getId();
      if (forzar ? revisados[id] : hechos[id]) continue;
      var leido = leerMensaje_(msg);
      var correo = leido.correo, datos = leido.datos;
      var texto = textoPlano(correo.cuerpo);
      // Registro de cada correo de banco revisado (la app lo muestra en Más > Correos revisados)
      if (leido.analisis.resultado !== 'ajeno') {
        enviar_(cfg, 'revision/' + id, {
          id: id, fecha: (datos && datos.fecha) || correo.fecha, recibido: correo.fecha, banco: leido.analisis.banco,
          asunto: String(correo.asunto || '').slice(0, 120), resultado: leido.analisis.resultado, monto: leido.analisis.monto,
          tipo: datos ? datos.tipo : null, ultimos4: datos ? datos.ultimos4 || null : null,
        });
        revisadosAhora++;
      }
      if (datos) {
        datos.id = id;
        enviar_(cfg, 'entrantes/' + id, datos);
        enviados++;
        // Solo en la revisión normal (no al importar historial) y si el correo es reciente: avisar al teléfono
        if (dias === DIAS_ATRAS && !forzar && datos.fecha && diasHasta_(datos.fecha, fechaISO_(new Date())) <= 2) avisarMovimiento_(cfg, id, datos);
      } else if (leido.analisis.banco && /sin-movimiento|estado-incompleto/.test(leido.analisis.resultado)) {
        // Correo del banco que no se pudo leer: se guarda el inicio para mejorar el lector
        enviar_(cfg, 'noLeidos/' + id, { id: id, fecha: correo.fecha, de: correo.de, asunto: correo.asunto.slice(0, 120), texto: texto.slice(0, 600) });
        noLeidos++;
      }
      hechos[id] = Date.now();
      if (forzar) revisados[id] = 1;
      tocado = true;
    }
    if (tocado) hilos[h].addLabel(etiqueta);
  }
  guardarProcesados_(hechos);
  if (forzar) {
    if (incompleto) props.setProperty('REVISADOS', JSON.stringify(revisados));
    else props.deleteProperty('REVISADOS');
  }
  Logger.log('Correos de bancos revisados: ' + revisadosAhora + ' · movimientos enviados: ' + enviados + ' · no reconocidos: ' + noLeidos);
  if (incompleto) Logger.log('FALTAN CORREOS: se acabó el tiempo. Vuelve a ejecutar la misma función para seguir donde quedó.');
  else Logger.log('Terminado: se revisaron todos los correos.');
}

// Ejecutar UNA vez (y otra vez después de actualizar el script): revisa el correo cada 5 minutos y manda los
// avisos de pago cada mañana a las 7
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarCorreos' || t.getHandlerFunction() === 'enviarRecordatorios') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyDays(1).atHour(7).create();
  procesarCorreos();
  Logger.log('Listo: se revisará el correo cada 5 minutos y los avisos de pago saldrán cada mañana a las 7.');
}

// ---------- Avisos al teléfono (Firebase Cloud Messaging) y por correo ----------

var APP_URL = 'https://alexgf004-maker.github.io/moneymoney/';

function leer_(cfg, ruta) {
  var res = UrlFetchApp.fetch(cfg.url + '/usuarios/' + cfg.uid + '/' + ruta + '.json', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText() || 'null') : null;
}

function borrar_(cfg, ruta) {
  UrlFetchApp.fetch(cfg.url + '/usuarios/' + cfg.uid + '/' + ruta + '.json', {
    method: 'delete', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
  });
}

// "https://moneymoney-62053-default-rtdb.firebaseio.com" -> "moneymoney-62053"
function proyecto_(cfg) {
  return PropertiesService.getScriptProperties().getProperty('PROJECT_ID') || cfg.url.replace(/^https:\/\//, '').replace(/-default-rtdb.*$/, '').replace(/\..*$/, '');
}

function preferencias_(cfg) {
  var n = leer_(cfg, 'ajustes/general/notif') || {};
  return { pagos: n.pagos !== false, compras: n.compras !== false, correo: n.correo !== false };
}

// Manda un aviso a todos los teléfonos registrados. Devuelve cuántos lo recibieron.
function enviarPush_(cfg, titulo, cuerpo, tag, tipo) {
  var dispositivos = leer_(cfg, 'dispositivos') || {};
  var proyecto = proyecto_(cfg);
  var ok = 0;
  Object.keys(dispositivos).forEach(function (id) {
    var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + proyecto + '/messages:send', {
      method: 'post',
      contentType: 'application/json',
      // x-goog-user-project: el uso de la API se cuenta en el proyecto de Firebase y no en el del script
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'x-goog-user-project': proyecto },
      payload: JSON.stringify({ message: {
        token: dispositivos[id].token,
        notification: { title: titulo, body: cuerpo },
        data: { tag: tag || 'moneymoney', url: APP_URL, tipo: tipo || 'compra' }, // tipo 'pagos' = aviso insistente
        // Urgencia alta y válido por un día: Android no lo retrasa para ahorrar batería
        webpush: { headers: { Urgency: 'high', TTL: '86400' }, fcm_options: { link: APP_URL } },
      } }),
      muteHttpExceptions: true,
    });
    var codigo = res.getResponseCode();
    if (codigo === 200) ok++;
    else if (codigo === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(res.getContentText())) borrar_(cfg, 'dispositivos/' + id); // teléfono que ya no existe
    else Logger.log('No se pudo mandar el aviso (' + codigo + '): ' + res.getContentText().slice(0, 300));
  });
  return ok;
}

// Aviso de cada compra o pago que llega por correo
function avisarMovimiento_(cfg, id, datos) {
  try {
    if (datos.tipo === 'pago' && datos.ultimos4) {
      // Recordar el pago para no avisar de esa tarjeta aunque la agenda de la app esté vieja
      var props = PropertiesService.getScriptProperties();
      var pagados = JSON.parse(props.getProperty('PAGADOS') || '{}');
      pagados[datos.ultimos4] = datos.fecha;
      props.setProperty('PAGADOS', JSON.stringify(pagados));
    }
    if (!preferencias_(cfg).compras || datos.tipo === 'estado') return;
    var tarjeta = datos.ultimos4 ? ' ···' + datos.ultimos4 : '';
    if (datos.tipo === 'pago') enviarPush_(cfg, 'Pago de ' + dinero_(datos.monto) + ' registrado', 'A tu tarjeta' + tarjeta + '.', 'mov-' + id);
    else if (datos.tipo === 'reembolso') enviarPush_(cfg, 'Devolución de ' + dinero_(datos.monto), (datos.comercio || 'Comercio') + tarjeta, 'mov-' + id);
    else enviarPush_(cfg, 'Compra de ' + dinero_(datos.monto), (datos.comercio || 'Comercio') + ' · tarjeta' + tarjeta, 'mov-' + id);
  } catch (e) {
    Logger.log('Aviso de movimiento no enviado: ' + e.message);
  }
}

// Cada mañana: avisa de los pagos que vencen pronto (lo arma Avisos.gs con la agenda que guarda la app)
function enviarRecordatorios() {
  var cfg = config_();
  var prefs = preferencias_(cfg);
  if (!prefs.pagos) return;
  var agenda = leer_(cfg, 'agenda');
  if (!agenda || !agenda.pagos) { Logger.log('Todavía no hay agenda: abre la app con la sesión iniciada.'); return; }
  var props = PropertiesService.getScriptProperties();
  var avisados = JSON.parse(props.getProperty('AVISADOS') || '{}');
  var pagados = JSON.parse(props.getProperty('PAGADOS') || '{}');
  var hoy = fechaISO_(new Date());
  var aviso = armarRecordatorio(agenda.pagos, hoy, avisados, pagados);
  if (!aviso) { Logger.log('Hoy no hay pagos que avisar.'); return; }
  var recibidos = enviarPush_(cfg, aviso.titulo, aviso.cuerpo, 'pagos', 'pagos');
  if (prefs.correo || !recibidos) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'MoneyMoney: ' + aviso.titulo, aviso.cuerpo + '\n\nAbre MoneyMoney: ' + APP_URL);
  }
  aviso.claves.forEach(function (c) { avisados[c] = hoy; });
  // Se olvidan los avisos de hace más de 40 días
  Object.keys(avisados).forEach(function (c) { if (diasHasta_(avisados[c], hoy) > 40) delete avisados[c]; });
  props.setProperty('AVISADOS', JSON.stringify(avisados));
  Logger.log('Aviso enviado a ' + recibidos + ' teléfono(s)' + (prefs.correo || !recibidos ? ' y por correo' : '') + ': ' + aviso.titulo);
}

// Para comprobar que los avisos llegan al teléfono
function probarAviso() {
  var cfg = config_();
  var n = enviarPush_(cfg, 'MoneyMoney', 'Así te llegarán los avisos de pago. Este se queda en pantalla hasta que lo toques.', 'prueba', 'pagos');
  Logger.log(n ? 'Aviso enviado a ' + n + ' teléfono(s).' : 'No llegó a ningún teléfono: activa los avisos en la app (Más > Avisos) y revisa el mensaje de error de arriba.');
}

// Ejecutar UNA vez después de instalar: trae los últimos 60 días (compras, pagos y estados de cuenta)
function importarHistorial() {
  procesarCorreos(60);
}

// Vuelve a revisar los últimos 60 días, también los correos ya procesados, para llenar "Correos revisados" en la app.
// Si se acaba el tiempo, ejecútala otra vez y sigue donde quedó.
function revisarHistorial() {
  procesarCorreos(60, true);
}

// Para revisar sin enviar nada: muestra en el registro lo que se leería de los últimos correos
function probar() {
  GmailApp.search(consulta_(30), 0, 30).forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      Logger.log(msg.getFrom() + ' | ' + msg.getSubject() + ' -> ' + JSON.stringify(leerMensaje_(msg).datos));
    });
  });
}

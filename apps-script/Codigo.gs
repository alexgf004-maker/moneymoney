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
      } else if (leido.analisis.banco && /sin-movimiento|sin-tarjeta|estado-incompleto/.test(leido.analisis.resultado)) {
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

// Diagnóstico de los avisos al teléfono: muestra en el registro qué permisos tiene la autorización del script y
// qué responde Firebase Cloud Messaging al mandar un aviso de prueba de dos formas. No cambia nada.
function diagnosticoAvisos() {
  var token = ScriptApp.getOAuthToken();
  var info = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + token, { muteHttpExceptions: true });
  var permisos = (JSON.parse(info.getContentText() || '{}').scope || '').split(' ').map(function (s) { return s.replace('https://www.googleapis.com/auth/', ''); });
  Logger.log('1) Permisos de la autorización: ' + permisos.join(', '));
  var cfg = config_();
  var dispositivos = leer_(cfg, 'dispositivos') || {};
  var ids = Object.keys(dispositivos);
  var proyecto = proyecto_(cfg);
  Logger.log('2) Teléfonos registrados: ' + ids.length + ' · proyecto: ' + proyecto);
  if (!ids.length) return;
  [true, false].forEach(function (conCabecera, i) {
    var headers = { Authorization: 'Bearer ' + token };
    if (conCabecera) headers['x-goog-user-project'] = proyecto;
    var res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + proyecto + '/messages:send', {
      method: 'post', contentType: 'application/json', headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({ message: { token: dispositivos[ids[0]].token, notification: { title: 'Prueba MoneyMoney', body: 'Forma ' + (i + 1) } } }),
    });
    Logger.log('3.' + (i + 1) + ') ' + (conCabecera ? 'Con' : 'Sin') + ' proyecto de cuota: ' + res.getResponseCode() + ' ' + res.getContentText().replace(/\s+/g, ' ').slice(0, 400));
  });
}

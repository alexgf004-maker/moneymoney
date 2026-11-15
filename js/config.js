// Configuración de Firebase (Consola de Firebase -> Configuración del proyecto -> Tus apps -> Web).
// Estos datos no son secretos: lo que protege la información son las reglas de database.rules.json
// (cada usuario solo puede leer y escribir usuarios/{su uid}).
export const FIREBASE = {
  apiKey: 'AIzaSyAMGt9OiDH3Q8IuQjravWtRtm1gz7Xavi8',
  authDomain: 'moneymoney-62053.firebaseapp.com',
  databaseURL: 'https://moneymoney-62053-default-rtdb.firebaseio.com',
  projectId: 'moneymoney-62053',
  storageBucket: 'moneymoney-62053.firebasestorage.app',
  messagingSenderId: '728919425462',
  appId: '1:728919425462:web:e777072794834805768117',
};

// Clave pública de push web (Firebase -> Configuración del proyecto -> Cloud Messaging -> Certificados de push web).
// Tampoco es secreta: solo permite que este proyecto mande notificaciones a quien las active.
export const VAPID = 'BOoEzGl1j1R9jI5beZ3P35YWG-YPsPgGExVJ52_I8V7bYVSwqLSuHQkRp4SDPRfw2DJrp1Fj88TaRi1ZWPK-NgU';

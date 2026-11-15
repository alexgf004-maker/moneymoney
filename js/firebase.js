// Conexión opcional con Firebase: inicio de sesión con Google y sincronización de usuarios/{uid}.
// Las librerías se cargan solo si hay configuración, así la app abre rápido sin ella.

const V = '10.12.0';
let fb = null;

export async function iniciarFirebase(config, { alUsuario, alDatos }) {
  const [{ initializeApp }, authMod, dbMod] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`),
  ]);
  const app = initializeApp(config);
  const auth = authMod.getAuth(app);
  const db = dbMod.getDatabase(app);
  let dejarDeOir = null;
  fb = { app, auth, authMod, db, dbMod, uid: null };

  authMod.getRedirectResult(auth).catch(() => {});
  authMod.onAuthStateChanged(auth, usuario => {
    dejarDeOir?.();
    dejarDeOir = null;
    fb.uid = usuario?.uid || null;
    alUsuario(usuario ? { uid: usuario.uid, correo: usuario.email, nombre: usuario.displayName } : null, escritor());
    if (usuario) {
      const raiz = dbMod.ref(db, `usuarios/${usuario.uid}`);
      let primera = true;
      dejarDeOir = dbMod.onValue(raiz, snap => {
        alDatos(snap.val(), primera);
        primera = false;
      });
    }
  });
}

function escritor() {
  if (!fb?.uid) return null;
  const { db, dbMod, uid } = fb;
  return {
    escribir(ruta, valor, { reemplazar = true } = {}) {
      const r = dbMod.ref(db, `usuarios/${uid}${ruta ? '/' + ruta : ''}`);
      const p = reemplazar || valor === null ? dbMod.set(r, valor) : dbMod.update(r, valor);
      p.catch(e => console.error('No se pudo guardar en la nube', ruta, e));
    },
  };
}

export async function entrarConGoogle() {
  if (!fb) throw new Error('Firebase no está configurado');
  const { auth, authMod } = fb;
  const proveedor = new authMod.GoogleAuthProvider();
  try {
    await authMod.signInWithPopup(auth, proveedor);
  } catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await authMod.signInWithRedirect(auth, proveedor);
    } else if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

export const salir = () => fb?.authMod.signOut(fb.auth);

// ---------- Notificaciones al teléfono (Firebase Cloud Messaging) ----------
// El teléfono se registra con la clave pública de push web y guarda su token en usuarios/{uid}/dispositivos.
// El script de Gmail usa esos tokens para mandar los avisos. El service worker (sw.js) los muestra.

export const notificacionesPosibles = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

export async function activarNotificaciones(vapidKey) {
  if (!fb?.uid) throw new Error('Primero entra con tu cuenta de Google');
  if (!notificacionesPosibles()) throw new Error('Este navegador no permite notificaciones');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones. Actívalo en los ajustes del teléfono.');
  const registro = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const msgMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-messaging.js`);
  const token = await msgMod.getToken(msgMod.getMessaging(fb.app), { vapidKey, serviceWorkerRegistration: registro });
  if (!token) throw new Error('No se pudo registrar este teléfono');
  // Id corto y estable para este token
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  await fb.dbMod.set(fb.dbMod.ref(fb.db, `usuarios/${fb.uid}/dispositivos/${id}`), {
    token, fecha: new Date().toISOString(), equipo: navigator.userAgent.slice(0, 120),
  });
  return id;
}

// Aviso local para comprobar que el teléfono muestra las notificaciones de la app
export async function avisoDePrueba() {
  const registro = await navigator.serviceWorker.ready;
  await registro.showNotification('MoneyMoney', { body: 'Así te llegarán los avisos de pago y de compras.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'prueba' });
}

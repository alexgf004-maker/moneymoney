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
  fb = { auth, authMod, db, dbMod, uid: null };

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

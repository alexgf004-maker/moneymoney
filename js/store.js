// Todos los datos de la app. Se guardan siempre en este teléfono (localStorage) y, si Firebase está
// configurado y la sesión iniciada, también en la nube (usuarios/{uid}/...), que es donde el script de
// Gmail deja los movimientos nuevos.

export const COLECCIONES = ['tarjetas', 'prestamos', 'cuentas', 'movimientos', 'reglas', 'presupuestos', 'recurrentes', 'estados', 'entrantes', 'noLeidos', 'revision', 'ajustes'];
const CLAVE = 'moneymoney:v1';

const vacio = () => Object.fromEntries(COLECCIONES.map(c => [c, {}]));
export let datos = vacio();

let remoto = null; // { escribir(ruta, valor) } cuando hay sesión en Firebase
const oyentes = new Set();

export const alCambiar = fn => oyentes.add(fn);
const avisar = origen => oyentes.forEach(fn => fn(origen));

// Quita los `undefined` (Firebase no los acepta)
const limpio = o => JSON.parse(JSON.stringify(o));

function guardarLocal() {
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sin espacio o modo privado */ }
}

export function cargarLocal() {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (crudo) datos = { ...vacio(), ...crudo };
  } catch { datos = vacio(); }
  asegurarBase();
}

function asegurarBase() {
  if (!datos.cuentas.efectivo) datos.cuentas.efectivo = { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo' };
}

export const lista = col => Object.values(datos[col] || {});
export const obtener = (col, id) => (datos[col] || {})[id];
export const ajustes = () => datos.ajustes.general || {};

export function nuevoId(prefijo = 'x') {
  return `${prefijo}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function guardar(col, obj) {
  return guardarVarios(col, [obj]);
}

export function guardarVarios(col, objs, { silencioso = false } = {}) {
  for (const o of objs) {
    const v = limpio(o);
    datos[col][v.id] = v;
    remoto?.escribir(`${col}/${v.id}`, v);
  }
  guardarLocal();
  if (!silencioso) avisar('local');
}

export function borrar(col, id) {
  return borrarVarios(col, [id]);
}

export function borrarVarios(col, ids, { silencioso = false } = {}) {
  for (const id of ids) {
    delete datos[col][id];
    remoto?.escribir(`${col}/${id}`, null);
  }
  guardarLocal();
  if (!silencioso) avisar('local');
}

export function guardarAjustes(cambios) {
  guardar('ajustes', { ...ajustes(), ...cambios, id: 'general' });
}

// Cuando llega la foto completa desde Firebase, reemplaza lo local
export function recibirRemoto(valor) {
  datos = { ...vacio(), ...Object.fromEntries(COLECCIONES.map(c => [c, valor?.[c] || {}])) };
  asegurarBase();
  guardarLocal();
  avisar('remoto');
}

export function conectarRemoto(r) {
  remoto = r;
}

export const hayDatos = d => ['tarjetas', 'prestamos', 'movimientos'].some(c => Object.keys(d?.[c] || {}).length);

// Sube todo lo local (al iniciar sesión por primera vez con datos ya cargados en el teléfono)
export function subirTodo() {
  if (!remoto) return;
  remoto.escribir('', limpio(Object.fromEntries(COLECCIONES.filter(c => c !== 'entrantes' && c !== 'noLeidos').map(c => [c, datos[c]]))), { reemplazar: false });
}

export function exportar() {
  return JSON.stringify({ app: 'moneymoney', version: 1, fecha: new Date().toISOString(), datos }, null, 2);
}

export function importar(texto) {
  const j = JSON.parse(texto);
  if (j.app !== 'moneymoney' || !j.datos) throw new Error('El archivo no es un respaldo de MoneyMoney');
  datos = { ...vacio(), ...j.datos };
  asegurarBase();
  guardarLocal();
  if (remoto) subirTodo();
  avisar('local');
}

export function borrarTodo() {
  if (remoto) remoto.escribir('', null);
  datos = vacio();
  asegurarBase();
  guardarLocal();
  avisar('local');
}

// Escribe solo en la nube (no es una colección de la app): p. ej. la agenda que lee el script para avisar
export function publicar(ruta, valor) {
  remoto?.escribir(ruta, limpio(valor));
}

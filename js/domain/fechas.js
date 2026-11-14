// Fechas como texto 'AAAA-MM-DD' (sin horas ni zonas horarias, así no se corren de día).

const pad = n => String(n).padStart(2, '0');

export function aISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hoyISO() {
  return aISO(new Date());
}

// Mediodía local para que sumar días nunca cruce de fecha por el horario
export function deISO(s) {
  const [a, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

export function diasDelMes(anio, mes0) {
  return new Date(anio, mes0 + 1, 0).getDate();
}

// El día pedido dentro de un mes; si el mes es más corto, el último día (día 31 en febrero → 28/29)
export function fechaConDia(anio, mes0, dia) {
  const a = anio + Math.floor(mes0 / 12);
  const m = ((mes0 % 12) + 12) % 12;
  return aISO(new Date(a, m, Math.min(dia, diasDelMes(a, m)), 12));
}

export function sumarDias(iso, n) {
  const d = deISO(iso);
  d.setDate(d.getDate() + n);
  return aISO(d);
}

// Suma meses conservando el día pedido (el 31 cae en el último día de los meses cortos)
export function sumarMeses(iso, n, dia) {
  const d = deISO(iso);
  return fechaConDia(d.getFullYear(), d.getMonth() + n, dia ?? d.getDate());
}

export function diasEntre(desde, hasta) {
  return Math.round((deISO(hasta) - deISO(desde)) / 86400000);
}

export const mesDe = iso => iso.slice(0, 7);

export function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  return fechaConDia(a, m - 2, 1).slice(0, 7);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

export function fechaCorta(iso) {
  const d = deISO(iso);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

export function fechaLarga(iso) {
  const d = deISO(iso);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function cuandoEs(iso, hoy = hoyISO()) {
  const n = diasEntre(hoy, iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n < 0) return `hace ${-n} días`;
  return `en ${n} días`;
}

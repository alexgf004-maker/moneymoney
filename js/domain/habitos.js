// Hábitos de gasto: gastos hormiga, suscripciones y compromisos mensuales (y cuándo terminan).

import { r2, sumar } from './dinero.js';
import { mesDe, mesAnterior, deISO, diasDelMes, sumarMeses } from './fechas.js';
import { normalizar, patronSugerido, REGLAS_BASE } from './categorias.js';

// Las compras "normales": gastos que no son compras en cuotas ni ajustes
const compras = movs => movs.filter(m => m.tipo === 'gasto' && !m.plan && m.origen !== 'ajuste');

// Nombre agrupable de un comercio: "UBER *TRIP 1234" y "UBER *TRIP 9876" -> "UBER TRIP"
export const claveComercio = comercio => patronSugerido(comercio) || normalizar(comercio).slice(0, 20);

// ---------- Gastos hormiga: compras pequeñas y frecuentes ----------

export function gastosHormiga(movs, mes, hoy, umbral = 10) {
  const del = (mm) => compras(movs).filter(m => mesDe(m.fecha) === mm && m.monto < umbral);
  const lista = del(mes);
  const total = sumar(lista.map(m => m.monto));
  const anterior = sumar(del(mesAnterior(mes)).map(m => m.monto));
  const grupos = new Map();
  for (const m of lista) {
    const k = claveComercio(m.comercio);
    const g = grupos.get(k) || { clave: k, nombre: m.comercio, veces: 0, total: 0, categoriaId: m.categoriaId };
    g.veces++;
    g.total = r2(g.total + m.monto);
    grupos.set(k, g);
  }
  const [a, mm] = mes.split('-').map(Number);
  const diasMes = diasDelMes(a, mm - 1);
  const transcurridos = mesDe(hoy) === mes ? deISO(hoy).getDate() : diasMes;
  return {
    umbral, veces: lista.length, total, anterior,
    proyeccionMes: r2(total / transcurridos * diasMes),
    alAnio: r2(total / transcurridos * 365),
    porComercio: [...grupos.values()].sort((x, y) => y.total - x.total),
  };
}

// ---------- Suscripciones: cobros que se repiten cada mes ----------

const CONSUMO = new Set(['super', 'comida', 'gasolina', 'transporte', 'salud', 'efectivo', 'compras']);

const PATRONES_SUSCRIPCION = REGLAS_BASE.filter(([, c]) => c === 'suscripciones').map(([p]) => normalizar(p));

// marcas: { [clave]: { cancelar: true } | { ignorar: true } } (decisiones del usuario)
export function suscripciones(movs, recurrentes, hoy, marcas = {}) {
  const desde = sumarMeses(hoy, -4);
  const grupos = new Map();
  for (const m of compras(movs).filter(x => x.fecha > desde && x.fecha <= hoy)) {
    const k = claveComercio(m.comercio);
    const g = grupos.get(k) || { clave: k, nombre: m.comercio, cobros: [], cuentaId: m.cuentaId, categoriaId: m.categoriaId };
    g.cobros.push(m);
    grupos.set(k, g);
  }
  const lista = [];
  for (const g of grupos.values()) {
    g.cobros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const meses = new Set(g.cobros.map(c => mesDe(c.fecha)));
    const montos = g.cobros.map(c => c.monto);
    // Las suscripciones cobran casi lo mismo cada mes; el súper o la gasolina nunca son suscripción
    const parecidos = Math.max(...montos) <= Math.min(...montos) * 1.1;
    if (CONSUMO.has(g.categoriaId)) continue;
    const unaVezAlMes = g.cobros.length === meses.size;
    const esDeSuscripcion = g.categoriaId === 'suscripciones' || PATRONES_SUSCRIPCION.some(p => normalizar(g.nombre).includes(p));
    // Se repite en 2 o más meses con montos parecidos (y no es algo de todos los días), o es un servicio conocido
    if (!((meses.size >= 2 && parecidos && unaVezAlMes) || esDeSuscripcion)) continue;
    if (marcas[g.clave]?.ignorar) continue;
    const ultimo = g.cobros[g.cobros.length - 1];
    lista.push({
      clave: g.clave, nombre: ultimo.comercio, monto: ultimo.monto, mesesVistos: meses.size, ultimoCobro: ultimo.fecha,
      proximo: sumarMeses(ultimo.fecha, 1), cuentaId: ultimo.cuentaId, alAnio: r2(ultimo.monto * 12),
      cancelar: !!marcas[g.clave]?.cancelar, origen: 'detectada',
    });
  }
  // Pagos fijos marcados como suscripción que todavía no tienen cobros
  for (const r of recurrentes.filter(x => x.tipo === 'gasto' && x.categoriaId === 'suscripciones' && x.activo !== false)) {
    const k = claveComercio(r.nombre);
    if (lista.some(s => s.clave === k) || marcas[k]?.ignorar) continue;
    lista.push({ clave: k, nombre: r.nombre, monto: r.monto, mesesVistos: 0, ultimoCobro: null, proximo: null, cuentaId: r.cuentaId, alAnio: r2(r.monto * 12), cancelar: !!marcas[k]?.cancelar, origen: 'fijo' });
  }
  lista.sort((a, b) => b.monto - a.monto);
  const activas = lista.filter(s => !s.cancelar);
  return { lista, alMes: sumar(activas.map(s => s.monto)), alAnio: sumar(activas.map(s => s.alAnio)), paraCancelar: sumar(lista.filter(s => s.cancelar).map(s => s.monto)) };
}

// ---------- Compromisos: lo que pagas cada mes y cuándo termina ----------

// items: [{ nombre, tipo: 'cuotas'|'prestamo'|'fijo'|'suscripcion', mensual, fin ('AAAA-MM-DD' o null = sin fin) }]
export function lineaDeTiempo(items, hoy) {
  const activos = items.filter(i => !i.fin || i.fin >= hoy.slice(0, 7) + '-01');
  const mensualHoy = sumar(activos.map(i => i.mensual));
  const conFin = activos.filter(i => i.fin).sort((a, b) => a.fin.localeCompare(b.fin));
  const porMes = new Map();
  for (const i of conFin) {
    const mes = mesDe(sumarMeses(i.fin, 1)); // el mes en que ya no se paga
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(i);
  }
  let restante = mensualHoy;
  const hitos = [...porMes.entries()].map(([mes, lista]) => {
    const libera = sumar(lista.map(i => i.mensual));
    restante = r2(restante - libera);
    return { mes, termina: lista, libera, quedaAlMes: restante };
  });
  return { mensualHoy, items: activos.sort((a, b) => (a.fin || '9999').localeCompare(b.fin || '9999')), hitos, sinFin: sumar(activos.filter(i => !i.fin).map(i => i.mensual)) };
}

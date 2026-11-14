import { ui, esc, barra, vacioMsg } from '../ui.js';
import { lista, ajustes } from '../store.js';
import { movs, tarjetas, prestamos, recurrentes, resumenDeudas } from '../consultas.js';
import { totalGastado, totalIngresos, porCategoria, gastadoMismoDia, estadoPresupuestos, proximosPagos } from '../domain/resumen.js';
import { categoria } from '../domain/categorias.js';
import { dinero } from '../domain/dinero.js';
import { hoyISO, mesDe, mesAnterior, nombreMes, fechaCorta, cuandoEs, deISO } from '../domain/fechas.js';

export function vistaInicio() {
  const hoy = hoyISO();
  const m = movs();
  const mes = mesDe(hoy);
  const sinNada = !tarjetas().length && !prestamos().length && !m.length;
  if (sinNada) return bienvenida();

  const gastado = totalGastado(m, mes);
  const ingresos = totalIngresos(m, mes);
  const antes = gastadoMismoDia(m, mesAnterior(mes), deISO(hoy).getDate());
  const dif = antes ? (gastado - antes) / antes : 0;
  const deudas = resumenDeudas(hoy);
  const agenda = proximosPagos({ tarjetas: tarjetas(), prestamos: prestamos(), recurrentes: recurrentes(), movs: m }, hoy, 15);
  const presupuestos = Object.fromEntries(lista('presupuestos').map(p => [p.id, p.limite]));
  const alertas = estadoPresupuestos(presupuestos, m, mes, hoy).filter(p => p.nivel !== 'ok');
  const cats = porCategoria(m, mes).slice(0, 6);
  const maxCat = cats[0]?.total || 1;
  const porRevisar = m.filter(x => x.revisar).length;
  const noLeidos = lista('noLeidos').length;

  return `
    <section class="tarjeta-resumen">
      <div class="etiqueta">Gastado en ${nombreMes(mes)}</div>
      <div class="cifra-grande">${dinero(gastado)}</div>
      <div class="sub">
        ${antes ? `<span class="${dif > 0 ? 'malo' : 'bueno'}">${dif > 0 ? '▲' : '▼'} ${Math.abs(dif * 100).toFixed(0)}%</span> que a esta altura del mes pasado (${dinero(antes)})` : 'Sin datos del mes pasado para comparar'}
      </div>
      ${ingresos ? `<div class="sub">Ingresos del mes: <b>${dinero(ingresos)}</b> · Te queda <b>${dinero(ingresos - gastado)}</b></div>` : ''}
    </section>

    ${porRevisar ? `<button class="banda banda-info" data-accion="ver-revisar">🔎 ${porRevisar} movimiento${porRevisar > 1 ? 's' : ''} por revisar (tarjeta o categoría sin confirmar)</button>` : ''}
    ${noLeidos ? `<button class="banda banda-gris" data-accion="ir" data-vista="mas" data-seccion="noleidos">✉️ ${noLeidos} correo${noLeidos > 1 ? 's' : ''} del banco que no se pudo leer</button>` : ''}

    <section class="bloque">
      <div class="bloque-titulo"><h2>Próximos pagos</h2><span class="tenue">15 días</span></div>
      ${agenda.length ? `<div class="lista">${agenda.map(filaAgenda).join('')}</div>` : `<p class="tenue">Nada por pagar en los próximos 15 días. 🎉</p>`}
    </section>

    ${alertas.length ? `
    <section class="bloque">
      <div class="bloque-titulo"><h2>Presupuesto</h2><button class="enlace" data-accion="ir" data-vista="mas" data-seccion="presupuestos">Ver todo</button></div>
      ${alertas.map(a => {
        const c = categoria(a.categoriaId);
        return `<div class="fila-pres">
          <div class="fila-pres-top"><span>${c.icono} ${esc(c.nombre)}</span><span class="${a.nivel === 'excedido' ? 'malo' : 'alerta'}">${dinero(a.gastado)} / ${dinero(a.limite)}</span></div>
          ${barra(a.pct, a.nivel)}
          <small class="tenue">${a.nivel === 'excedido' ? `Te pasaste por ${dinero(-a.disponible)}` : `A este ritmo cerrarías el mes en ${dinero(a.proyeccion)}`}</small>
        </div>`;
      }).join('')}
    </section>` : ''}

    <section class="bloque">
      <div class="bloque-titulo"><h2>Deuda total</h2><button class="enlace" data-accion="ir" data-vista="deudas">Ver detalle</button></div>
      <div class="cifra-media">${dinero(deudas.total)}</div>
      <div class="dos-col">
        <div><div class="tenue">Tarjetas</div><b>${dinero(deudas.totalTarjetas)}</b></div>
        <div><div class="tenue">Préstamos</div><b>${dinero(deudas.totalPrestamos)}</b></div>
      </div>
    </section>

    <section class="bloque">
      <div class="bloque-titulo"><h2>¿En qué se va?</h2><button class="enlace" data-accion="ir" data-vista="movimientos">Movimientos</button></div>
      ${cats.length ? cats.map(x => {
        const c = categoria(x.categoriaId);
        return `<button class="fila-cat" data-accion="ver-categoria" data-id="${x.categoriaId}">
          <span class="fila-cat-nombre">${c.icono} ${esc(c.nombre)}</span>
          <span class="fila-cat-barra"><span style="width:${(x.total / maxCat * 100).toFixed(1)}%;background:${c.color}"></span></span>
          <b>${dinero(x.total)}</b>
        </button>`;
      }).join('') : '<p class="tenue">Todavía no hay gastos este mes.</p>'}
    </section>

    ${ajustes().ocultarConsejo ? '' : consejo(deudas)}
  `;
}

function filaAgenda(a) {
  const hoy = hoyISO();
  const urgente = a.vencido || a.fecha <= hoy;
  const icono = a.tipo === 'tarjeta' ? '💳' : a.tipo === 'prestamo' ? '🏦' : '🔁';
  const accion = a.tipo === 'fijo' ? '' : `data-accion="pagar" data-id="${a.id}"`;
  return `<button class="fila ${urgente ? 'fila-urgente' : ''}" ${accion}>
    <span class="fila-icono">${icono}</span>
    <span class="fila-texto"><b>${esc(a.titulo)}</b><small>${a.vencido ? '⚠️ Vencido · ' : ''}${fechaCorta(a.fecha)} (${cuandoEs(a.fecha, hoy)}) · ${esc(a.detalle)}</small></span>
    <span class="fila-monto">${dinero(a.monto)}</span>
  </button>`;
}

function consejo(deudas) {
  const alta = deudas.ts.filter(x => x.e.uso > 0.3).sort((a, b) => b.e.uso - a.e.uso)[0];
  if (!alta) return '';
  return `<section class="bloque consejo">
    <b>💡 Consejo</b>
    <p>Tu ${esc(alta.t.nombre)} está al ${(alta.e.uso * 100).toFixed(0)}% de su límite. Usar menos del 30% del límite ayuda a tu récord crediticio, y pagar el <b>pago de contado</b> antes de la fecha límite evita los intereses.</p>
    <button class="enlace" data-accion="ir" data-vista="deudas" data-seccion="plan">Ver mi plan para salir de deudas →</button>
  </section>`;
}

function bienvenida() {
  return `
    <section class="bloque bienvenida">
      <h2>¡Hola! 👋</h2>
      <p>Empecemos registrando lo que debes. Con eso la app calcula cuánto pagar y cuándo, y te avisa antes de cada fecha límite.</p>
      <div class="pasos">
        <button class="boton" data-accion="modal" data-tipo="tarjeta">💳 Agregar una tarjeta</button>
        <button class="boton secundario" data-accion="modal" data-tipo="prestamo">🏦 Agregar mi préstamo</button>
        <button class="boton secundario" data-accion="modal" data-tipo="movimiento">➕ Anotar un gasto</button>
      </div>
      <p class="tenue">Cuando configures la nube (Más → Conexión con Gmail), las compras con tarjeta se anotarán solas a partir de los correos del banco.</p>
      <button class="enlace" data-accion="datos-ejemplo">Ver la app con datos de ejemplo</button>
    </section>`;
}

export { filaAgenda };
export const mesActual = () => ui.mes;

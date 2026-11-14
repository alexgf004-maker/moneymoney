import { ui, esc, ic, tile, lin, top, sec, montoGrande } from '../ui.js';
import { lista, ajustes } from '../store.js';
import { movs, tarjetas, prestamos, recurrentes, resumenDeudas, estadosDe, tarjetasDetectadas } from '../consultas.js';
import { totalGastado, totalIngresos, porCategoria, gastadoMismoDia, estadoPresupuestos, proximosPagos } from '../domain/resumen.js';
import { categoria } from '../domain/categorias.js';
import { dinero } from '../domain/dinero.js';
import { hoyISO, mesDe, mesAnterior, nombreMes, fechaCorta, fechaLarga, cuandoEs, deISO } from '../domain/fechas.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function botonesTop() {
  const icono = { conectado: 'nube', cargando: 'nube', 'sin-sesion': 'nube', 'sin-configurar': 'telefono' }[ui.nube] || 'telefono';
  const titulo = ui.nube === 'conectado' ? 'Guardado en la nube' : 'Guardado solo en este teléfono';
  return `<button class="ib" data-accion="ir" data-vista="mas" data-sub="conexion" aria-label="${titulo}" title="${titulo}">${ic(icono)}</button>
    <button class="ib" data-accion="ir" data-vista="mas" data-sub="apariencia" aria-label="Apariencia">${ic('luna')}</button>`;
}

export function vistaInicio() {
  const hoy = hoyISO();
  const m = movs();
  const fecha = deISO(hoy);
  const encabezado = top({ eyebrow: `${DIAS[fecha.getDay()]}, ${fechaLarga(hoy).replace(/ de \d{4}$/, '')}`, titulo: ajustes().nombre ? `Hola, ${esc(ajustes().nombre)}` : 'Hola', der: botonesTop() });
  const entrar = ui.nube === 'sin-sesion' ? `<button class="aviso-fila" style="margin:0 0 14px" data-accion="entrar">${ic('nube')}<span class="rt"><b>Entra con tu cuenta de Google</b><small>Para guardar en la nube y recibir tus compras de Gmail</small></span><span class="mu">${ic('chevron-right')}</span></button>` : '';
  if (!tarjetas().length && !prestamos().length && !m.length && !lista('estados').length) return encabezado + entrar + bienvenida();

  const mes = mesDe(hoy);
  const gastado = totalGastado(m, mes);
  const ingresos = totalIngresos(m, mes);
  const antes = gastadoMismoDia(m, mesAnterior(mes), fecha.getDate());
  const dif = antes ? (gastado - antes) / antes : 0;
  const nombreAntes = nombreMes(mesAnterior(mes)).split(' ')[0];
  const agenda = proximosPagos({ tarjetas: tarjetas(), prestamos: prestamos(), recurrentes: recurrentes(), movs: m, estadosDe }, hoy, 15);
  const limites = Object.fromEntries(lista('presupuestos').map(p => [p.id, p.limite]));
  const alertas = estadoPresupuestos(limites, m, mes, hoy).filter(p => p.nivel !== 'ok');
  const cats = porCategoria(m, mes).slice(0, 5);
  const maxCat = cats[0]?.total || 1;
  const porRevisar = m.filter(x => x.revisar).length;
  const noLeidos = lista('noLeidos').length;
  const detectadas = tarjetasDetectadas().length;
  const deudas = resumenDeudas(hoy);

  return `${encabezado}
    <section class="pc">
      <div class="pc-top">
        <span class="pc-lbl">Gastado en ${nombreMes(mes).split(' ')[0]}</span>
        ${antes ? `<span class="badge ${dif > 0.1 ? 'rojo' : ''}">${ic(dif > 0 ? 'sube' : 'baja')} ${Math.abs(dif * 100).toFixed(0)}% vs. ${nombreAntes}</span>` : ''}
      </div>
      <div class="big">${montoGrande(dinero(gastado))}</div>
      <div class="pc-sub">${antes ? `A esta altura de ${nombreAntes} llevabas ${dinero(antes)}` : 'Lo que llevas gastado este mes'}</div>
      ${ingresos ? `
        <div class="bar ${gastado > ingresos ? 'pasado' : ''}"><span style="width:${Math.min(100, gastado / ingresos * 100).toFixed(1)}%"></span></div>
        <div class="pc-foot"><span>Ingresos ${dinero(ingresos)}</span><span>${gastado > ingresos ? `Te pasaste ${dinero(gastado - ingresos)}` : `Te quedan ${dinero(ingresos - gastado)}`}</span></div>`
        : `<button class="pc-btn" data-accion="modal" data-tipo="movimiento" data-mov="ingreso">${ic('plus')} Anota tu salario para ver cuánto te queda</button>`}
    </section>

    <nav class="acts" aria-label="Accesos rápidos">
      <button class="act" data-accion="modal" data-tipo="movimiento">${ic('plus')}<div>Anotar</div></button>
      <button class="act" data-accion="ir" data-vista="deudas" data-tab="tarjetas">${ic('pago')}<div>Pagar</div></button>
      <button class="act" data-accion="ir" data-vista="mas" data-sub="presupuesto">${ic('objetivo')}<div>Presupuesto</div></button>
      <button class="act" data-accion="ir" data-vista="deudas" data-tab="plan">${ic('escalera')}<div>Plan</div></button>
    </nav>

    ${ui.nube === 'sin-sesion' ? `<button class="aviso-fila" data-accion="entrar">${ic('nube')}<span class="rt"><b>Entra con tu cuenta de Google</b><small>Para guardar en la nube y recibir tus compras de Gmail</small></span><span class="mu">${ic('chevron-right')}</span></button>` : ''}
    ${detectadas ? `<button class="aviso-fila" data-accion="ir" data-vista="deudas" data-tab="tarjetas">${ic('tarjeta')}<span class="rt"><b>Encontré ${detectadas} tarjeta${detectadas > 1 ? 's' : ''} en tus correos</b><small>Agrégala${detectadas > 1 ? 's' : ''} con un toque</small></span><span class="mu">${ic('chevron-right')}</span></button>` : ''}
    ${porRevisar ? `<button class="aviso-fila" data-accion="ver-revisar">${ic('revisar')}<span class="rt"><b>${porRevisar} movimiento${porRevisar > 1 ? 's' : ''} por revisar</b><small>Confirma la tarjeta o la categoría</small></span><span class="mu">${ic('chevron-right')}</span></button>` : ''}
    ${noLeidos ? `<button class="aviso-fila" data-accion="ir" data-vista="mas" data-sub="noleidos">${ic('correo')}<span class="rt"><b>${noLeidos} correo${noLeidos > 1 ? 's' : ''} del banco sin leer</b><small>No parecen compras o el formato es nuevo</small></span></button>` : ''}

    ${sec('Próximos pagos', `<button class="link" data-accion="ir" data-vista="deudas">Deudas</button>`)}
    <div class="card">${agenda.length ? agenda.slice(0, 5).map(filaAgenda).join('') : `<div class="row">${tile('check', 'ok')}<span class="rt"><b>Nada por pagar en 15 días</b><small>Vas al día</small></span></div>`}</div>

    ${alertas.length ? `
      ${sec('Presupuesto', `<button class="link" data-accion="ir" data-vista="mas" data-sub="presupuesto">Ver todo</button>`)}
      <div class="card">${alertas.map(a => {
        const c = categoria(a.categoriaId);
        return `<div class="row">${tile(c.icono, '', `color:${c.color}`)}<span class="rt"><b>${esc(c.nombre)}</b>${lin(a.pct, a.nivel === 'excedido' ? 'bad' : 'warn')}<small>${a.nivel === 'excedido' ? `Te pasaste por ${dinero(-a.disponible)}` : `A este ritmo cierras el mes en ${dinero(a.proyeccion)}`}</small></span><span class="amt">${dinero(a.gastado)}<small>de ${dinero(a.limite)}</small></span></div>`;
      }).join('')}</div>` : ''}

    ${sec('¿En qué se va?', `<button class="link" data-accion="ir" data-vista="movimientos">Movimientos</button>`)}
    <div class="card">${cats.length ? cats.map(x => {
      const c = categoria(x.categoriaId);
      return `<button class="cat" data-accion="ver-categoria" data-id="${x.categoriaId}">${ic(c.icono, `style="color:${c.color}"`)}<span><span class="cat-n">${esc(c.nombre)}</span>${lin(x.total / maxCat, '', c.color)}</span><b>${dinero(x.total)}</b></button>`;
    }).join('') : `<div class="row"><span class="rt mu">Todavía no hay gastos este mes</span></div>`}</div>

    ${consejo(deudas)}
  `;
}

export function filaAgenda(a) {
  const hoy = hoyISO();
  const icono = a.tipo === 'tarjeta' ? 'tarjeta' : a.tipo === 'prestamo' ? 'banco' : 'repetir';
  const dias = Math.round((deISO(a.fecha) - deISO(hoy)) / 86400000);
  const estado = a.vencido ? '<span class="chip bad">Vencido</span>'
    : dias <= 1 ? `<span class="chip warn">${dias === 0 ? 'Hoy' : 'Mañana'}</span>`
    : dias <= 5 ? `<span class="chip">${cuandoEs(a.fecha, hoy)}</span>` : '';
  const accion = a.tipo === 'fijo' ? 'data-accion="modal" data-tipo="recurrente"' : 'data-accion="pagar"';
  return `<button class="row" ${accion} data-id="${a.id}">
    ${tile(icono, a.vencido ? 'bad' : '')}
    <span class="rt"><b>${esc(a.titulo)}</b><small>${estado}${fechaCorta(a.fecha)} · ${esc(a.detalle)}</small></span>
    <span class="amt">${dinero(a.monto)}</span>
  </button>`;
}

function consejo(deudas) {
  const alta = deudas.ts.filter(x => x.e.uso > 0.3).sort((a, b) => b.e.uso - a.e.uso)[0];
  if (!alta) return '';
  return `${sec('Consejo')}
    <div class="card pad">
      <div class="row" style="padding:0;border:0;align-items:flex-start">${tile('bombilla', 'oro')}
        <span class="rt"><b style="white-space:normal">Tu ${esc(alta.t.nombre)} está al ${(alta.e.uso * 100).toFixed(0)}% del límite</b>
        <small style="white-space:normal">Usar menos del 30% ayuda a tu récord crediticio. Pagar el pago de contado antes de la fecha límite evita los intereses.</small>
        <button class="link" data-accion="ir" data-vista="deudas" data-tab="plan">Ver mi plan ${ic('flecha-derecha')}</button></span>
      </div>
    </div>`;
}

function bienvenida() {
  return `<div class="bienv">
    <section class="pc">
      <span class="badge">${ic('escudo')} Tus datos son solo tuyos</span>
      <div class="bienv-t">Toma el control de tus tarjetas y tu préstamo</div>
      <div class="pc-sub">Registra lo que debes y la app te dice cuánto pagar, cuándo, y cómo salir de deudas más rápido.</div>
    </section>
    ${sec('Empieza aquí')}
    <div class="card">
      <button class="row" data-accion="modal" data-tipo="tarjeta">${tile('tarjeta')}<span class="rt"><b>Agrega una tarjeta</b><small>Corte, fecha de pago y saldo</small></span>${ic('chevron-right')}</button>
      <button class="row" data-accion="modal" data-tipo="prestamo">${tile('banco')}<span class="rt"><b>Agrega tu préstamo</b><small>Monto, tasa y plazo</small></span>${ic('chevron-right')}</button>
      <button class="row" data-accion="modal" data-tipo="movimiento">${tile('plus')}<span class="rt"><b>Anota un gasto</b><small>En 3 toques</small></span>${ic('chevron-right')}</button>
    </div>
    <div class="vacio"><div>¿Quieres verla funcionando primero?</div><button class="btn sec sm" data-accion="datos-ejemplo">${ic('ojo')} Ver con datos de ejemplo</button></div>
  </div>`;
}

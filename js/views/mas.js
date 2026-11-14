import { ui, esc, barra, vacioMsg, entrada } from '../ui.js';
import { lista } from '../store.js';
import { movs, cuentas, reglas, recurrentes, nombreCuenta, nombreBanco } from '../consultas.js';
import { CATEGORIAS, categoria } from '../domain/categorias.js';
import { estadoPresupuestos, proximaFechaRecurrente } from '../domain/resumen.js';
import { dinero, sumar } from '../domain/dinero.js';
import { hoyISO, mesDe, nombreMes, fechaCorta } from '../domain/fechas.js';
import { FIREBASE } from '../config.js';

export function vistaMas() {
  return [presupuestos(), fijos(), conexion(), noLeidos(), cuentasHTML(), reglasHTML(), respaldo()].join('');
}

function presupuestos() {
  const hoy = hoyISO();
  const mes = mesDe(hoy);
  const limites = Object.fromEntries(lista('presupuestos').map(p => [p.id, p.limite]));
  const estado = Object.fromEntries(estadoPresupuestos(limites, movs(), mes, hoy).map(e => [e.categoriaId, e]));
  const total = sumar(Object.values(limites));
  return `<section class="bloque" id="presupuestos">
    <div class="bloque-titulo"><h2>Presupuesto mensual</h2><span class="tenue">${nombreMes(mes)}</span></div>
    <p class="tenue">Pon un límite a las categorías que quieras controlar. Te avisa al llegar al 80% o si vas a ritmo de pasarte.${total ? ` Total: <b>${dinero(total)}</b>.` : ''}</p>
    ${CATEGORIAS.filter(c => c.id !== 'comisiones').map(c => {
      const e = estado[c.id];
      return `<div class="fila-pres">
        <div class="fila-pres-top">
          <span>${c.icono} ${esc(c.nombre)}</span>
          <span class="pres-limite">$ ${entrada('', limites[c.id] || '', { tipo: 'number', min: 0, paso: 5, ph: 'Sin límite', extra: `data-presupuesto="${c.id}" class="corto"` })}</span>
        </div>
        ${e ? `${barra(e.pct, e.nivel)}<small class="tenue">${dinero(e.gastado)} gastado · ${e.disponible >= 0 ? `quedan ${dinero(e.disponible)}` : `te pasaste ${dinero(-e.disponible)}`}</small>` : ''}
      </div>`;
    }).join('')}
  </section>`;
}

function fijos() {
  const hoy = hoyISO();
  const rs = recurrentes();
  return `<section class="bloque" id="fijos">
    <div class="bloque-titulo"><h2>Pagos fijos del mes</h2><button class="enlace" data-accion="modal" data-tipo="recurrente">＋ Agregar</button></div>
    <p class="tenue">Netflix, teléfono, internet, la cuota del préstamo, tu salario… Se anotan solos el día que toca.</p>
    ${rs.length ? `<div class="lista">${rs.map(r => {
      const c = r.tipo === 'pago' ? { icono: '💸' } : categoria(r.categoriaId);
      return `<button class="fila ${r.activo === false ? 'apagado' : ''}" data-accion="modal" data-tipo="recurrente" data-id="${r.id}">
        <span class="fila-icono">${c.icono}</span>
        <span class="fila-texto"><b>${esc(r.nombre)}</b><small>Día ${r.dia} · ${esc(nombreCuenta(r.cuentaId))}${r.activo === false ? ' · pausado' : ` · próximo ${fechaCorta(proximaFechaRecurrente(r, hoy))}`}</small></span>
        <span class="fila-monto ${r.tipo === 'ingreso' ? 'bueno' : ''}">${r.tipo === 'ingreso' ? '+' : ''}${dinero(r.monto)}</span>
      </button>`;
    }).join('')}</div>` : ''}
  </section>`;
}

function conexion() {
  let cuerpo;
  if (ui.nube === 'sin-configurar') {
    cuerpo = `<p>La app está guardando todo <b>solo en este teléfono</b>. Para que las compras con tarjeta se anoten solas desde tus correos, hay que configurar la nube (Firebase) y el script de Gmail. Los pasos están en <code>apps-script/README.md</code> del repositorio.</p>`;
  } else if (ui.nube === 'cargando') {
    cuerpo = '<p class="tenue">Conectando…</p>';
  } else if (ui.nube === 'sin-sesion') {
    cuerpo = `<p>Inicia sesión con tu cuenta de Google para guardar en la nube y recibir los movimientos de Gmail.</p>
      <button class="boton" data-accion="entrar">Entrar con Google</button>`;
  } else {
    cuerpo = `<p>✅ Conectado como <b>${esc(ui.usuario?.correo)}</b>. Tus datos se guardan en la nube.</p>
      <div class="campo"><span>Tu código para el script de Gmail (UID)</span>
        <div class="copiar"><code>${esc(ui.usuario?.uid)}</code><button class="boton chico secundario" data-accion="copiar" data-texto="${esc(ui.usuario?.uid)}">Copiar</button></div>
      </div>
      <button class="enlace" data-accion="salir">Cerrar sesión</button>`;
  }
  return `<section class="bloque" id="conexion"><h2>Conexión con Gmail</h2>${cuerpo}</section>`;
}

function noLeidos() {
  const nl = lista('noLeidos').sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!nl.length) return '';
  return `<section class="bloque" id="noleidos">
    <div class="bloque-titulo"><h2>Correos del banco sin leer</h2><button class="enlace" data-accion="borrar-noleidos">Limpiar</button></div>
    <p class="tenue">Llegaron de un banco pero no parecen una compra, o el formato es nuevo. Si alguno sí era una compra, anótala con ＋ y pásame el ejemplo para mejorar el lector.</p>
    <div class="lista">${nl.slice(0, 20).map(n => `<div class="fila"><span class="fila-texto"><b>${esc(n.asunto)}</b><small>${fechaCorta(n.fecha)} · ${esc(n.de)}</small><small class="tenue">${esc((n.texto || '').slice(0, 160))}…</small></span></div>`).join('')}</div>
  </section>`;
}

function cuentasHTML() {
  return `<section class="bloque" id="cuentas">
    <div class="bloque-titulo"><h2>Cuentas y efectivo</h2><button class="enlace" data-accion="modal" data-tipo="cuenta">＋ Agregar</button></div>
    <p class="tenue">Desde dónde pagas lo que no es con tarjeta de crédito (cuenta de ahorro, débito, efectivo).</p>
    <div class="lista">${cuentas().map(c => `<button class="fila" data-accion="modal" data-tipo="cuenta" data-id="${c.id}">
      <span class="fila-icono">${c.tipo === 'efectivo' ? '💵' : '🏧'}</span>
      <span class="fila-texto"><b>${esc(c.nombre)}</b><small>${c.tipo === 'efectivo' ? 'Efectivo' : esc(nombreBanco(c.banco))}${c.ultimos4 ? ` ···${esc(c.ultimos4)}` : ''}</small></span>
    </button>`).join('')}</div>
  </section>`;
}

function reglasHTML() {
  const rs = reglas().sort((a, b) => a.patron.localeCompare(b.patron));
  return `<section class="bloque" id="reglas">
    <div class="bloque-titulo"><h2>Reglas de categorías</h2><button class="enlace" data-accion="modal" data-tipo="regla">＋ Agregar</button></div>
    <p class="tenue">Cuando corriges la categoría de un movimiento puedes guardarla como regla, y la app la aplica sola a los siguientes de ese comercio.</p>
    ${rs.length ? `<div class="lista">${rs.map(r => {
      const c = categoria(r.categoriaId);
      return `<button class="fila" data-accion="modal" data-tipo="regla" data-id="${r.id}">
        <span class="fila-icono">${c.icono}</span><span class="fila-texto"><b>“${esc(r.patron)}”</b><small>→ ${esc(c.nombre)}</small></span>
      </button>`;
    }).join('')}</div>` : vacioMsg('Sin reglas propias', 'Ya se reconocen solos los comercios más comunes (Selectos, Walmart, Puma, Netflix…).')}
  </section>`;
}

function respaldo() {
  return `<section class="bloque" id="respaldo">
    <h2>Respaldo</h2>
    <p class="tenue">${FIREBASE ? 'Con la nube conectada tus datos ya están respaldados. ' : ''}También puedes descargar una copia en un archivo y restaurarla después.</p>
    <div class="acciones">
      <button class="boton chico secundario" data-accion="exportar">Descargar copia</button>
      <label class="boton chico secundario">Restaurar copia<input type="file" accept="application/json,.json" data-accion-archivo="importar" hidden></label>
    </div>
    <button class="enlace malo" data-accion="borrar-todo">Borrar todos los datos</button>
  </section>`;
}

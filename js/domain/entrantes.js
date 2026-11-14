// Movimientos que llegan solos desde los correos del banco (los deja el script de Gmail en `entrantes`).
// Aquí se les asigna la tarjeta (por banco y últimos 4 dígitos) y la categoría (por comercio).
//
// Entrante: { id, banco, fecha, monto, comercio, ultimos4, tipo, confianza, asunto }

import { categorizar } from './categorias.js';
import { r2 } from './dinero.js';

// ¿Ya existe el mismo movimiento? (dos correos de la misma compra: misma tarjeta, monto y fecha con 1 día de margen)
export function esDuplicado(mov, existentes) {
  const t = Date.parse(mov.fecha);
  return existentes.some(m => m.id !== mov.id && m.tipo === mov.tipo && m.monto === mov.monto && m.ultimos4 && m.ultimos4 === mov.ultimos4
    && Math.abs(Date.parse(m.fecha) - t) <= 86400000);
}

export function buscarTarjeta(entrante, tarjetas) {
  const mismos = tarjetas.filter(t => t.ultimos4 && t.ultimos4 === entrante.ultimos4);
  if (mismos.length <= 1) return mismos[0] || null;
  return mismos.find(t => t.banco === entrante.banco) || mismos[0];
}

// Un estado de cuenta: se guarda tal cual en `estados` (un id por banco, tarjeta y corte)
export function procesarEstado(e) {
  return {
    id: `${e.banco}_${e.ultimos4 || '0000'}_${e.fechaCorte}`,
    banco: e.banco, ultimos4: e.ultimos4 || null, nombre: e.nombre || null,
    fechaCorte: e.fechaCorte, fechaPago: e.fechaPago || null, contado: r2(e.contado), minimo: e.minimo == null ? null : r2(e.minimo),
  };
}

// cuentas: para saber desde dónde salió un pago (cuenta por sus últimos 4, o una tarjeta si se pagó con otra tarjeta)
export function procesarEntrante(entrante, { tarjetas, reglas, cuentas = [] }) {
  const tarjeta = buscarTarjeta(entrante, tarjetas);
  const desde = entrante.origen4
    ? cuentas.find(c => c.cuenta4 === entrante.origen4) || tarjetas.find(t => t.ultimos4 === entrante.origen4 && t.id !== tarjeta?.id) || null
    : null;
  const tipo = entrante.tipo || 'gasto';
  const { categoriaId, segura } = tipo === 'gasto'
    ? categorizar(entrante.comercio, reglas)
    : { categoriaId: tipo === 'reembolso' ? categorizar(entrante.comercio, reglas).categoriaId : null, segura: true };
  return {
    id: `gm_${entrante.id}`,
    fecha: entrante.fecha,
    monto: r2(entrante.monto),
    tipo,
    cuentaId: tarjeta?.id || null,
    categoriaId: categoriaId || (tipo === 'pago' ? null : 'otros'),
    comercio: entrante.comercio || (tipo === 'pago' ? 'Pago a tarjeta' : entrante.asunto || 'Sin nombre'),
    desdeId: desde?.id || null,
    origen: 'correo',
    banco: entrante.banco,
    ultimos4: entrante.ultimos4 || null,
    origen4: entrante.origen4 || null,
    // Se marca para revisar si algo no quedó claro: tarjeta desconocida, categoría adivinada o lectura dudosa
    revisar: !tarjeta || !segura || entrante.confianza === 'baja',
  };
}

// Movimientos que llegan solos desde los correos del banco (los deja el script de Gmail en `entrantes`).
// Aquí se les asigna la tarjeta (por banco y últimos 4 dígitos) y la categoría (por comercio).
//
// Entrante: { id, banco, fecha, monto, comercio, ultimos4, tipo, confianza, asunto }

import { categorizar } from './categorias.js';
import { r2 } from './dinero.js';

export function buscarTarjeta(entrante, tarjetas) {
  const mismos = tarjetas.filter(t => t.ultimos4 && t.ultimos4 === entrante.ultimos4);
  if (mismos.length <= 1) return mismos[0] || null;
  return mismos.find(t => t.banco === entrante.banco) || mismos[0];
}

export function procesarEntrante(entrante, { tarjetas, reglas }) {
  const tarjeta = buscarTarjeta(entrante, tarjetas);
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
    comercio: entrante.comercio || entrante.asunto || 'Sin nombre',
    origen: 'correo',
    banco: entrante.banco,
    ultimos4: entrante.ultimos4 || null,
    // Se marca para revisar si algo no quedó claro: tarjeta desconocida, categoría adivinada o lectura dudosa
    revisar: !tarjeta || !segura || entrante.confianza === 'baja',
  };
}

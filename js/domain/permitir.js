// "¿Me lo puedo permitir?" · opción 2 "Comparar formas de pago" (elegida el 15 nov 2026).
// Simula una compra de tres formas y compara cómo quedas: con efectivo o débito, con tarjeta de crédito pagando el
// total (de contado) y en cuotas a tasa cero. Usa el mismo cálculo que "Puedes gastar" (cuantoPuedoGastar), con la
// compra agregada como si ya la hubieras hecho, así los números cuadran con el Inicio.

import { r2 } from './dinero.js';
import { cuantoPuedoGastar } from './cuentas.js';
import { estadoTarjeta, proximoCorte, ultimoCorte, fechaPagoDe, cargosDePlanes } from './tarjetas.js';
import { lineaDeTiempo, porTerminar } from './habitos.js';
import { sumarDias } from './fechas.js';

// Cómo te deja cada forma: 'no' (no te alcanza), 'aprieta' (te alcanza justo) o 'bien'
function veredicto(antes, despues) {
  // Si ya te faltaba antes de la compra, solo es "no" la forma que lo empeora ahora; la que no, te aprieta
  if (despues.libre < 0) return despues.libre < antes.libre ? 'no' : 'aprieta';
  const sobraAntes = antes.ingreso ? antes.ingreso.monto - antes.delSiguiente : 0;
  const sobraDespues = despues.ingreso ? despues.ingreso.monto - despues.delSiguiente : 0;
  if (despues.porDia < antes.porDia * 0.6 || (despues.ingreso && sobraDespues < 0 && sobraDespues < sobraAntes)) return 'aprieta';
  return 'bien';
}

// Lo que te sobra del próximo salario después de los pagos del mes siguiente (negativo: no alcanza)
const sobraDelSalario = g => (g.ingreso ? r2(g.ingreso.monto - g.delSiguiente) : null);

const resumen = (antes, despues) => ({
  libre: despues.libre, porDia: despues.porDia, cambioLibre: r2(despues.libre - antes.libre),
  sobraSalario: sobraDelSalario(despues), sobraSalarioAntes: sobraDelSalario(antes),
  veredicto: veredicto(antes, despues),
});

// datos: lo mismo que cuantoPuedoGastar ({ cuentas, movs, tarjetas, prestamos, recurrentes, estadosDe })
// compromisos: items de lineaDeTiempo (lo que pagas cada mes), para ver si las cuotas retrasan lo que se te libera
export function simularCompra(monto, datos, hoy, { meses = 6, compromisos = [] } = {}) {
  monto = r2(monto);
  // Una tarjeta solo suma las compras de después del día en que pusiste su saldo: para simular una compra de hoy en
  // una tarjeta configurada hoy, se toma ese saldo como de ayer (en todos los cálculos, para comparar parejo)
  const ayer = sumarDias(hoy, -1);
  datos = { ...datos, tarjetas: datos.tarjetas.map(t => (t.fechaSaldo && t.fechaSaldo >= hoy ? { ...t, fechaSaldo: ayer } : t)) };
  const antes = cuantoPuedoGastar(datos, hoy);
  if (!antes || !(monto > 0)) return null;
  const compra = { id: 'sim', tipo: 'gasto', monto, fecha: hoy, comercio: 'Compra', categoriaId: 'compras', creado: Date.now() };
  const formas = [];

  // 1) Efectivo o débito: sale hoy de lo que tienes. Se descuenta de la cuenta con más dinero.
  const principal = antes.cuentas.slice().sort((a, b) => b.saldo - a.saldo)[0].c;
  // (se baja el saldo directo: un movimiento del mismo día que pusiste el saldo no lo cambiaría)
  const cuentasMenos = datos.cuentas.map(c => (c.id === principal.id ? { ...c, saldoInicial: r2(c.saldoInicial - monto) } : c));
  const conEfectivo = cuantoPuedoGastar({ ...datos, cuentas: cuentasMenos }, hoy);
  formas.push({ forma: 'efectivo', titulo: 'Efectivo o débito', desde: principal.nombre, ...resumen(antes, conEfectivo), intereses: 0 });

  // 2) y 3) Con tarjeta: se prueba en cada tarjeta con disponible suficiente y se queda la que mejor te deja
  const conDisponible = datos.tarjetas
    .map(t => ({ t, e: estadoTarjeta(t, datos.movs, hoy, datos.estadosDe ? datos.estadosDe(t) : []) }))
    .filter(x => x.e.disponible == null || x.e.disponible >= monto || !x.t.limite);
  const mejorDe = lista => lista.sort((a, b) => b.g.libre - a.g.libre || (sobraDelSalario(b.g) ?? 0) - (sobraDelSalario(a.g) ?? 0) || b.pago.localeCompare(a.pago))[0];

  if (conDisponible.length) {
    const contado = mejorDe(conDisponible.map(({ t }) => ({
      t, pago: fechaPagoDe(t, proximoCorte(t, hoy)),
      g: cuantoPuedoGastar({ ...datos, movs: [...datos.movs, { ...compra, cuentaId: t.id }] }, hoy),
    })));
    formas.push({
      forma: 'tarjeta', titulo: 'Tarjeta, pagando el total', tarjeta: contado.t, fechaPago: contado.pago,
      ...resumen(antes, contado.g), intereses: 0,
      // Si solo pagas el mínimo, el saldo genera intereses (aprox. un mes de la tasa de la tarjeta)
      interesMinimo: contado.t.tasaAnual ? r2(monto * contado.t.tasaAnual / 100 / 12) : null,
    });

    // Cuotas a tasa cero: cada corte cobra una cuota, desde el próximo
    const cuota = r2(monto / meses);
    const enCuotas = mejorDe(conDisponible.map(({ t }) => {
      const plan = { id: 'sim', nombre: 'Compra', tipo: 'tasa0', cuota, total: meses, cobradas: 0, corteRef: ultimoCorte(t, hoy) };
      const conPlan = { ...t, planes: { ...(t.planes || {}), sim: plan } };
      const cargos = cargosDePlanes({ ...t, planes: { sim: plan } });
      return {
        t, pago: fechaPagoDe(t, cargos[0].fecha), fin: cargos[cargos.length - 1].fecha,
        g: cuantoPuedoGastar({ ...datos, tarjetas: datos.tarjetas.map(x => (x.id === t.id ? conPlan : x)) }, hoy),
      };
    }));
    // ¿Retrasa el mes desde el que pagas menos? (lo que muestra "Estás por terminar")
    const linea = lineaDeTiempo(compromisos, hoy);
    const lineaCon = lineaDeTiempo([...compromisos, { nombre: 'Compra', mensual: cuota, fin: enCuotas.fin }], hoy);
    const libera = porTerminar(linea, hoy);
    const liberaCon = porTerminar(lineaCon, hoy);
    formas.push({
      forma: 'cuotas', titulo: `${meses} cuotas a tasa cero`, tarjeta: enCuotas.t, cuota, meses, fin: enCuotas.fin,
      ...resumen(antes, enCuotas.g), intereses: 0,
      liberaAntes: libera?.desde || null, liberaDespues: liberaCon?.desde || null,
    });
  }

  // La que mejor te deja: primero las que te dejan bien; entre ellas, la que menos te quita hasta el salario,
  // y a igualdad, pagar el total con tarjeta antes que efectivo, y cuotas al final (te comprometen más meses)
  const rango = { bien: 0, aprieta: 1, no: 2 };
  const orden = { tarjeta: 0, efectivo: 1, cuotas: 2 };
  const candidatas = formas.filter(f => f.veredicto !== 'no');
  const mejor = candidatas.sort((a, b) => rango[a.veredicto] - rango[b.veredicto] || orden[a.forma] - orden[b.forma])[0] || null;
  return { monto, antes: { libre: antes.libre, porDia: antes.porDia, hasta: antes.hasta, ingreso: antes.ingreso }, yaFalta: antes.libre < 0 ? r2(-antes.libre) : 0, formas, mejor: mejor?.forma || null };
}

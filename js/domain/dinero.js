// Montos en dólares, siempre redondeados a centavos.

export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export const sumar = lista => r2(lista.reduce((s, n) => s + (Number(n) || 0), 0));

export function dinero(n, { signo = false } = {}) {
  const v = r2(n);
  const txt = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v < 0) return `-$${txt}`;
  return `${signo && v > 0 ? '+' : ''}$${txt}`;
}

// Lee "1,234.56", "1.234,56", "$ 25" o "25.5" como número
export function leerMonto(texto) {
  if (typeof texto === 'number') return r2(texto);
  let s = String(texto ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const ultPunto = s.lastIndexOf('.');
  const ultComa = s.lastIndexOf(',');
  if (ultComa > ultPunto) {
    // La coma es el decimal solo si le siguen 1 o 2 dígitos ("1.234,56"); si no, separa miles ("1,234")
    s = s.length - ultComa - 1 <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  return r2(parseFloat(s));
}

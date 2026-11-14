// Categorías y clasificación automática por nombre del comercio.

// icono: nombre del ícono en css/icons.css (ic-cat-*)
export const CATEGORIAS = [
  { id: 'super', nombre: 'Supermercado', icono: 'cat-super', color: '#16a34a' },
  { id: 'comida', nombre: 'Restaurantes', icono: 'cat-comida', color: '#ea580c' },
  { id: 'gasolina', nombre: 'Gasolina', icono: 'cat-gasolina', color: '#ca8a04' },
  { id: 'transporte', nombre: 'Transporte', icono: 'cat-transporte', color: '#0891b2' },
  { id: 'servicios', nombre: 'Servicios', icono: 'cat-servicios', color: '#2563eb' },
  { id: 'suscripciones', nombre: 'Suscripciones', icono: 'cat-suscripciones', color: '#7c3aed' },
  { id: 'salud', nombre: 'Salud', icono: 'cat-salud', color: '#dc2626' },
  { id: 'compras', nombre: 'Compras', icono: 'cat-compras', color: '#db2777' },
  { id: 'hogar', nombre: 'Hogar', icono: 'cat-hogar', color: '#65a30d' },
  { id: 'entretenimiento', nombre: 'Salidas', icono: 'cat-entretenimiento', color: '#c026d3' },
  { id: 'educacion', nombre: 'Educación', icono: 'cat-educacion', color: '#0d9488' },
  { id: 'efectivo', nombre: 'Retiro efectivo', icono: 'cat-efectivo', color: '#52525b' },
  { id: 'comisiones', nombre: 'Intereses y cargos', icono: 'cat-comisiones', color: '#9a3412' },
  { id: 'otros', nombre: 'Otros', icono: 'cat-otros', color: '#71717a' },
];

export const INGRESOS = [
  { id: 'salario', nombre: 'Salario', icono: 'cat-salario', color: '#15803d' },
  { id: 'extra', nombre: 'Ingreso extra', icono: 'cat-extra', color: '#0891b2' },
];

const TODAS = [...CATEGORIAS, ...INGRESOS];
export const categoria = id => TODAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];

// Comercios comunes en El Salvador. Las reglas que crea el usuario van primero.
export const REGLAS_BASE = [
  ['UBER EATS', 'comida'], ['PEDIDOS YA', 'comida'], ['PEDIDOSYA', 'comida'], ['SELECTOS', 'super'], ['WALMART', 'super'], ['DESPENSA', 'super'], ['MAXI DESPENSA', 'super'], ['PRICESMART', 'super'],
  ['SUPER ', 'super'], ['DOLLARCITY', 'compras'],
  ['CAMPERO', 'comida'], ['PIZZA', 'comida'], ['MCDONALD', 'comida'], ['BURGER', 'comida'], ['WENDY', 'comida'],
  ['KFC', 'comida'], ['SUBWAY', 'comida'], ['STARBUCKS', 'comida'], ['RESTAURANT', 'comida'], ['PUPUS', 'comida'],
  ['BIGGEST', 'comida'], ['MISTER DONUT', 'comida'], ['CAFE', 'comida'], ['TACO', 'comida'], ['HUGO', 'comida'], ['PEDIDOSYA', 'comida'],
  ['PUMA', 'gasolina'], ['TEXACO', 'gasolina'], ['SHELL', 'gasolina'], ['UNO ', 'gasolina'], ['GASOLINERA', 'gasolina'], ['ESTACION', 'gasolina'],
  ['UBER', 'transporte'], ['INDRIVE', 'transporte'], ['PARQUEO', 'transporte'], ['PEAJE', 'transporte'],
  ['DELSUR', 'servicios'], ['CAESS', 'servicios'], ['AES', 'servicios'], ['EEO', 'servicios'], ['DEUSEM', 'servicios'], ['ANDA', 'servicios'],
  ['CLARO', 'servicios'], ['TIGO', 'servicios'], ['DIGICEL', 'servicios'], ['MOVISTAR', 'servicios'],
  ['NETFLIX', 'suscripciones'], ['SPOTIFY', 'suscripciones'], ['DISNEY', 'suscripciones'], ['HBO', 'suscripciones'], ['MAX.COM', 'suscripciones'],
  ['YOUTUBE', 'suscripciones'], ['APPLE.COM', 'suscripciones'], ['GOOGLE', 'suscripciones'], ['AMAZON PRIME', 'suscripciones'],
  ['PRIME VIDEO', 'suscripciones'], ['OPENAI', 'suscripciones'], ['CHATGPT', 'suscripciones'], ['ANTHROPIC', 'suscripciones'], ['CLAUDE', 'suscripciones'],
  ['FARMACIA', 'salud'], ['SAN NICOLAS', 'salud'], ['HOSPITAL', 'salud'], ['CLINICA', 'salud'], ['LABORATORIO', 'salud'],
  ['SIMAN', 'compras'], ['AMAZON', 'compras'], ['SHEIN', 'compras'], ['TEMU', 'compras'], ['ALIEXPRESS', 'compras'], ['PRISMA MODA', 'compras'],
  ['CURACAO', 'hogar'], ['TROPIGAS', 'hogar'], ['VIDRI', 'hogar'], ['FREUND', 'hogar'], ['EPA', 'hogar'], ['OMNISPORT', 'compras'],
  ['CINEMARK', 'entretenimiento'], ['CINEPOLIS', 'entretenimiento'], ['STEAM', 'entretenimiento'], ['PLAYSTATION', 'entretenimiento'],
  ['CAJERO', 'efectivo'], ['ATM', 'efectivo'], ['RETIRO', 'efectivo'],
  ['MEDICARE', 'comisiones'], ['ACCIDENTES PERSONALES', 'comisiones'], ['ASISTENCIA', 'comisiones'], ['INTERES', 'comisiones'], ['COMISION', 'comisiones'], ['MEMBRESIA', 'comisiones'], ['CARGO POR', 'comisiones'], ['SEGURO', 'comisiones'],
];

export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9.&]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// reglasUsuario: [{ patron, categoriaId }]. Gana la regla del usuario más específica (patrón más largo).
export function categorizar(comercio, reglasUsuario = []) {
  const texto = ` ${normalizar(comercio)} `;
  const propias = [...reglasUsuario].sort((a, b) => normalizar(b.patron).length - normalizar(a.patron).length);
  for (const r of propias) {
    const p = normalizar(r.patron);
    if (p && texto.includes(p)) return { categoriaId: r.categoriaId, segura: true };
  }
  for (const [patron, cat] of REGLAS_BASE) {
    // Los patrones con espacio al final ("UNO ") exigen palabra completa
    const p = patron.endsWith(' ') ? ` ${normalizar(patron)} ` : normalizar(patron);
    if (texto.includes(p)) return { categoriaId: cat, segura: true };
  }
  return { categoriaId: 'otros', segura: false };
}

// Patrón sugerido para crear una regla a partir de un comercio: quita números de sucursal y referencias
export function patronSugerido(comercio) {
  return normalizar(comercio)
    .split(' ')
    .filter(p => p.length > 1 && !/\d/.test(p) && !['SA', 'DE', 'CV', 'S.A.', 'C.V.', 'SV', 'SAN', 'SALVADOR'].includes(p))
    .slice(0, 2)
    .join(' ');
}

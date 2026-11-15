// Genera css/icons.css a partir de los SVG de Lucide (npm run icons). Para agregar un ícono, súmalo a MAPA.
// Uso en el HTML: <i class="ic ic-nombre"></i>. Toma el color del texto.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../node_modules/lucide-static/icons');

// nombre en la app → archivo de Lucide
const MAPA = {
  // navegación y acciones
  inicio: 'house', movimientos: 'receipt-text', deudas: 'credit-card', mas: 'layout-grid', plus: 'plus',
  buscar: 'search', editar: 'pencil', borrar: 'trash-2', x: 'x', check: 'circle-check', alerta: 'triangle-alert',
  info: 'info', correo: 'mail', nube: 'cloud', telefono: 'smartphone', 'chevron-left': 'chevron-left',
  'chevron-right': 'chevron-right', 'chevron-down': 'chevron-down', 'flecha-derecha': 'arrow-right',
  sube: 'trending-up', baja: 'trending-down', objetivo: 'target', calendario: 'calendar-days', reloj: 'clock',
  copiar: 'copy', descargar: 'download', subir: 'upload', salir: 'log-out', entrar: 'log-in', luna: 'moon', sol: 'sun',
  auto: 'sun-moon', filtro: 'sliders-horizontal', revisar: 'search-check', escudo: 'shield-check', bombilla: 'lightbulb',
  regla: 'wand-sparkles', calculadora: 'calculator', tabla: 'table-2', repetir: 'repeat', banco: 'landmark',
  cartera: 'wallet', billete: 'banknote', tarjeta: 'credit-card', pago: 'hand-coins', ingreso: 'arrow-down-left',
  devolucion: 'undo-2', grafica: 'chart-pie', escalera: 'chart-no-axes-column-decreasing', bandeja: 'inbox',
  ayuda: 'circle-help', ojo: 'eye', mas2: 'ellipsis', papelera: 'trash', paleta: 'palette', base: 'database', cerdito: 'piggy-bank', fuego: 'flame', bola: 'circle-dot', fiesta: 'party-popper', usuarios: 'users',
  // categorías
  'cat-super': 'shopping-cart', 'cat-comida': 'utensils', 'cat-gasolina': 'fuel', 'cat-transporte': 'car',
  'cat-servicios': 'zap', 'cat-suscripciones': 'tv', 'cat-salud': 'pill', 'cat-compras': 'shopping-bag',
  'cat-hogar': 'sofa', 'cat-entretenimiento': 'ticket', 'cat-educacion': 'graduation-cap', 'cat-efectivo': 'banknote',
  'cat-comisiones': 'percent', 'cat-otros': 'package', 'cat-salario': 'briefcase', 'cat-extra': 'sparkles',
};

let css = '/* Íconos Lucide (https://lucide.dev, licencia ISC) como máscara: toman el color del texto.\n   Generado por tools/gen-icons.cjs (npm run icons); no editar a mano. */\n';
css += '.ic { display: inline-block; width: 1.15em; height: 1.15em; vertical-align: -0.2em; flex-shrink: 0; background-color: currentColor; -webkit-mask: var(--ic) center / contain no-repeat; mask: var(--ic) center / contain no-repeat; }\n';
for (const [nombre, archivo] of Object.entries(MAPA)) {
  let svg = fs.readFileSync(path.join(dir, archivo + '.svg'), 'utf8')
    .replace(/<!--.*?-->/s, '').replace(/class="[^"]*"/, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim()
    .replace('stroke="currentColor"', 'stroke="black"');
  css += `.ic-${nombre} { --ic: url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}"); }\n`;
}
fs.writeFileSync(path.join(__dirname, '../css/icons.css'), css);
console.log(Object.keys(MAPA).length, 'íconos', css.length, 'bytes');

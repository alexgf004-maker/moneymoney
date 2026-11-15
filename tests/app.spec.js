// Recorre la app con datos de ejemplo, como en un celular.
import { test, expect } from '@playwright/test';

// Emojis y símbolos que no deben aparecer en la interfaz (regla de los proyectos del usuario)
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{FF0B}]/u;

// Sin nube en las pruebas (la app real se conecta a Firebase)
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { window.__SIN_NUBE__ = true; }); });

async function conEjemplo(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'Ver con datos de ejemplo' }).click();
  return errores;
}

const nav = (page, nombre) => page.locator('.nav').getByRole('button', { name: nombre }).click();

test('las cuatro pantallas abren sin errores ni emojis', async ({ page }) => {
  const errores = await conEjemplo(page);
  for (const [nombre, texto] of [['Inicio', 'Gastado en'], ['Movimientos', 'Gastos del mes'], ['Deudas', 'Debes en total'], ['Más', 'Tu dinero']]) {
    await nav(page, nombre);
    await expect(page.locator('#vista')).toContainText(texto);
    expect(await page.locator('body').innerText()).not.toMatch(EMOJI);
    // Una sola tarjeta premium por pantalla
    expect(await page.locator('#vista .pc').count()).toBeLessThanOrEqual(1);
  }
  expect(errores).toEqual([]);
});

test('anotar un gasto en efectivo', async ({ page }) => {
  await conEjemplo(page);
  await page.locator('.fab').click();
  const f = page.locator('form[data-form=movimiento]');
  await f.locator('[name=monto]').fill('7.50');
  await f.locator('[name=comercio]').fill('Pupusería Doña Tita');
  await f.locator('label:has(input[value=comida])').click();
  await f.getByRole('button', { name: 'Guardar' }).click();
  await nav(page, 'Movimientos');
  await expect(page.locator('#vista')).toContainText('Pupusería Doña Tita');
  await expect(page.locator('#vista')).toContainText('-$7.50');
});

test('confirmar un movimiento dudoso y guardar la regla', async ({ page }) => {
  await conEjemplo(page);
  await page.getByRole('button', { name: /por revisar/ }).click();
  await page.locator('.row.revisar').first().click();
  const f = page.locator('form[data-form=movimiento]');
  await f.locator('label:has(input[value=hogar])').click();
  await f.locator('[name=crearRegla]').check();
  await f.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.locator('.row.revisar')).toHaveCount(0);
  await nav(page, 'Más');
  await page.getByRole('button', { name: /Reglas de categorías/ }).click();
  await expect(page.locator('#vista')).toContainText('ALMACEN XYZ');
});

test('pagar el contado de una tarjeta la deja al día', async ({ page }) => {
  await conEjemplo(page);
  await nav(page, 'Deudas');
  const visa = page.locator('.tc', { hasText: 'Visa Agrícola' });
  await visa.getByRole('button', { name: 'Registrar pago' }).click();
  await page.locator('.montos-rapidos button', { hasText: 'Pago de contado' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).last().click();
  await expect(visa).toContainText('Al día');
});

test('pestañas de deudas y simulador del préstamo', async ({ page }) => {
  await conEjemplo(page);
  await nav(page, 'Deudas');
  await page.getByRole('tab', { name: 'Préstamo' }).click();
  await expect(page.locator('#vista')).toContainText('¿Y si abonas extra cada mes?');
  await page.locator('[data-sim]').fill('100');
  await page.locator('[data-sim]').blur();
  await expect(page.locator('#vista')).toContainText('cuotas menos');
  await page.getByRole('tab', { name: 'Plan' }).click();
  await expect(page.locator('#vista')).toContainText('Avalancha');
  await page.getByRole('button', { name: 'Tabla de pagos' }).count().then(n => expect(n).toBe(0));
});

test('agregar una tarjeta nueva', async ({ page }) => {
  await conEjemplo(page);
  await nav(page, 'Deudas');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  const f = page.locator('form[data-form=tarjeta]');
  await f.locator('[name=banco]').selectOption('credicomer');
  await f.locator('[name=nombre]').fill('Credicomer Visa');
  await f.locator('[name=ultimos4]').fill('5555');
  await f.locator('[name=limite]').fill('1000');
  await f.locator('[name=diaCorte]').fill('10');
  await f.locator('[name=diaPago]').fill('30');
  await f.locator('[name=saldoHoy]').fill('200');
  await f.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('.tc', { hasText: 'Credicomer Visa' })).toContainText('$200.00');
});

test('tema oscuro elegido a mano', async ({ page }) => {
  await conEjemplo(page);
  await nav(page, 'Más');
  await page.getByRole('button', { name: /Apariencia/ }).click();
  await page.getByRole('button', { name: 'Oscuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
  const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fondo).toBe('rgb(12, 12, 13)');
});

test('correos del banco: compras, pagos y estados de cuenta llegan solos', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  // Lo que dejaría el script de Gmail en `entrantes` (datos inventados)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    const hoy = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dias = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n));
    localStorage.setItem('moneymoney:v1', JSON.stringify({ entrantes: {
      a: { id: 'a', tipo: 'gasto', banco: 'credicomer', monto: 7.39, ultimos4: '2222', comercio: 'DLC UBER EATS -I- SAN SALVADOR SV', fecha: dias(-1), confianza: 'alta' },
      b: { id: 'b', tipo: 'estado', banco: 'credicomer', ultimos4: null, nombre: 'VISA EMMA', fechaCorte: dias(-5), fechaPago: dias(20), contado: 38.69, minimo: 5 },
      c: { id: 'c', tipo: 'estado', banco: 'cuscatlan', ultimos4: '7777', nombre: 'CASH BACK PEDIDOS YA VISA CUSCATLAN', fechaCorte: dias(-20), fechaPago: dias(3), contado: 129.11, minimo: 5 },
    } }));
  });
  await page.goto('/');
  // Los pendientes van en una sola línea; la primera acción lleva a las tarjetas encontradas
  const pendientes = page.getByRole('button', { name: /pendientes/ });
  await expect(pendientes).toContainText('2 tarjetas encontradas');
  await pendientes.click();
  await page.locator('[data-pre="credicomer|2222"]').click();
  const f = page.locator('form[data-form=tarjeta]');
  await expect(f.locator('[name=nombre]')).toHaveValue('Visa Emma');
  await expect(f.locator('[name=saldoCorte]')).toHaveValue('38.69');
  await f.locator('[name=limite]').fill('500');
  await f.locator('[name=saldoHoy]').fill('46.08');
  await f.getByRole('button', { name: 'Guardar' }).click();
  const emma = page.locator('.tc', { hasText: 'Visa Emma' });
  await expect(emma).toContainText('Según tu estado de cuenta');
  await expect(emma).toContainText('$38.69');
  // La compra de Uber Eats quedó en la tarjeta y como comida
  await page.locator('.nav').getByRole('button', { name: 'Movimientos' }).click();
  await expect(page.locator('#vista')).toContainText('Restaurantes · Visa Emma ···2222');
  expect(errores).toEqual([]);
});

test('correos revisados y comparación con el estado de cuenta', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    const hoy = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dias = n => iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n));
    localStorage.setItem('moneymoney:v1', JSON.stringify({
      tarjetas: { t1: { id: 't1', banco: 'bac', nombre: 'Mastercard BAC', ultimos4: '4444', limite: 600, diaCorte: Number(dias(-2).slice(8)), diaPago: 5, tasaAnual: 40, minimoPct: 5, saldoInicial: 100, fechaSaldo: dias(-10), saldoCorteInicial: 0, pagadoCorteInicial: 0 } },
      movimientos: { m1: { id: 'm1', fecha: dias(-5), monto: 50, tipo: 'gasto', cuentaId: 't1', categoriaId: 'super', comercio: 'WALMART', origen: 'correo' } },
      estados: { e1: { id: 'e1', banco: 'bac', ultimos4: '4444', fechaCorte: dias(-2), fechaPago: dias(18), contado: 158.5, minimo: 20 } },
      revision: {
        r1: { id: 'r1', fecha: dias(-5), banco: 'bac', asunto: 'Alerta de compra', resultado: 'movimiento', monto: 50, ultimos4: '4444' },
        r2: { id: 'r2', fecha: dias(-4), banco: 'agricola', asunto: 'El Extra que necesitas', resultado: 'publicidad' },
        r3: { id: 'r3', fecha: dias(-3), banco: 'agricola', asunto: 'Notificación de cargo', resultado: 'sin-tarjeta', monto: 12.25 },
      },
    }));
  });
  await page.goto('/');
  // Comparación con el banco: el banco dice 158.50, la app calculó 150.00
  await page.locator('.nav').getByRole('button', { name: 'Deudas' }).click();
  const tc = page.locator('.tc', { hasText: 'Mastercard BAC' });
  await expect(tc).toContainText('Diferencia de $8.50 con el banco');
  await tc.getByRole('button', { name: 'Ajustar al banco' }).click();
  await expect(tc).toContainText('Cuadra con tu estado de cuenta');
  // Correos revisados: el descartado se puede anotar con sus datos
  await page.locator('.nav').getByRole('button', { name: 'Más' }).click();
  await page.getByRole('button', { name: /Correos revisados/ }).click();
  await expect(page.locator('#vista')).toContainText('1 por revisar');
  await page.getByRole('button', { name: /Notificación de cargo/ }).click();
  await expect(page.locator('form[data-form=movimiento] [name=monto]')).toHaveValue('12.25');
  expect(errores).toEqual([]);
});

test('compras en cuotas: extrafinanciamiento y compra nueva a tasa cero', async ({ page }) => {
  const errores = await conEjemplo(page);
  await nav(page, 'Deudas');
  const visa = page.locator('.tc', { hasText: 'Visa Agrícola' });
  const antes = await visa.locator('.cifra').innerText();
  // Extrafinanciamiento: 11 de 12 cuotas de $50 -> falta 1
  await visa.getByRole('button', { name: 'Agregar compra en cuotas' }).click();
  const f = page.locator('form[data-form=plan]');
  await f.locator('label:has(input[value=extra])').click();
  await f.locator('[name=nombre]').fill('Extrafinanciamiento');
  await f.locator('[name=cuota]').fill('50');
  await f.locator('[name=total]').fill('12');
  await f.locator('[name=cobradas]').fill('11');
  await f.getByRole('button', { name: 'Guardar' }).click();
  await expect(visa).toContainText('+ $50.00 en cuotas');
  await expect(visa).toContainText('cuota 11 de 12');
  expect(await visa.locator('.cifra').innerText()).not.toBe(antes);
  // Compra nueva a tasa cero: $600 en 6 meses
  await page.locator('.fab').click();
  const m = page.locator('form[data-form=movimiento]');
  await m.locator('[name=monto]').fill('600');
  await m.locator('[name=comercio]').fill('Cocina');
  await m.locator('[name=cuentaGasto]').selectOption({ label: 'Tarjeta Visa Agrícola ···4821' });
  await m.locator('[name=tasaCero]').check();
  await m.locator('[name=meses]').selectOption('6');
  await m.getByRole('button', { name: 'Guardar' }).click();
  await expect(visa).toContainText('Cocina');
  await expect(visa).toContainText('cuota 0 de 6');
  await expect(visa).toContainText('+ $650.00 en cuotas');
  expect(errores).toEqual([]);
});

test('inicio: el próximo pago es lo primero, luego la deuda y el mes', async ({ page }) => {
  const errores = await conEjemplo(page);
  const pc = page.locator('#vista .pc');
  await expect(pc).toContainText(/Tu próximo pago|Pago vencido/);
  await expect(pc.getByRole('button', { name: 'Registrar pago' })).toBeVisible();
  await expect(page.locator('#vista')).toContainText('Lo que viene');
  await expect(page.locator('#vista')).toContainText('Debes en total');
  await expect(page.locator('#vista')).toContainText('Gastado en');
  // Registrar el pago desde la tarjeta principal abre la ventana de pago de esa deuda
  await pc.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(page.locator('form[data-form=pago]')).toBeVisible();
  expect(errores).toEqual([]);
});

test('inicio: cuánto puedo gastar con saldos y salario', async ({ page }) => {
  const errores = await conEjemplo(page);
  // Sin saldos todavía: invita a ponerlos
  await expect(page.getByRole('button', { name: /¿Cuánto puedes gastar\?/ })).toBeVisible();
  await nav(page, 'Más');
  await page.getByRole('button', { name: /Cuentas y efectivo/ }).click();
  await page.getByRole('button', { name: /Efectivo/ }).click();
  await page.locator('form[data-form=cuenta] [name=saldoHoy]').fill('1500');
  await page.locator('form[data-form=cuenta]').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#vista')).toContainText('$1,500.00');
  await nav(page, 'Inicio');
  const g = page.locator('.gastar');
  await expect(g).toContainText('Puedes gastar hasta');
  await expect(g).toContainText('Tienes (Efectivo)');
  await expect(g).toContainText(/Te alcanza|No te alcanza/);
  expect(errores).toEqual([]);
});

test('hábitos: gastos hormiga, suscripciones y cuándo termino de pagar', async ({ page }) => {
  const errores = await conEjemplo(page);
  // Desde el Inicio
  await page.getByRole('button', { name: /Gastos hormiga:/ }).click();
  await expect(page.locator('#vista')).toContainText('Menos de $10.00');
  await expect(page.locator('#vista')).toContainText('UBER');
  await nav(page, 'Más');
  await page.getByRole('button', { name: /Suscripciones/ }).click();
  await expect(page.locator('#vista')).toContainText('NETFLIX');
  await page.getByRole('button', { name: 'Cancelarla' }).first().click();
  await expect(page.locator('#vista')).toContainText('Para cancelar');
  await expect(page.locator('#vista')).toContainText('si cancelas');
  const antes = await page.locator('[data-accion="sus-ignorar"]').count();
  await page.getByRole('button', { name: 'No es suscripción' }).last().click();
  await expect(page.locator('[data-accion="sus-ignorar"]')).toHaveCount(antes - 1);
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: /Cuándo termino de pagar/ }).click();
  await expect(page.locator('#vista')).toContainText('Pagas cada mes');
  await expect(page.locator('#vista')).toContainText('Préstamo personal');
  expect(await page.locator('body').innerText()).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  expect(errores).toEqual([]);
});

test('varios pagos urgentes: el más cercano con cuenta regresiva y los demás dentro de la tarjeta', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sembrado')) return;
    sessionStorage.setItem('sembrado', '1');
    const hoy = new Date();
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dia = n => new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
    // Tres tarjetas que vencen en 1, 2 y 2 días; el corte fue hace 20 días
    const t = (id, n, monto) => ({ id, banco: 'bac', nombre: `Tarjeta ${id}`, ultimos4: id.repeat(4), limite: 1000, diaCorte: dia(-20).getDate(), diaPago: dia(n).getDate(), tasaAnual: 40, minimoPct: 5, saldoInicial: monto, fechaSaldo: iso(dia(-1)), saldoCorteInicial: monto, pagadoCorteInicial: 0 });
    localStorage.setItem('moneymoney:v1', JSON.stringify({ tarjetas: { a: t('a', 1, 50), b: t('b', 2, 40), c: t('c', 2, 200) } }));
  });
  await page.goto('/');
  const pc = page.locator('#vista .pc');
  await expect(pc).toHaveClass(/borde-rojo/);
  await expect(pc).toContainText('3 urgentes');
  await expect(pc.locator('.anillo')).toContainText('1');
  await expect(pc.locator('.pc-urg')).toHaveCount(2);
  await expect(pc.locator('.pc-urg').first()).toContainText('Tarjeta c'); // el mismo día, primero el más caro
  await expect(pc).toContainText('Urgente en total');
  await expect(pc).toContainText('$290.00');
  expect(errores).toEqual([]);
});

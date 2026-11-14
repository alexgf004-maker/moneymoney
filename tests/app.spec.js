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
  await page.getByRole('button', { name: 'Agregar' }).click();
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
  await expect(page.getByRole('button', { name: /Encontré 2 tarjetas en tus correos/ })).toBeVisible();
  await page.getByRole('button', { name: /Encontré 2 tarjetas/ }).click();
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

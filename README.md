# MoneyMoney

App personal de finanzas (PWA para Android): tarjetas de crédito, préstamos, gastos y presupuesto, con registro
automático de las compras a partir de los correos de alerta del banco.

- **Inicio**: gasto del mes contra el mes pasado, próximos pagos, alertas de presupuesto, deuda total y gasto por categoría.
- **Deudas**: por tarjeta, el pago de contado y el mínimo, la fecha límite, el uso del límite y los intereses si pagas
  solo el mínimo. Del préstamo, el avance, la tabla de pagos y el simulador de abonos extra. Además, un plan para salir
  de deudas (avalancha o bola de nieve).
- **Movimientos**: por mes, con filtros; los que llegan del correo y hay que confirmar aparecen marcados.
- **Más**: presupuesto por categoría, pagos fijos, cuentas, reglas de categorías, conexión con Gmail y respaldo.

## Cómo funciona la automatización

```
Gmail (alerta del banco) → script de Apps Script cada 5 min (apps-script/) → Firebase usuarios/{uid}/entrantes
→ la app le asigna la tarjeta (por los últimos 4 dígitos) y la categoría (por el comercio) → movimientos
```

Configuración paso a paso: [apps-script/README.md](apps-script/README.md).

## Desarrollo

- Sin build: HTML, CSS y JS con módulos nativos. Para probar: `python3 -m http.server 8000` y abrir <http://localhost:8000>.
- Sin Firebase configurado (`js/config.js` en `null`), la app guarda todo en el teléfono (localStorage).
- Pruebas: `npm install` y `npm test`. Corren las reglas de `js/domain/`, el lector de correos y la app en un navegador con tamaño de celular (Playwright).
- Estructura y decisiones: [CONTEXTO.md](CONTEXTO.md).

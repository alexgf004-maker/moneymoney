# MoneyMoney: contexto para Claude

App personal de finanzas de un solo usuario, que vive en El Salvador y usa Android y Gmail.
Tiene tarjetas de Banco Agrícola, BAC, Credicomer, Siman y Banco Cuscatlán, y un préstamo.
El objetivo es tener claro cuánto gasta, no pagar intereses de más y salir de deudas, anotando a mano lo menos posible.

## Decisiones

- **No hay conexión directa con los bancos**: no existe open banking para bancos salvadoreños, y guardar usuarios y
  contraseñas del banco no es seguro. La automatización se hace con los **correos de alerta**, que lee un script
  de Apps Script en la cuenta del usuario.
- **PWA sin build** (mismo estilo que el proyecto NetTracker del usuario): HTML, CSS y JS con módulos ES, y
  GitHub Pages para publicarla.
- **Firebase Realtime Database es opcional**: sin config, la app guarda todo en localStorage. Con config, usa
  login con Google y guarda los datos en `usuarios/{uid}/{coleccion}/{id}`.
- **La lógica vive en un solo lugar (la app)**: el script solo extrae los datos crudos del correo y los deja en
  `entrantes`. La app asigna la tarjeta y la categoría y los pasa a `movimientos` con id `gm_{idDelCorreo}`, lo que
  evita duplicados.
- **Los pagos a tarjetas o préstamos no son gasto**: el gasto se cuenta cuando se hace la compra.

## Estructura

```
index.html · manifest.webmanifest · sw.js · css/styles.css · icons/
js/
  main.js           Arranque, toques (data-accion), formularios (data-form), procesos automáticos
  store.js          Datos: localStorage + espejo en Firebase
  firebase.js       Login con Google y sincronización (librerías cargadas solo si hay config)
  config.js         FIREBASE = null | { ...firebaseConfig }
  consultas.js      Une los datos guardados con las reglas de domain/ para las pantallas
  ui.js             Estado de la pantalla y piezas de HTML
  demo.js           Datos de ejemplo
  domain/           Funciones puras, con pruebas en tests/
    fechas.js       Fechas 'AAAA-MM-DD'
    dinero.js       Redondeo y formato de montos
    tarjetas.js     Corte, fecha de pago, pago de contado, mínimo y saldo
    prestamo.js     Cuota francesa, tabla de pagos, abonos extra y simulación
    deudas.js       Plan avalancha / bola de nieve
    categorias.js   Categorías, reglas base (comercios de El Salvador) y clasificación
    resumen.js      Totales del mes, presupuestos, pagos fijos y agenda
    entrantes.js    De correo a movimiento
  views/            Funciones que devuelven HTML
apps-script/        Script de Gmail (Codigo.gs, Lector.gs, appsscript.json) + guía de configuración
tests/              node --test
```

## Modelo de datos (colecciones)

- `tarjetas`: { banco, nombre, ultimos4, limite, diaCorte, diaPago, tasaAnual, minimoPct, saldoInicial, fechaSaldo,
  saldoCorteInicial, pagadoCorteInicial }
- `prestamos`: { banco, nombre, monto, tasaAnual, plazoMeses, cuota, fechaPrimerPago }
- `cuentas`: efectivo (fija) y cuentas de banco (opcionalmente con ultimos4 de la tarjeta de débito)
- `movimientos`: { fecha, monto, tipo: gasto|ingreso|pago|reembolso, cuentaId, desdeId, categoriaId, comercio, nota,
  origen: manual|correo|fijo, revisar, extra (abono a capital), banco, ultimos4 }
- `reglas`: { patron, categoriaId } · `presupuestos`: { id: categoriaId, limite } · `recurrentes`: pagos fijos
- `entrantes` y `noLeidos`: los escribe el script de Gmail

## Pendiente

- Ajustar `Lector.gs` con correos reales de cada banco (por ahora usa un lector general).
- Importar estados de cuenta en PDF (se necesita un ejemplo de cada banco).
- Clasificar con IA los comercios desconocidos (opcional).
- Recordatorios de pago fuera de la app (por ejemplo, un correo diario desde el mismo script).

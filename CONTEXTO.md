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

## Diseño (opción C "Grafito y oro", elegida el 14 nov 2026 entre 3 propuestas)

Reglas que vienen de los otros proyectos del usuario (Daily-log, STC-innova, NetTracker). No cambiarlas sin preguntar:
- **Para el celular.** En PC solo se ve centrada con ancho de teléfono (máx. 520 px); no hay menú lateral.
- **Una sola tarjeta premium por pantalla** (`.pc`: degradado grafito con círculo dorado). Todo lo demás es plano (`.card`, `.tc`).
- **Números grandes en peso 500**, nunca 800, con los centavos más pequeños (`montoGrande()`). Mucho aire entre secciones.
- **Una sola fuente:** Plus Jakarta Sans, con cifras tabulares.
- **Sin emojis en ningún archivo** (`.js`, `.gs`, `.css`, `index.html`) ni en la interfaz. Los íconos son de Lucide:
  `ic('nombre')` en las vistas. Para agregar uno, se suma a `tools/gen-icons.cjs` y se corre `npm run icons`.
  Hay una prueba que falla si aparece un emoji (`tests/sin-emojis.test.js` y `tests/app.spec.js`).
- **Ventanas:** hoja que sube desde abajo (`.hoja`). Las opciones con ícono (tipo, categoría) son radios mostrados como tarjetas (`opciones()`).
- **Tema** claro, oscuro o automático: `data-tema` en `<html>`, elegido en Más > Apariencia y guardado en el teléfono.
- **Propuestas de diseño:** siempre 3 opciones con imágenes, nunca solo texto.
- Las piezas están documentadas al inicio de `css/styles.css`; antes de crear estilos nuevos, reusar las que existen.

## Inicio: opción A "Pagos primero" (elegida el 15 nov 2026 entre 3 propuestas)
- La tarjeta premium es el próximo pago (o el vencido), con mínimo, total a pagar en 30 días y "Registrar pago".
  Si no hay pagos en 30 días: "Al día" y el próximo corte.
- Debajo: accesos rápidos, UNA línea de pendientes (tarjetas encontradas, movimientos por revisar, correos sin
  registrar), "Lo que viene" (resto de pagos y tarjetas que cortan hoy o mañana), "Tu deuda" y "Tu mes".
- Prioridad acordada con el usuario: 1) qué pagar y cuándo, 2) cuánto debo, 3) en qué se va el dinero.

## Tu dinero disponible y tus hábitos
- Cuentas y efectivo tienen saldo (`saldoInicial` + `fechaSaldo`, domain/cuentas.js). Se ajusta editando la cuenta.
- Salario: pago fijo de ingreso con `variable: true` (se anota el estimado y queda por confirmar).
- "Puedes gastar hasta el {día de salario}" (Inicio, opción 2 elegida el 15 nov 2026): lo que tienes − pagos antes del
  salario − reserva (lo que el salario no alcance a cubrir del período siguiente: compras del ciclo, cuotas, préstamo,
  pagos fijos a cuentas). Lo que vence el mismo día del salario va al período siguiente.
- Hábitos (domain/habitos.js, pantallas en Más): gastos hormiga (compras de menos de `ajustes.umbralHormiga`, $10 por
  defecto), suscripciones (mismo comercio una vez al mes con montos casi iguales, o servicio conocido; nunca súper,
  comida, gasolina…; marcas del usuario en `ajustes.suscripciones`) y "Cuándo termino de pagar" (línea de tiempo de
  cuotas, préstamo, pagos fijos y suscripciones, con lo que se libera cada mes).

## Urgencia (opción 3 "Cuenta regresiva", elegida el 15 nov 2026)
- Urgente = vencido o a 3 días o menos (rojo); pronto = a 7 días o menos (ámbar). `urgencia()` en views/inicio.js.
- La tarjeta premium sigue en grafito: si es urgente lleva borde rojo y un anillo con los días que faltan.
- Varios urgentes: el más cercano es el protagonista y los demás van dentro de la misma tarjeta ("También vencen
  pronto"), con el total urgente; no se repiten en "Lo que viene". El mismo día, primero el más caro.
- En "Lo que viene" y en Deudas: barra o borde rojo (urgente) o ámbar (pronto); Deudas ordena por fecha de pago.

## Avisos (notificaciones)
- La app registra el teléfono con Firebase Cloud Messaging (clave `VAPID` en config.js) y guarda el token en
  `usuarios/{uid}/dispositivos/{id}`. sw.js muestra los avisos y abre la app al tocarlos.
- La app publica `usuarios/{uid}/agenda` (próximos pagos) unos segundos después de cada cambio.
- El script (Codigo.gs) manda: un aviso por cada compra o pago que llega por correo (solo en la revisión normal) y,
  cada mañana a las 7 (`enviarRecordatorios`), UN aviso con los pagos a 3 días o menos o vencidos, armado por
  `armarRecordatorio` (Avisos.gs, con pruebas). Copia por correo si `ajustes.notif.correo`.
- Avisos de pago insistentes (como en Daily-log): se quedan en pantalla, vibración fuerte, botones "Ver pagos" y
  "Recordar luego", imagen grande 1024x512 (`icons/aviso-pago|hoy|urgentes|vencido.jpg`, generadas con
  `node tools/gen-avisos.cjs`) y `icons/badge-96.png` como ícono blanco de la barra de estado.
- No repite avisos (`AVISADOS` en propiedades del script) y no avisa de una tarjeta si ya llegó un pago a ella por
  correo (`PAGADOS`), aunque la agenda esté vieja.

## Estructura

```
index.html · manifest.webmanifest · sw.js · css/styles.css · css/icons.css (generado) · icons/ · tools/gen-icons.cjs
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
tests/              *.test.js con node --test (reglas y lector) · app.spec.js con Playwright (la app en tamaño de celular)
```

## Modelo de datos (colecciones)

- `tarjetas`: { banco, nombre, ultimos4, limite, diaCorte, diaPago, tasaAnual, minimoPct, saldoInicial, fechaSaldo,
  saldoCorteInicial, pagadoCorteInicial }
- `prestamos`: { banco, nombre, monto, tasaAnual, plazoMeses, cuota, fechaPrimerPago }
- `cuentas`: efectivo (fija) y cuentas de banco (opcionalmente `cuenta4`, últimos 4 del número de cuenta, para saber
  desde dónde se pagó una tarjeta, y `ultimos4` de la tarjeta de débito)
- `movimientos`: { fecha, monto, tipo: gasto|ingreso|pago|reembolso, cuentaId, desdeId, categoriaId, comercio, nota,
  origen: manual|correo|fijo, revisar, extra (abono a capital), banco, ultimos4 }
- `estados`: estados de cuenta leídos de los correos { banco, ultimos4, nombre, fechaCorte, fechaPago, contado, minimo }.
  Si hay uno del ciclo actual, `estadoTarjeta` usa sus números exactos (`fuente: 'banco'`) en vez de calcularlos.
  Los que no tienen últimos 4 (EMMA) se asignan a la única tarjeta de ese banco.
- Tarjetas detectadas: las que aparecen en `estados` o en movimientos sin tarjeta y no están registradas
  (`tarjetasDetectadas()` en consultas.js). Deudas las ofrece con el formulario ya lleno.
- `reglas`: { patron, categoriaId } · `presupuestos`: { id: categoriaId, limite } · `recurrentes`: pagos fijos
- `entrantes` y `noLeidos`: los escribe el script de Gmail

## Pendiente

- Faltan ejemplos del estado de cuenta de Agrícola y Siman.
- Confirmar las direcciones exactas de los remitentes cuando el script corra (la búsqueda incluye "notificaciones" y "alertas").

## Control de que no se escape nada
- `revision/{idCorreo}`: el script registra cada correo de banco con su resultado (`analizarCorreo` en Lector.gs:
  movimiento, estado, publicidad, aviso, sin-tarjeta, sin-movimiento, estado-incompleto). La app lo muestra en
  Más > Correos revisados, y los descartados se pueden anotar con sus datos.
- Conciliación al corte (`conciliar` en tarjetas.js): con un estado de cuenta posterior a la configuración de la tarjeta,
  compara el pago de contado del banco con el saldo calculado al corte. "Ajustar al banco" agrega un movimiento
  `aj_{tarjeta}_{corte}` (cargo o crédito en "Intereses y cargos") que deja ambos iguales.
- El script corta a los 4.5 minutos y guarda lo avanzado (Google corta a los 6).

## Compras en cuotas (tasa cero y extrafinanciamiento)
- Viven dentro de la tarjeta: `tarjetas/{id}/planes/{planId}` = { nombre, tipo: tasa0|extra, cuota, total, cobradas, corteRef, tasaAnual }.
- `cobradas` = cuotas ya incluidas en estados de cuenta hasta `corteRef`. En cada corte siguiente la tarjeta suma un cargo
  `tipo: 'cuota'` (virtual, `cargosDePlanes`) hasta completar `total`. Lo que falta va aparte ("en cuotas"): no entra al pago
  de contado, pero sí a la deuda total y al uso del límite.
- Una compra anotada como "tasa cero" crea su plan y queda con `plan: id`: no se suma completa a la tarjeta, pero cuenta
  completa como gasto del mes en que se hizo.
- En el plan de deudas cada compra en cuotas es un pago fijo sin intereses (en el extrafinanciamiento la cuota ya los trae).

## Pagos entre tarjetas
Un pago con `desdeId` = otra tarjeta (p. ej. pagar la Siman desde la Cuscatlán con "Pago de servicio") baja la deuda de
`cuentaId` y sube la de `desdeId`. No cuenta como gasto. Los movimientos repetidos (misma tarjeta, tipo y monto con un
día de margen) se descartan al llegar (`esDuplicado`).
- Importar estados de cuenta en PDF (se necesita un ejemplo de cada banco).
- Clasificar con IA los comercios desconocidos (opcional).
- Recordatorios de pago fuera de la app (por ejemplo, un correo diario desde el mismo script).

## Estás por terminar (Inicio)
- Elegida la opción 2 de 3 (15 nov 2026): sección "Estás por terminar" en el Inicio, después de "Lo que viene".
- Muestra lo que se termina de pagar en los próximos 12 meses (cuotas, préstamo, pagos fijos con fecha de fin),
  cada uno con sus cuotas en puntos (barra si son más de 24), cuánto se libera al mes y en qué mes es la última.
- Abajo: "Desde {mes} pagarás al mes $X" contra lo que pagas hoy. Si nada termina en 12 meses, la sección no aparece.
- Lógica en `porTerminar` (js/domain/habitos.js); "Detalle" lleva a Más > Cuándo termino de pagar.

## Suscripciones compartidas
- "La pago con otros" (Más > Suscripciones): entre cuántas personas, o el monto exacto de tu parte.
  Se guarda en ajustes.suscripciones[clave] = { entre, miParte }. Suscripciones, Inicio y "Cuándo termino de pagar"
  cuentan solo tu parte; la deuda de la tarjeta sigue con el cobro completo.
- Las claves de comercio no llevan puntos (Firebase no acepta . # $ [ ] / en nombres de campo).
- Compras en cuotas compartidas: plan.entre (2 = a mitad). "Estás por terminar" y "Cuándo termino de pagar" cuentan
  cuota / entre; la tarjeta, su pago y "Puedes gastar" siguen con la cuota completa (es lo que cobra el banco).

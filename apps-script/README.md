# Configurar la nube y la lectura de Gmail

Se hace una sola vez y toma unos 20 minutos. Necesitas una computadora (en el teléfono es incómodo).

## 1. Publicar la app (GitHub Pages)

1. En GitHub, en el repositorio `moneymoney`: **Settings → Pages**.
2. En "Branch" elige `main` y la carpeta `/ (root)`, y guarda.
3. En un par de minutos la app queda en `https://alexgf004-maker.github.io/moneymoney/`.
4. Ábrela en Chrome en tu Android → menú ⋮ → **Agregar a pantalla principal**.

## 2. Crear el proyecto de Firebase

1. Entra a <https://console.firebase.google.com> con **la misma cuenta de Gmail donde te llegan las alertas del banco**.
2. **Crear un proyecto** → nombre `moneymoney` (Google Analytics no hace falta).
3. **Compilación → Realtime Database → Crear base de datos** → ubicación `us-central1` → "Comenzar en modo bloqueado".
4. En la pestaña **Reglas** pega el contenido de `database.rules.json` (de este repositorio) y **Publica**.
5. **Compilación → Authentication → Comenzar → Google** → actívalo y guarda.
6. En **Authentication → Configuración → Dominios autorizados** agrega `alexgf004-maker.github.io`.
7. **Configuración del proyecto (⚙️) → Tus apps → Web (</>)** → registra la app con el nombre `moneymoney` (sin Hosting).
   Copia el objeto `firebaseConfig` que aparece.
8. Pásale ese objeto a Claude, o pégalo tú en `js/config.js` en lugar de `null`:
   ```js
   export const FIREBASE = { apiKey: "...", authDomain: "...", databaseURL: "...", projectId: "...", appId: "..." };
   ```
   No es secreto: la información la protegen las reglas, que solo te dejan entrar a ti.
9. Abre la app → **Más → Conexión con Gmail → Entrar con Google**. Si ya tenías datos en el teléfono, se suben solos.
   Copia el **UID** que aparece ahí.

## 3. Instalar el script de Gmail

1. Entra a <https://script.google.com> con la misma cuenta → **Proyecto nuevo** → nómbralo `MoneyMoney Gmail`.
2. Borra lo que trae `Código.gs` y pega el contenido de `apps-script/Codigo.gs`.
3. Agrega un archivo (＋ → Secuencia de comandos) llamado `Lector` y pega `apps-script/Lector.gs`.
4. **Configuración del proyecto (⚙️)**:
   - Marca "Mostrar el archivo de manifiesto appsscript.json en el editor".
   - En **Propiedades de la secuencia de comandos** agrega:
     - `FIREBASE_URL` → la `databaseURL` de tu config (ej. `https://moneymoney-xxxx-default-rtdb.firebaseio.com`)
     - `UID` → el que copiaste de la app
5. Vuelve al editor, abre `appsscript.json` y reemplaza su contenido por el de `apps-script/appsscript.json`.
6. Arriba elige la función **`probar`** y pulsa **Ejecutar**. Google pedirá permisos: acepta. Como el script es tuyo,
   aparece "Google no verificó esta app" → **Configuración avanzada → Ir a MoneyMoney Gmail**.
   En **Registro de ejecución** verás qué leyó de tus últimos correos del banco (no envía nada todavía).
7. Elige **`instalar`** y pulsa **Ejecutar**. Desde ahora revisa tu correo cada 5 minutos.

Los correos que ya leyó quedan con la etiqueta **MoneyMoney** en Gmail. Si un correo del banco no se entiende,
aparece en la app en **Más → Correos del banco sin leer**.

## ¿Qué permisos tiene el script?

- **Gmail**: leer los correos de los bancos y ponerles la etiqueta. Solo busca remitentes de los bancos (lista en `Lector.gs`).
- **Conectarse a otros servicios**: solo para escribir en tu Firebase.
- Corre en tu cuenta de Google, y nadie más tiene acceso a él ni a tus correos.

## Agregar o corregir un banco

En `Lector.gs`, cada banco tiene su lista de `remitentes` (el dominio del correo). Si un banco te escribe desde
otro dominio, agrégalo ahí y vuelve a pegar el archivo en Apps Script. Para formatos especiales, a un banco se le
puede agregar una función `leer(texto)` propia.

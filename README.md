# miClub WhatsApp CRM

Herramienta interna para gestión de cobranzas y preparación manual de mensajes por WhatsApp para miClub.

## Stack
- Node.js + TypeScript
- Express (API)
- React + Vite (Web)
- SQLite (historial local)
- Monorepo con workspaces npm

## Instalación
```bash
npm install
cp .env.example .env
```

## Variables de entorno
```env
PORT=4000
SQLITE_DB_PATH=apps/api/data/miclub.sqlite
VITE_API_URL=http://localhost:4000
GOOGLE_SHEETS_ENABLED=false
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:AY500
GOOGLE_SHEETS_SALON_RANGE=SALON!AB34:AY500
GOOGLE_SHEETS_AULA_RANGE=AULA!AB34:AY500

```

## Integración Google Sheets (Fase 1)
La API puede leer miembros reales de las hojas `FITNESS`, `SALON` y `AULA`.

### 1) Habilitar Google Sheets API
1. Ir a Google Cloud Console y crear/seleccionar un proyecto.
2. Activar **Google Sheets API** para el proyecto.
3. Crear una **Service Account**.
4. Generar una clave JSON para esa Service Account.

### 2) Configurar credenciales en `.env`
- `GOOGLE_SHEETS_ENABLED=true`
- `GOOGLE_SHEET_ID=<ID de la planilla>`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email del JSON>`
- `GOOGLE_PRIVATE_KEY=<private_key del JSON, conservando saltos de línea con \n>`
- `GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:AY500`
- `GOOGLE_SHEETS_SALON_RANGE=SALON!AB34:AY500`
- `GOOGLE_SHEETS_AULA_RANGE=AULA!AB34:AY500`

### 3) Compartir la planilla con la Service Account
En Google Sheets, compartir la planilla con el email de la service account (permiso de lectura).

### 4) Fallback automático a mock
- Si `GOOGLE_SHEETS_ENABLED=false`: usa datos mock.
- Si faltan credenciales: usa mock y registra warning.
- Si falla Google Sheets: usa mock y no rompe la API.

### 5) Volver manualmente a modo mock
Configurar:
```env
GOOGLE_SHEETS_ENABLED=false
```

### 6) Rangos financieros globales
La primera integración global de datos operativos usa estos rangos y celdas:
- Movimientos: `ADMINISTRACIÓN!B12:AB3000` (encabezados en fila 12, datos desde fila 13).
- Saldos líquidos: `ADMINISTRACIÓN!AD12:AG14` (`AD12` liquidez, `AG12` caja, `AG13` banco, `AG14` dólares).
- Saldos a pagar/liquidar por sector: `FITNESS!X3`, `SALON!X3`, `AULA!X3`, `LOCAL 1!X3`, `CANTINA!X3`.

La app calcula ingresos/egresos pendientes, saldo pendiente neto, saldos a pagar, saldo proyectado e ingresos/egresos por sector y categoría.


## Envío manual por WhatsApp Web
La aplicación trabaja únicamente con datos reales y genera enlaces `wa.me` con el teléfono normalizado de cada miembro.

Flujo recomendado:
1. Seleccionar deudores y plantilla.
2. Revisar el panel de confirmación (cantidad, clientes, actividad, cuota y mensaje ejemplo).
3. Si se preparan varios mensajes, revisar el lote antes de abrir WhatsApp.
4. Abrir WhatsApp Business Web manualmente desde cada enlace.
5. Enviar manualmente y luego marcar estado (`opened`, `sent_manual` o `skipped`).

La app no automatiza envíos: cada mensaje se confirma y envía manualmente desde WhatsApp Web.

## Desarrollo
```bash
npm run dev
```
Esto inicia:
- API: http://localhost:4000
- Web: http://localhost:5173

## Scripts útiles
```bash
npm run typecheck
npm run build
npm run dev
npm run test -w @miclub/api
```

## Endpoints principales
- `GET /admin-movements`: movimientos parseados desde `ADMINISTRACIÓN!B12:AB3000`.
- `GET /club-finance-summary`: primera integración global de datos operativos/financieros desde `ADMINISTRACIÓN` y celdas sectoriales `X3`; alimenta las tarjetas financieras de INICIO.
- `GET /club-finance-debug`: diagnóstico financiero con conteos por tipo, estado, sector, categoría, celdas de liquidez y saldos sectoriales.
- `GET /members-debug`: miembros sin filtrar por estado (Google Sheets o mock, con fallback).
- `GET /debtors`: deudores filtrados por estado normalizado `Adeudando` (Google Sheets o mock, con fallback).
- `GET /sync-status`: estado de sincronización `{ source, enabled, sheets, lastSyncAt?, error? }`.
- `GET /templates`
- `GET /history`
- `POST /prepare-messages`

## Política WhatsApp
En Fase 1 no se automatiza el envío ni se manipula WhatsApp Web: el usuario confirma manualmente cada mensaje.

## Uso local en producción

1. Instalar dependencias:
```bash
npm install
```

2. Configurar variables de entorno en la raíz del repo:
- Ubicación: `./.env`
- Tomar como base `./.env.example`
- **No subir `.env` a GitHub** (mantenerlo fuera de control de versiones).

3. Compilar backend + frontend:
```bash
npm run build
```

4. Iniciar en modo producción local:
```bash
npm run start
```

5. Abrir la app en:
- `http://localhost:4000`

6. Si en el navegador aparece el error `Frontend no compilado. Ejecutá npm run build.`, volver a compilar:
```bash
npm run build
```

Notas:
- El backend busca `.env` en la **raíz del proyecto** (`miclub-whatsapp-crm/.env`).
- En producción local, el servidor sirve el frontend compilado desde `apps/web/dist`.

### Inicio rápido en Windows (sin VS Code)
En la carpeta `scripts/` se incluyen:
- `build-prod.bat`: compila todo el monorepo.
- `start-prod.bat`: abre el navegador en `http://localhost:4000` y levanta el servidor.
- `start-miclub-crm.bat`: compila + inicia en una sola acción (`npm run start:prod`).

Para crear un acceso directo:
1. Ir a `scripts/start-miclub-crm.bat`.
2. Clic derecho → **Crear acceso directo**.
3. Mover el acceso directo al Escritorio.
4. Ejecutar el acceso directo para iniciar la app local.

## Acceso remoto y autenticación

Antes de publicar miClub Gestión con Cloudflare Tunnel, activá el login local con cookie `httpOnly` desde variables de entorno. No se usa base de datos de usuarios ni servicios externos.

Variables disponibles en `.env`:

- `AUTH_ENABLED`: usá `false` para mantener el acceso directo local de siempre. Usá `true` para exigir login en toda la aplicación.
- `AUTH_USER`: usuario local permitido cuando `AUTH_ENABLED=true`.
- `AUTH_PASSWORD`: contraseña local permitida cuando `AUTH_ENABLED=true`. Evitá contraseñas simples o reutilizadas.
- `SESSION_SECRET`: secreto largo y aleatorio para firmar la cookie de sesión. Es obligatorio si `AUTH_ENABLED=true`.
- `PUBLIC_APP_URL`: URL pública de la app; por ejemplo, la URL `https://...` del Cloudflare Tunnel. Ayuda a configurar cookies seguras detrás de HTTPS.

Ejemplo para probar localmente:

```env
AUTH_ENABLED=true
AUTH_USER=admin
AUTH_PASSWORD=una-clave-larga-y-unica
SESSION_SECRET=un-secreto-largo-aleatorio-de-al-menos-32-caracteres
PUBLIC_APP_URL=http://localhost:4000
```

Luego ejecutá:

```bash
npm run build
npm run start
```

Abrí `http://localhost:4000`. Con `AUTH_ENABLED=true` debe aparecer la pantalla de login; con credenciales correctas se ingresa al panel y el botón **Cerrar sesión** vuelve al login. Con `AUTH_ENABLED=false`, la app entra directamente como antes.

Recomendaciones para acceso remoto:

- Activá `AUTH_ENABLED=true` antes de exponer la app con Cloudflare Tunnel.
- Usá una contraseña fuerte y un `SESSION_SECRET` largo, único y privado.
- No compartas ni subas el archivo `.env` real.
- Si usás una URL HTTPS del túnel, configurá `PUBLIC_APP_URL` con esa URL pública.

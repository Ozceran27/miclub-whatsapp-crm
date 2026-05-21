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
GOOGLE_SHEETS_RANGE_START=33
GOOGLE_SHEETS_RANGE_END=500
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
- `GOOGLE_SHEETS_RANGE_START=33`
- `GOOGLE_SHEETS_RANGE_END=500`

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
- `GET /debtors`: deudores (Google Sheets o mock, con fallback).
- `GET /sync-status`: estado de sincronización `{ source, enabled, sheets, lastSyncAt?, error? }`.
- `GET /templates`
- `GET /history`
- `POST /prepare-messages`

## Política WhatsApp
En Fase 1 no se automatiza el envío ni se manipula WhatsApp Web: el usuario confirma manualmente cada mensaje.

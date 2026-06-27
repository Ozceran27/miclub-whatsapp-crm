# Guía de migración Google Sheets → PostgreSQL

Esta guía describe cómo importar los datos operativos de Google Sheets a PostgreSQL, validar el resultado y operar un rollback seguro si el corte no cumple los controles esperados.

## 1. Prerrequisitos

### Google Cloud y Google Sheets

1. Tener un proyecto de Google Cloud con **Google Sheets API** habilitada.
2. Crear o reutilizar una **Service Account** dedicada para la importación.
3. Generar una clave JSON para la Service Account y conservar estos campos:
   - `client_email`, usado como `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
   - `private_key`, usado como `GOOGLE_PRIVATE_KEY`.
4. Compartir la planilla de Google Sheets con el email de la Service Account, al menos con permiso de lectura.
5. Confirmar el ID de la planilla: es el valor ubicado entre `/d/` y `/edit` en la URL de Google Sheets.

### PostgreSQL

1. Tener PostgreSQL accesible desde el entorno donde corre la API o el importador.
2. Crear la base de datos y el usuario de aplicación con permisos para crear/actualizar objetos del schema de importación.
3. Aplicar la migración versionada antes de ejecutar el importador:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/api/db/migrations/202606260001_create_miclub_import_schema.sql
```

Si no se usa `DATABASE_URL`, ejecutar `psql` con las mismas variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` configuradas para la API.

## 2. Variables `.env` requeridas

Configurar estas variables en `./.env` durante la ventana de importación:

```env
# PostgreSQL: usar DATABASE_URL o variables PG* equivalentes
DATABASE_URL=postgres://miclub_app:password@localhost:5432/miclub_gestion
# PGHOST=localhost
# PGPORT=5432
# PGDATABASE=miclub_gestion
# PGUSER=miclub_app
# PGPASSWORD=password
PGSSL=false

# Google Sheets
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_IMPORT_ENABLED=true
GOOGLE_SHEET_ID=<id-de-la-planilla>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email-del-json>
GOOGLE_PRIVATE_KEY=<private_key-del-json-con-\\n>

# Endpoints operativos de importación
IMPORT_ENDPOINTS_ENABLED=false
```

Notas operativas:

- `DATABASE_URL` tiene prioridad práctica para clientes PostgreSQL estándar; si no se usa, configurar `PGHOST`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` junto con `PGPORT` si no es `5432`.
- `PGSSL=false` sirve para PostgreSQL local o redes privadas sin TLS. Usar `PGSSL=true` si el proveedor exige SSL.
- `GOOGLE_SHEETS_ENABLED=true` habilita lectura de Google Sheets.
- `GOOGLE_SHEETS_IMPORT_ENABLED=true` debe estar activo para permitir el importador de Sheets a PostgreSQL.
- `IMPORT_ENDPOINTS_ENABLED=true` solo debe usarse durante ventanas controladas si se invoca la importación por HTTP. Mantenerlo en `false` para uso normal de producción.

## 3. Rangos leídos por defecto y sobrescritura

El importador lee por defecto estos rangos de miembros/deudas:

| Sector | Variable para sobrescribir | Rango por defecto |
| --- | --- | --- |
| Fitness | `GOOGLE_SHEETS_FITNESS_RANGE` | `FITNESS!AB20:AY800` |
| Salón | `GOOGLE_SHEETS_SALON_RANGE` | `SALON!AB34:AY800` |
| Aula | `GOOGLE_SHEETS_AULA_RANGE` | `AULA!AB34:AY800` |

También existen rangos operativos complementarios usados por la integración de Google Sheets:

| Dato | Variable para sobrescribir | Rango por defecto |
| --- | --- | --- |
| Movimientos Fitness | `GOOGLE_SHEETS_FITNESS_MOVEMENTS_RANGE` | `FITNESS!B20:AB800` |
| Movimientos Salón | `GOOGLE_SHEETS_SALON_MOVEMENTS_RANGE` | `SALON!B34:AB800` |
| Movimientos Aula | `GOOGLE_SHEETS_AULA_MOVEMENTS_RANGE` | `AULA!B34:AB800` |
| Movimientos administración | `GOOGLE_SHEETS_ADMIN_MOVEMENTS_RANGE` | `ADMINISTRACIÓN!B12:AB3000` |
| Saldos administración | `GOOGLE_SHEETS_ADMIN_BALANCES_RANGE` | `ADMINISTRACIÓN!AD12:AG14` |

Para sobrescribir cualquier rango, agregar la variable correspondiente al `.env`, por ejemplo:

```env
GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:AY1200
GOOGLE_SHEETS_ADMIN_MOVEMENTS_RANGE=ADMINISTRACIÓN!B12:AB5000
```

## 4. Importación por CLI

### Dry-run

Ejecutar primero un dry-run. Este modo valida lectura, parsing y escritura simulada sin persistir cambios definitivos:

```bash
npm run import:sheets:dry
```

### Importación real

Después de revisar el resumen del dry-run y confirmar que no hay errores bloqueantes, ejecutar:

```bash
npm run import:sheets
```

### Uso con `--batch-size`

El importador acepta `--batch-size` para controlar el tamaño de los lotes procesados. El valor debe ser un entero positivo; si se omite, usa `50`.

Ejemplos:

```bash
npm run import:sheets:dry -- --batch-size=25
npm run import:sheets -- --batch-size 100
```

Usar lotes más chicos ayuda a diagnosticar errores y reducir el impacto de una ventana de importación; lotes más grandes pueden acelerar una carga ya validada.

## 5. Endpoints HTTP de importación

Los endpoints están montados bajo `/api/import` y responden `404` si `IMPORT_ENDPOINTS_ENABLED` no está en `true`.

### `POST /api/import/google-sheets`

Dispara la importación desde Google Sheets.

Body recomendado para dry-run:

```json
{
  "dryRun": true,
  "batchSize": 50
}
```

Body para ejecución real:

```json
{
  "dryRun": false,
  "batchSize": 50
}
```

### `GET /api/import/batches`

Lista batches de importación registrados. Acepta paginación por query string:

```text
/api/import/batches?limit=50&offset=0
```

### `GET /api/import/batches/:id/errors`

Lista errores asociados a un batch específico. También acepta `limit` y `offset`:

```text
/api/import/batches/<batch-id>/errors?limit=50&offset=0
```

## 6. Validaciones posteriores al corte

1. Cambiar la fuente operativa a PostgreSQL:

```env
DATA_SOURCE=postgres
POSTGRES_ENABLED=true
```

2. Reiniciar la API para que tome el nuevo `.env`.
3. Validar health y endpoints productivos principales:
   - `GET /api/db/health`
   - `GET /summary`
   - `GET /members-debug`
   - `GET /debtors`
   - `GET /admin-movements`
   - `GET /club-finance-summary`
4. Mantener Google Sheets disponible temporalmente y comparar legacy contra PostgreSQL con los endpoints de comparación:
   - `GET /comparison-debug`
   - `GET /comparison-debug/summary`
   - `GET /comparison-debug/members`
5. Registrar diferencias, tolerancias aceptadas, fecha/hora, responsable y resultado de cada endpoint antes de considerar estable el corte.

## 7. Rollback operativo

Si la importación real o la validación con `DATA_SOURCE=postgres` falla:

1. Volver la fuente operativa a legacy:

```env
DATA_SOURCE=legacy
```

2. Reiniciar la API.
3. Confirmar que los endpoints productivos vuelven a responder desde Google Sheets/mocks según la configuración legacy.
4. Revisar batches y errores para identificar el problema:
   - `GET /api/import/batches`
   - `GET /api/import/batches/:id/errors`
5. Corregir credenciales, rangos, datos fuente o esquema PostgreSQL según corresponda.
6. Repetir `npm run import:sheets:dry` antes de intentar una nueva importación real.
7. No borrar ni deshabilitar Google Sheets hasta que `DATA_SOURCE=postgres` haya cumplido el período de estabilidad definido en el runbook de corte.

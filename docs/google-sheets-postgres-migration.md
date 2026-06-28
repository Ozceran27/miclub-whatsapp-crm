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

# Inscripciones google_sheets ausentes en import real: warn | noop | abandon | inactive
GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY=warn
```

Notas operativas:

- `DATABASE_URL` tiene prioridad práctica para clientes PostgreSQL estándar; si no se usa, configurar `PGHOST`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` junto con `PGPORT` si no es `5432`.
- `PGSSL=false` sirve para PostgreSQL local o redes privadas sin TLS. Usar `PGSSL=true` si el proveedor exige SSL.
- `GOOGLE_SHEETS_ENABLED=true` habilita lectura de Google Sheets.
- `GOOGLE_SHEETS_IMPORT_ENABLED=true` debe estar activo para permitir el importador de Sheets a PostgreSQL.
- `IMPORT_ENDPOINTS_ENABLED=true` solo debe usarse durante ventanas controladas si se invoca la importación por HTTP. Mantenerlo en `false` para uso normal de producción.
- `GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY` define qué hacer, solo en importaciones reales, con inscripciones de `miclub.enrollments` cuyo `source='google_sheets'` y cuyo `external_id` ya no aparece en la planilla importada. La decisión operativa inicial es `warn`: no modifica esas inscripciones y deja la advertencia en el resumen/notas del batch para revisión manual.

## 3. Rangos leídos por defecto y sobrescritura

El importador separa los rangos de **inscriptos** y **movimientos**. En ambos casos los headers se leen con rangos propios para resolver columnas por nombre y no depender de índices fijos.

### Inscriptos

| Sector | Header range | Data range | Nota |
| --- | --- | --- | --- |
| Fitness | `GOOGLE_SHEETS_FITNESS_MEMBERS_HEADER_RANGE=FITNESS!AB19:BA19` | `GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:BA1500` | Confirmar si el layout vigente termina en `BA` o si debe ampliarse a `BB`: `FITNESS!AB19:BB19` y `FITNESS!AB20:BB1500`. |
| Salón | `GOOGLE_SHEETS_SALON_MEMBERS_HEADER_RANGE=SALON!AB33:BB33` | `GOOGLE_SHEETS_SALON_RANGE=SALON!AB34:BB1500` | Layout sectorial con `Estado Finan.`. |
| Aula | `GOOGLE_SHEETS_AULA_MEMBERS_HEADER_RANGE=AULA!AB33:BB33` | `GOOGLE_SHEETS_AULA_RANGE=AULA!AB34:BB1500` | Layout sectorial con `Estado Finan.`. |

El importador reconoce los headers reales `Id.`, `Fecha`, `Nombre`, `Apellido`, `D.N.I.`, `Tel.`, `Actividad`, `Modalidad`, `Cuota`, `Estado`, `Instructor` y `Vence`. Esto permite tomar `Vence` desde `BA` en Fitness, o desde `BB` si Operaciones confirma la ampliación, y desde `BB` en Salón/Aula para completar `miclub.enrollments.due_date`.

### Movimientos

| Hoja | Header range | Data range | Nota |
| --- | --- | --- | --- |
| Fitness | `GOOGLE_SHEETS_FITNESS_MOVEMENTS_HEADER_RANGE=FITNESS!B19:Y19` | `GOOGLE_SHEETS_FITNESS_MOVEMENTS_RANGE=FITNESS!B20:Y1500` | Hoja sectorial: tiene `Estado Finan.` y no tiene `Sector`. |
| Salón | `GOOGLE_SHEETS_SALON_MOVEMENTS_HEADER_RANGE=SALON!B33:Y33` | `GOOGLE_SHEETS_SALON_MOVEMENTS_RANGE=SALON!B34:Y1500` | Hoja sectorial: tiene `Estado Finan.` y no tiene `Sector`. |
| Aula | `GOOGLE_SHEETS_AULA_MOVEMENTS_HEADER_RANGE=AULA!B33:Y33` | `GOOGLE_SHEETS_AULA_MOVEMENTS_RANGE=AULA!B34:Y1500` | Hoja sectorial: tiene `Estado Finan.` y no tiene `Sector`. |
| Administración | `GOOGLE_SHEETS_ADMIN_MOVEMENTS_HEADER_RANGE=ADMINISTRACIÓN!B12:AB12` | `GOOGLE_SHEETS_ADMIN_MOVEMENTS_RANGE=ADMINISTRACIÓN!B13:AB3000` | Hoja administrativa: tiene `Sector` y no tiene `Estado Finan.`. |
| Local 1 | Pendiente de confirmación | Pendiente de confirmación | Agregar `GOOGLE_SHEETS_LOCAL_1_MOVEMENTS_HEADER_RANGE` y `GOOGLE_SHEETS_LOCAL_1_MOVEMENTS_RANGE` cuando Operaciones confirme la fila de header vigente. |

La diferencia de layout es intencional: `ADMINISTRACIÓN` centraliza movimientos de múltiples sectores, por eso incluye la columna `Sector` y no incluye `Estado Finan.`; las hojas sectoriales (`FITNESS`, `SALON`, `AULA` y, si aplica, `LOCAL 1`) ya representan un sector específico, por eso incluyen `Estado Finan.` y no necesitan columna `Sector`.

Los movimientos con `Monto` igual a `0` son válidos. No deben descartarse solo por el importe: se importan cuando la fila contiene información operativa suficiente, por ejemplo fecha, tipo/categoría, concepto, contraparte, medio de pago, estado financiero u otros datos que permitan auditar el movimiento.

Para sobrescribir cualquier rango, agregar la variable correspondiente al `.env`, por ejemplo:

```env
GOOGLE_SHEETS_FITNESS_MEMBERS_HEADER_RANGE=FITNESS!AB19:BA19
GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:BA1500
# Si se confirma Fitness hasta BB:
# GOOGLE_SHEETS_FITNESS_MEMBERS_HEADER_RANGE=FITNESS!AB19:BB19
# GOOGLE_SHEETS_FITNESS_RANGE=FITNESS!AB20:BB1500
GOOGLE_SHEETS_ADMIN_MOVEMENTS_HEADER_RANGE=ADMINISTRACIÓN!B12:AB12
GOOGLE_SHEETS_ADMIN_MOVEMENTS_RANGE=ADMINISTRACIÓN!B13:AB3000
```

### Decisión sobre inicio de movimientos de administración

El rango de movimientos de administración separa headers y datos: los encabezados se leen desde `ADMINISTRACIÓN!B12:AB12` y la primera fila importable desde `ADMINISTRACIÓN!B13:AB3000`. En el modelo real `apps/api/data/db/Dashboard CLUB Actualizado.xlsx`, la fila 12 contiene los encabezados (`Id.`, `Fecha`, `Tipo`, `Categoría`, `Concepto`, `Contra-parte`, `Sector`, `Monto`, etc.) y la primera fila de datos está en `B13:AB13` (`I-0785`, fecha serial `46196.79794715278`, tipo `INGRESOS`).


### Decisión sobre inicio de movimientos de LOCAL 1

`LOCAL 1` se trata como hoja de movimientos, no como hoja de inscriptos. Sus rangos quedan pendientes hasta confirmar con Operaciones la fila de header vigente. Cuando se confirme, documentar ambos valores explícitamente:

```env
GOOGLE_SHEETS_LOCAL_1_MOVEMENTS_HEADER_RANGE='LOCAL 1'!B<fila_header>:<columna_final><fila_header>
GOOGLE_SHEETS_LOCAL_1_MOVEMENTS_RANGE='LOCAL 1'!B<primera_fila_datos>:<columna_final>3000
```

El layout esperado de `LOCAL 1` es sectorial: no tiene columna `Sector`, sí tiene `Estado Finan.`, y el importador debe usar `LOCAL 1` como sector por defecto para esos movimientos.

## 4. Importación por CLI

### Dry-run

Ejecutar primero un dry-run. Este modo valida lectura, parsing y escritura simulada sin persistir cambios definitivos:

```bash
npm run import:sheets:dry
```

Además de confirmar `errors === 0`, revisar explícitamente en el resumen, logs o consultas de auditoría del batch:

- La cantidad de movimientos con `Monto` igual a `0`: deben aparecer como importables si tienen información operativa suficiente y cualquier pico inesperado debe validarse contra la planilla.
- Las columnas resueltas por fallback: si el importador avisa que usó fallback columns, verificar que los headers reales sigan coincidiendo con el layout documentado antes de ejecutar la importación real.
- Las inscripciones con `due_date`: confirmar que `Vence` se está leyendo desde el rango correcto (`BA`/`BB` según sector y confirmación de Fitness) y que el conteo de inscripciones con vencimiento no cae inesperadamente.

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
npm run import:sheets -- --missing-enrollment-strategy=warn
```

Usar lotes más chicos ayuda a diagnosticar errores y reducir el impacto de una ventana de importación; lotes más grandes pueden acelerar una carga ya validada.

### Resumen de salida

El resumen diferencia filas leídas, entidades procesadas e intentos de escritura. Los contadores `*Processed` indican entidades que el importador pudo preparar/procesar; `attemptedWrites` cuenta escrituras SQL intentadas exitosamente antes de cerrar cada lote. En `dryRun`, todos los lotes se revierten, por lo que `persistedWrites` debe quedar en `0` y `rolledBackWrites` debe reflejar las escrituras simuladas revertidas. En una importación real, `persistedWrites` refleja lo confirmado por `commit`; si la estrategia de ausentes aplica una actualización posterior, esa actualización también suma como escritura persistida.

Ejemplo de salida de dry-run:

```json
{
  "batchId": "00000000-0000-0000-0000-000000000000",
  "dryRun": true,
  "read": 120,
  "attemptedWrites": 420,
  "persistedWrites": 0,
  "rolledBackWrites": 420,
  "sectorsProcessed": 80,
  "movementCategoriesProcessed": 40,
  "peopleProcessed": 70,
  "instructorsProcessed": 70,
  "activitiesProcessed": 70,
  "enrollmentsProcessed": 70,
  "movementsProcessed": 40,
  "missingEnrollments": 0,
  "missingEnrollmentsAction": "warn",
  "errors": 0,
  "warnings": []
}
```

Ejemplo de salida de importación real:

```json
{
  "batchId": "00000000-0000-0000-0000-000000000001",
  "dryRun": false,
  "read": 120,
  "attemptedWrites": 421,
  "persistedWrites": 421,
  "rolledBackWrites": 0,
  "sectorsProcessed": 80,
  "movementCategoriesProcessed": 40,
  "peopleProcessed": 70,
  "instructorsProcessed": 70,
  "activitiesProcessed": 70,
  "enrollmentsProcessed": 70,
  "movementsProcessed": 40,
  "missingEnrollments": 3,
  "missingEnrollmentsAction": "abandon",
  "errors": 0,
  "warnings": [
    "3 inscripciones google_sheets no aparecieron en el último import."
  ]
}
```

## 5. Estrategia para inscripciones ausentes en Google Sheets

En cada importación real, el importador guarda en memoria los `external_id` de las inscripciones procesadas desde filas de miembros. Al terminar todos los lotes correctamente, compara ese conjunto contra `miclub.enrollments where source='google_sheets'`. Esta reconciliación no se ejecuta en `dryRun`, porque el dry-run debe limitarse a validar y revertir escrituras simuladas.

La estrategia se configura con `GOOGLE_SHEETS_MISSING_ENROLLMENT_STRATEGY`, con el flag CLI `--missing-enrollment-strategy` o con el campo HTTP `missingEnrollmentStrategy`. Valores aceptados:

| Valor | Comportamiento |
| --- | --- |
| `warn` | Decisión recomendada/inicial. No modifica inscripciones; registra en el resumen/notas del batch cuántas inscripciones `google_sheets` no aparecieron en el último import. |
| `noop` | No hace cambios. El resumen conserva el conteo de ausentes, pero la operación queda explícitamente en modo no-op. |
| `abandon` / `abandonado` | Actualiza las ausentes a `status='abandonado'`. Usar solo si la planilla es la fuente autoritativa de bajas. |
| `inactive` | Si existe la columna `miclub.enrollments.inactive`, actualiza las ausentes con `inactive=true`; si no existe, no modifica filas y agrega una advertencia al batch. |

Decisión documentada para el corte: mantener `warn` hasta que Operaciones confirme que la ausencia en Sheets equivale a baja definitiva. Luego se puede pasar a `abandon` si el modelo vigente usa `status`, o a `inactive` únicamente en despliegues que agreguen esa columna.

## 6. Endpoints HTTP de importación

Los endpoints están montados bajo `/api/import` y responden `404` si `IMPORT_ENDPOINTS_ENABLED` no está en `true`.

> **Ventana controlada:** el panel temporal de migración de la app web también depende de estos endpoints. Activar `IMPORT_ENDPOINTS_ENABLED=true` solo durante la ventana operativa, con acceso interno/autenticado, y volver a `false` apenas termine la validación o el rollback.

### Panel temporal web

La navegación administrativa de la app web incluye el módulo **MIGRACIÓN** (`apps/web/src/modules/DataMigrationModule.tsx`) para operar la carga de forma controlada. El panel permite:

- Ver el estado de `GET /api/db/health`, `GET /sync-status` y `GET /api/import/batches?limit=10`.
- Ejecutar un dry-run con `POST /api/import/google-sheets` y body `{ "dryRun": true, "batchSize": 50 }`.
- Revisar los contadores `read`, `errors`, `warnings`, `attemptedWrites`, `persistedWrites`, `rolledBackWrites`, `enrollmentsProcessed` y `movementsProcessed`.
- Consultar errores de batches recientes con `GET /api/import/batches/:id/errors`.
- Habilitar la importación real únicamente cuando el último dry-run de la sesión termina con `errors === 0`; antes de enviarla, el navegador pide confirmación explícita.

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
  "batchSize": 50,
  "missingEnrollmentStrategy": "warn"
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

## 7. Validaciones posteriores al corte

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

## 8. Rollback operativo

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

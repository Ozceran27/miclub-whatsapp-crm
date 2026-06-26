# Runbook de corte a PostgreSQL

Este documento define los controles operativos para retirar dependencias legacy (mocks, Google Sheets y SQLite) sin cortar endpoints productivos. Ninguna eliminación debe hacerse solo por disponibilidad técnica: primero debe existir evidencia de estabilidad, comparación de datos y backup.

## Estado objetivo de producción

- `POSTGRES_ENABLED=true` para habilitar conexiones y health checks de PostgreSQL.
- `DATA_SOURCE=postgres` para que los endpoints operativos usen repositorios PostgreSQL en lugar de legacy.
- `CRM_SOURCE=postgres` para que plantillas e historial CRM usen PostgreSQL en lugar de SQLite.
- `IMPORT_ENDPOINTS_ENABLED=false` salvo durante ventanas controladas de importación.
- `DEBUG_ENDPOINTS_ENABLED=false` salvo durante ventanas controladas de diagnóstico.

## Períodos de estabilidad acordados

Registrar antes del corte el período exacto que se considerará evidencia suficiente. Recomendación mínima:

| Control | Período mínimo sugerido | Evidencia requerida |
| --- | --- | --- |
| `DATA_SOURCE=postgres` | 5 días hábiles o un ciclo operativo completo | Health check PostgreSQL OK, endpoints principales sin errores nuevos, comparación legacy/postgres dentro de tolerancia acordada. |
| `CRM_SOURCE=postgres` | 5 días hábiles o un ciclo completo de cobranzas | Plantillas, preparación de mensajes, cambios de estado e historial funcionando sin pérdida de registros. |

Si el equipo acuerda un período distinto, documentarlo con fecha/hora de inicio, fecha/hora de fin, responsable y criterio de rollback.

## Validación previa al retiro de legacy

### 1. Confirmar `DATA_SOURCE=postgres`

1. Configurar producción con `POSTGRES_ENABLED=true` y `DATA_SOURCE=postgres`.
2. Confirmar `/api/db/health` con `ok=true` y sin warnings críticos.
3. Validar endpoints productivos principales:
   - `/summary`
   - `/members-debug`
   - `/debtors`
   - `/admin-movements`
   - `/club-finance-summary`
4. Comparar legacy contra PostgreSQL usando los endpoints de comparación disponibles antes de deshabilitar Google Sheets.
5. Dejar evidencia del período estable acordado: fechas, responsable, comandos usados y resultados.

### 2. Confirmar `CRM_SOURCE=postgres`

1. Ejecutar migración CRM primero en `dryRun` y luego en modo escritura durante una ventana controlada.
2. Configurar producción con `CRM_SOURCE=postgres` solo después de revisar el reporte de migración.
3. Comparar SQLite contra PostgreSQL para:
   - cantidad de plantillas,
   - cantidad de registros de historial,
   - estados (`prepared`, `opened`, `sent_manual`, `skipped`),
   - muestras recientes por `legacy_sqlite_id`.
4. Validar flujo completo en UI: listar plantillas, preparar mensajes, abrir enlaces manuales y actualizar estado.
5. Mantener SQLite congelado como respaldo hasta completar el período estable acordado.

### 3. Exportar backups finales

Antes de eliminar cualquier dependencia legacy, guardar backups verificables:

```bash
mkdir -p backups/final-cutover
cp apps/api/data/miclub.sqlite backups/final-cutover/miclub.sqlite
sqlite3 backups/final-cutover/miclub.sqlite ".backup 'backups/final-cutover/miclub.sqlite.backup'"
```

Para Google Sheets, exportar desde Drive/Sheets una copia final en formato `.xlsx` y, si aplica, CSV por pestaña (`FITNESS`, `SALON`, `AULA`, `ADMINISTRACIÓN`). Registrar ubicación, fecha/hora y responsable del backup.

## Reglas de eliminación

### Mocks

Eliminar referencias a mocks solo cuando se confirme que ningún endpoint productivo los usa como fallback. Antes de borrar código:

- `DATA_SOURCE=postgres` debe estar estable durante el período acordado.
- `GOOGLE_SHEETS_ENABLED=false` no debe activar respuestas `source=mock` en endpoints productivos.
- No debe haber pantallas productivas que dependan de `syncStatus.source === "mock"` para funcionar.

### Google Sheets

Eliminar Google Sheets solo cuando no exista ningún importador, endpoint productivo o comparación operativa que dependa de la planilla.

- Confirmar que los importadores ya no se usan o fueron reemplazados por una fuente PostgreSQL controlada.
- Confirmar que `/summary`, `/members-debug`, `/debtors`, `/admin-movements` y `/club-finance-summary` responden desde PostgreSQL.
- Conservar backup final exportado antes de retirar variables `GOOGLE_*`.

### SQLite

Eliminar SQLite solo cuando CRM haya sido validado y respaldado.

- `CRM_SOURCE=postgres` debe estar estable durante el período acordado.
- El historial migrado debe coincidir con SQLite o tener diferencias documentadas y aprobadas.
- Debe existir backup final de `apps/api/data/miclub.sqlite`.
- No debe quedar ningún endpoint productivo leyendo o escribiendo `message_templates` o `message_history` en SQLite.

## Plantilla de acta de corte

```md
Fecha/hora de inicio:
Fecha/hora de fin:
Responsable:
POSTGRES_ENABLED:
DATA_SOURCE:
CRM_SOURCE:
Período de estabilidad acordado:
Resultado health check PostgreSQL:
Resultado comparación legacy/postgres:
Resultado comparación CRM SQLite/PostgreSQL:
Ubicación backup SQLite:
Ubicación backup Google Sheets:
Decisión sobre mocks:
Decisión sobre Google Sheets:
Decisión sobre SQLite:
Rollback probado/disponible:
Notas:
```

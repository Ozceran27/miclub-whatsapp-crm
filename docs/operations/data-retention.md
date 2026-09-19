# Política de retención, archivo y cancelación

## Comportamiento vigente confirmado (2026-07-28)

Antes de cambiar la política se verificó el comportamiento aprobado en código y
migraciones: finanzas sólo exponía lecturas (`GET /api/movements` y
`GET /api/payments`); las bajas de inscripciones faltantes estaban acotadas al
batch de Google Sheets y auditadas en una transacción; y `DELETE /templates/:id`
eliminaba físicamente plantillas no predeterminadas. La presente decisión conserva
los contratos HTTP necesarios, pero reemplaza las dos últimas escrituras por
archivo lógico. No se interpretó el `ON DELETE CASCADE` de claves foráneas como
permiso funcional de borrado.

## Clasificación por entidad

| Entidad | Política aprobada | Implementación / motivo |
| --- | --- | --- |
| Movimientos | **Nunca borrado físico** | Un error se corrige cancelando/anulando el movimiento o creando un contramovimiento. No hay API `DELETE` y un trigger rechaza `DELETE` aun desde SQL. |
| Pagos | **Nunca borrado físico** | Se cancela/reversa preservando pago y asignaciones. No hay API `DELETE` y un trigger rechaza `DELETE` aun desde SQL. |
| Inscripciones | **Archive/cancel** | Para faltantes de importación se completan `inactive_at`, `superseded_at`, estado `cancelado` y motivo. Se conserva `missing_from_import_batch_id`, además del origen y notas. Una reaparición puede reactivar la fila mediante el importador. |
| Usuarios | **Desactivar/revocar** | Se desactiva la membresía y se revocan sesiones. La fila global de usuario y el historial de auditoría se conservan. El borrado físico sólo corresponde a purga administrativa por obligación legal, fuera de la API operativa. |
| Actividades | **Desactivar/archive** | Se usa estado de actividad; no se elimina si tiene inscripciones, horarios, historial de cuotas o movimientos. Una actividad creada por error y nunca referenciada puede purgarse mediante mantenimiento auditado, no desde una API funcional. |
| Plantillas CRM | **Archive restaurable** | `DELETE /templates/:id` archiva una plantilla custom (`archived_at`, `archived_by`) en una transacción y registra before/after. Las predeterminadas no admiten esa operación. El reset restaura/desarchiva el conjunto predeterminado atómicamente. |

## Inscripciones ausentes de Google Sheets

La selección continúa validándose contra un `import_batches` finalizado, del mismo
club y con `source = google_sheets`. También debe coincidir con
`missing_from_import_batch_id`, evitando que una revisión vieja afecte una fila
reactivada. La acción:

1. bloquea las filas seleccionadas;
2. marca `inactive = true` y completa timestamps sólo si estaban vacíos;
3. fija `status = cancelado` y el motivo
   `missing_from_google_sheets_import`;
4. **no limpia** `missing_from_import_batch_id`, para preservar la metadata del
   batch que justificó la decisión;
5. escribe la auditoría en la misma transacción.

Aunque la ruta histórica contiene `delete-missing`, su semántica vigente es
archivo lógico. Se mantiene temporalmente para compatibilidad y debe renombrarse
en una versión de API coordinada con el frontend.

## Restauración de plantillas CRM

Las lecturas normales excluyen `archived_at IS NOT NULL`. Restaurar defaults se
ejecuta en una sola transacción: archiva la versión activa previa y hace upsert de
cada default limpiando `archived_at` y `archived_by`. Cualquier error revierte el
conjunto completo; no puede quedar una restauración parcial.

## Borrado físico excepcional

Sólo las tablas técnicas efímeras (sesiones expiradas, buckets de rate limit y
staging descartable) admiten purga periódica. Una purga legal de datos personales
requiere procedimiento separado, autorización explícita, evaluación de las
obligaciones contables y evento de auditoría; nunca debe borrar hechos financieros.

# Adaptación futura del importador (no implementada)

## Brechas

| Antes | Después requerido | Regla futura |
|---|---|---|
| sector textual | `sector_id` tenant-scoped | resolver catálogo del club autenticado; rechazo si 0/>1 |
| actividad textual | `activity_id` | código o clave compuesta exacta dentro del sector/club |
| profesor textual | `person_id` + `instructor_id`/relación activity | DNI/email/teléfono fuerte; nombre a revisión |
| club global/implícito | `club_id` autenticado | tomar TenantContext firmado, nunca request/body/default |
| comisión legacy | configuración de settlement de activity | importar sólo modalidad/valor con evidencia; si no, revisión |

## Cambios posteriores

El dry-run debe construir y exportar los cinco mapas, detectar conflictos
cross-tenant y calcular claves de idempotencia `(club_id, external_id)`. La fase
de persistencia debe usar esas FK resueltas, conservar el payload fuente, fallar
por fila ambigua y registrar batch/error con el mismo `club_id`. No debe revivir
fallbacks por hoja, nombre o legacy ID. Esta tarea no modifica el importador ni
ejecuta una importación.

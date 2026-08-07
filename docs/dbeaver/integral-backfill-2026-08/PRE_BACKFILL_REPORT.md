# Informe previo al backfill

## Evidencia disponible

El schema versionado usa `miclub.users` (identidad global), `miclub.people`
(perfil tenant-local), `miclub.clubs`, `miclub.user_club_memberships` (autorización
usuario/club/rol), `miclub.club_memberships` (persona/socio) y `miclub.roles`.
Los hechos principales son `enrollments` y `movements`; los catálogos son
`sectors`, `activities`, `movement_categories` y `payment_methods`.

No hubo conexión PostgreSQL disponible en el checkout y **no se ejecutó SQL**.
Por tanto, club, Fernando, membership, conteos de huérfanos, sectores legacy,
actividades, duplicados, instructores, empleados, inscripciones, movimientos,
aliases y batches quedan en estado `BLOCKER: PENDING_DATABASE_EVIDENCE`, no en
cero. `01_pre_backfill_diagnostic.sql` devuelve cada conteo y relación requerida.

## Manifiesto de decisiones

| Dominio | Problema | Cantidad | Clase | Estrategia |
|---|---|---:|---|---|
| identidad | cardinalidad miClub/Fernando/DIRECTOR | pendiente 01 | BLOCKER | exigir exactamente uno |
| tenant roots | `people.club_id` NULL | pendiente 01 | AUTO_FIX_SAFE condicionado | asignar sólo con único tenant probado |
| sectores | `club_id` NULL | pendiente 01 | AUTO_FIX_SAFE condicionado | asignar tenant; relaciones sólo por mapa explícito |
| personas | DNI/email/teléfono duplicado | pendiente 01 | MANUAL_REVIEW | no fusionar; DNI bloquea endurecimiento |
| instructores/empleados | tenant ausente | pendiente 01 | AUTO_FIX_SAFE condicionado | propagar desde `person_id` |
| actividades | tenant ausente | pendiente 01 | AUTO_FIX_SAFE condicionado | propagar desde sector; responsable/comisión no se inventan |
| inscripciones | tenant ausente | pendiente 01 | AUTO_FIX_SAFE condicionado | sólo si person y activity coinciden |
| movimientos | tenant ausente | pendiente 01 | AUTO_FIX_SAFE condicionado | único club probado; fingerprint inmutable |
| categorías/medios | referencia ausente | pendiente 01 | MANUAL_REVIEW | aliases explícitos revisados |
| imports | batch/error sin tenant | pendiente 01 | AUTO_FIX_SAFE condicionado | target y propagación padre-hijo |
| financiero | cualquier duplicado/cambio | pendiente 01 | FINANCIAL_IMMUTABLE/BLOCKER | abortar y restaurar backup |

No hay propuestas `SAFE_TO_DELETE`. Todo histórico con relaciones es
`ARCHIVE_INSTEAD`; identidades dudosas son `MANUAL_REVIEW`; movimientos, pagos y
liquidaciones son `FINANCIAL_IMMUTABLE`.

## Riesgos abiertos

* La arquitectura de tareas no contiene `sector_id`; se valida club y responsables,
  sin inventar una relación inexistente.
* `enrollments` deriva el sector de `activities.sector_id`; no se agrega una copia
  redundante ni se corrige una incompatibilidad silenciosamente.
* `activity_id` de movimientos permanece NULL salvo mapa futuro con evidencia fuerte.
* Las comisiones existentes se reportan y permanecen intactas. Cero no se transforma
  automáticamente en `UNDEFINED`, porque el enum/configuración actual no ofrece ese valor.
* `sectors.created_by`/`updated_by` son FK a `people`; `audit_log.user_id` es FK a
  `users`. Los scripts resuelven ambos actores por separado para no mezclar identidades.

# Checkpoint canónico post-admin

**Fecha de corte:** 2026-08-06  
**Estado:** implementación cerrada en código; despliegue sujeto al gate operativo de este documento.  
**Reemplaza para trabajo nuevo:** [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md), que se conserva como evidencia del baseline.

## Alcance entregado

El panel **Administración** ya ofrece resumen ejecutivo, capacidad, tendencias, rankings y consultas de sectores, actividades, trabajadores, movimientos e inscripciones. Los detalles de sector, actividad y trabajador son de sólo lectura. También están operativos la creación manual de movimientos e inscripciones y el alta, cambio de estado y archivo de tareas. Las solicitudes permiten consulta y decisión manual para tipos con handler seguro.

Las tarjetas de acciones aún no implementadas muestran una indicación de próxima fase; no deben interpretarse como operaciones disponibles. El manual de uso actualizado está en [`manual/Manual Oficial - miClub Gestión.md`](manual/Manual%20Oficial%20-%20miClub%20Gestión.md).

## SQL incorporado y estado de aplicación

La tabla entre los marcadores siguientes se deriva de `migrationManifest.ts`; `npm run db:migrations:check` falla si una migración post-admin nueva no tiene finalidad o si este contenido diverge del manifiesto. No editar sus filas manualmente. Las migraciones deben aplicarse, en el orden del manifiesto, con `npm run db:migrate`:

<!-- POST_ADMIN_MIGRATIONS:START -->

| Migración | Finalidad | Checksum SHA-256 esperado | Dependencia operativa |
| --- | --- | --- | --- |
| `202608060001_activity_mutation_model.sql` | Añade archivo, actor, índice activo e invariantes para mutaciones de actividades. | `a4949d36c3a9dad62e9d776bf951a94104f006c1d9179daf707982829f73284b` | Después de `202607240003_add_nullable_club_id_to_tenant_scoped_tables.sql`. |
| `202608060002_tasks.sql` | Crea tareas tenant-scoped con normalización, restricciones e índices operativos. | `d92b6d148bbfd7eed676822e7fb4b8ad8c93b5e2d9cf44cd9ccf2e3930d6b1a3` | Después de `202607250003_create_user_club_authorization.sql`. |
| `202608060003_movement_mutation_model.sql` | Añade conciliación y anulación, y protege movimientos finalizados o vinculados a pagos. | `1e448a1a46dc0401f89ff105397af8779602dd97e89e3c297033de3558afe628` | Después de `202607280001_enforce_operational_movement_status.sql`. |
| `202608060004_manual_movement_creation.sql` | Añade actividad e idempotencia para la creación manual de movimientos. | `561cb4ca1198dbbb40c37e46aced504e0c5f809b3a4d8458e9c9200a496e28b0` | Después de `202608060001_activity_mutation_model.sql` y `202608060003_movement_mutation_model.sql`. |
| `202608060005_grant_read_permissions.sql` | Conserva el acceso de lectura de roles administrativos al hacer explícitos los permisos read. | `03d44d929656622877bff202c1ba7f791c8058d59052a7333caf189cba3ffffb` | Después de `202607250003_create_user_club_authorization.sql`. |
| `202608060006_provision_administrative_permissions.sql` | Provisiona permisos administrativos canónicos sin eliminar grants personalizados y revoca sesiones afectadas. | `77332672f70089e44787361c334bb5975cf2b0490d1b290100f346194561d2f2` | Después de `202607250009_add_session_revocation.sql` y `202608060005_grant_read_permissions.sql`. |
| `202608060007_backfill_granular_mutation_permissions.sql` | Completa permisos granulares desde grants legacy, preserva permisos personalizados y revoca sesiones afectadas. | `5d43fd56388bcd855deb7b0040dd415e429628b0123e48aa8c0301d8a743e685` | Después de `202608060006_provision_administrative_permissions.sql`. |
| `202608130001_version_activity_terms.sql` | Versiona términos de actividades, incorpora el catálogo de iconos y protege tenant e historia. | `45075d69c380cba75c46d8c9fd3a0db918f002d30e22fabc0401385c012aaffa` | Después de `202608060001_activity_mutation_model.sql`. |
| `202608130002_activity_settlements.sql` | Modela liquidaciones y asignaciones explícitas por actividad sin inferir pagos históricos. | `684a7d82d658db5305ebd696a0b3b761b105c2eee975b1af8abef9e691f32d37` | Después de `202608130001_version_activity_terms.sql` y `202608060003_movement_mutation_model.sql`. |
| `202608130003_global_category_catalog.sql` | Crea el catálogo económico global clasificado y conserva movement_categories como referencia tenant compatible. | `1292c2c65f2a57029854b6ce60f4dfe72ca9c9ce16ff2a178bc589d94bda722f` | Después de `202608060003_movement_mutation_model.sql`. |
| `202608130004_secure_xlsx_import.sql` | Añade trazabilidad, idempotencia y errores estructurados al importador XLSX seguro. | `2a9f8ff8547fb63ec6d10d51ac19374ef1dd6209529b6f63b25509bb30167837` | Después de `202607250002_evolve_app_users_auth.sql` y `202607250003_create_user_club_authorization.sql`. |
| `202608130005_xlsx_batch_identity.sql` | Impide reejecutar un lote XLSX real exacto salvo retry/reversal explícito. | `10ea1c80c9543c6791a0894e8283d92dacee92afaf547b7794e57715e589eeb4` | Después de `202608130004_secure_xlsx_import.sql`. |

<!-- POST_ADMIN_MIGRATIONS:END -->

Además existen SQL manuales de Administración en [`dbeaver/administration/`](dbeaver/administration/): diagnóstico, permisos, evolución de sectores/actividades, empleados, tareas/solicitudes y asociación de movimientos. Son herramientas de auditoría o remediación para instalaciones legacy; **no se consideran aplicadas por estar en Git ni reemplazan las migraciones**. Antes de desplegar se debe guardar como evidencia la salida de:

```sql
select name, checksum, applied_at
from public.miclub_schema_migrations
where name like '2026080600%'
order by name;
```

Si la instalación fue preparada con scripts manuales, registrar archivo, checksum, operador, entorno, hora y resultado en el ticket de despliegue. Nunca volver a ejecutar un script sólo para “asegurar” sin correr primero su diagnóstico.

## Permisos efectivos

Todas las rutas listadas abajo requieren sesión válida, membresía activa, tenant derivado por el servidor y rechazo de `clubId` enviado por el cliente. Los permisos se asignan en `user_club_memberships.permissions`; no alcanza con ocultar un botón.

| Capacidad | Permiso efectivo |
| --- | --- |
| Abrir Administración, resumen y trabajadores | `administration.view` |
| Consultar sectores/actividades/movimientos/inscripciones | sesión + tenant; los filtros de sector respetan el alcance de la membresía |
| Editar / cambiar estado de sector | `sectors.edit` + acceso al sector |
| Archivar sector | `sectors.archive` + acceso al sector |
| Crear / editar / archivar actividad | `activities.create` / `activities.edit` / `activities.archive` + acceso al sector |
| Ver / crear / editar tareas | `tasks.view` / `tasks.create` / `tasks.edit` |
| Ver solicitudes | `requests.view` |
| Aprobar / rechazar solicitudes | `requests.approve` / `requests.reject` |
| Crear movimiento manual | `movements.create` |
| Editar / anular movimiento | `movements.edit` / `movements.cancel` |
| Crear / editar / cancelar inscripción | `enrollments.create` / `enrollments.edit` / `enrollments.cancel` |

La matriz definitiva vive en `packages/shared/src/contracts/auth.ts`. Hasta el **2026-11-06**, el middleware explícito `requireAuthorizationCapability` acepta también `finance:write` para editar/anular movimientos y `club:manage` para crear/editar/cancelar inscripciones. La migración `202608060007` añade los permisos granulares a titulares activos del legacy sin reemplazar permisos personalizados y revoca sus sesiones. La compatibilidad se retira en una nueva versión cuando una consulta del entorno confirme cero membresías activas con permiso legacy a las que falte cualquiera de sus equivalentes; después de esa fecha, un hallazgo bloquea el despliegue en vez de extender silenciosamente el fallback.

## Endpoints post-admin

Todos los paths son tenant-scoped. Los GET paginados aceptan `page`/`limit` y sólo los filtros definidos por su router.

| Método | Path | Permiso / finalidad |
| --- | --- | --- |
| GET | `/api/administration` | `administration.view`; read model inicial |
| GET | `/api/administration/summary` | `administration.view`; indicadores del panel |
| GET | `/api/administration/workers` | `administration.view`; trabajadores, con fallback legacy declarado |
| GET | `/api/sectores`, `/api/actividades`, `/api/movimientos`, `/api/inscripciones` | consultas del panel y sus detalles |
| PATCH | `/api/sectors/:id` | `sectors.edit`; requiere `updatedAt` |
| PATCH | `/api/sectors/:id/status` | `sectors.edit`; requiere `updatedAt` |
| POST | `/api/sectors/:id/archive` | `sectors.archive`; requiere `updatedAt` |
| POST | `/api/activities` | `activities.create` |
| PATCH | `/api/activities/:id` | `activities.edit`; requiere `updatedAt` |
| PATCH | `/api/activities/:id/status` | `activities.edit`; requiere `updatedAt` |
| POST | `/api/activities/:id/archive` | `activities.archive`; requiere `updatedAt` |
| GET / POST | `/api/tasks` | `tasks.view` / `tasks.create` |
| PATCH | `/api/tasks/:id`, `/api/tasks/:id/status` | `tasks.edit`; requiere `updatedAt` |
| POST | `/api/tasks/:id/archive` | `tasks.edit`; requiere `updatedAt` |
| GET | `/api/requests`, `/api/requests/:id` | `requests.view` |
| POST | `/api/requests/:id/approve`, `/api/requests/:id/reject` | permiso de decisión correspondiente; sólo handlers seguros |
| POST | `/api/movements` | `movements.create`; exige `Idempotency-Key` |
| PATCH | `/api/movements/:id` | `movements.edit`; requiere `updatedAt` |
| POST | `/api/movements/:id/void` | `movements.cancel`; requiere `updatedAt` y motivo |
| POST | `/api/inscripciones` | `enrollments.create`; alta validada y auditada |

El inventario completo reconciliado está en [`api-route-inventory.md`](api-route-inventory.md).

## Rollback

### Aplicación

1. Detener nuevas escrituras administrativas y conservar `requestId`/auditoría del incidente.
2. Replegar al artefacto del commit anterior compatible con el schema expandido.
3. No borrar columnas ni tablas: las migraciones post-admin son aditivas y el binario anterior debe ignorarlas.
4. Validar login, Inicio, CRM, Economía y lecturas administrativas; mantener import/debug apagados.

### Datos y schema

- Una operación funcional se revierte con una nueva operación compensatoria auditada; no se editan ni borran filas a mano.
- Restaurar backup es el mecanismo para corrupción general y requiere ventana aprobada, prueba de restauración y reconciliación posterior.
- [`dbeaver/administration/99_admin_rollback_manual.sql`](dbeaver/administration/99_admin_rollback_manual.sql) corresponde **sólo** a objetos creados por los scripts manuales. Aborta si detecta datos y deja columnas destructivas comentadas. No revierte el ledger de migraciones versionadas ni debe ejecutarse contra un schema migrado sin revisión DBA.
- No editar `public.miclub_schema_migrations` para fingir un rollback. Una reversión de schema requiere una nueva migración correctiva versionada.

## Criterios de aceptación cumplidos

- [x] PostgreSQL continúa como fuente autoritativa; el panel no usa Sheets, SQLite ni mocks como read path productivo.
- [x] Administración exige autenticación, membresía, tenant servidor y `administration.view`; se rechaza `clubId` controlado por cliente.
- [x] El panel contempla carga, error, vacío y reintento, y presenta datos reales de resumen, sectores, actividades y trabajadores.
- [x] Los detalles permiten rastrear sector/actividad a inscripciones y movimientos asociados sin escribir datos.
- [x] Listas administrativas usan paginación acotada y orden servidor estable.
- [x] Sectores, actividades, tareas y movimientos mutables usan control de concurrencia mediante `updatedAt`.
- [x] La creación manual de movimientos exige idempotencia, valida referencias tenant y registra auditoría.
- [x] La creación de inscripciones valida persona/actividad del tenant, evita duplicados activos y audita el alta.
- [x] Movimientos conciliados o vinculados a pagos quedan protegidos; la anulación exige motivo.
- [x] Decisiones de solicitudes bloquean doble resolución, rechazan tipos sin handler seguro y auditan antes/después en la transacción.
- [x] Trabajadores excluye credenciales; informa explícitamente si opera con el fallback legacy.
- [x] Hay pruebas automatizadas de acceso administrativo, métricas, mutaciones, repositorios, aislamiento y regresión UI.

“Cumplido” describe la cobertura del código y sus pruebas. El despliegue sólo queda aceptado cuando el gate siguiente tiene evidencia del entorno destino.

## Gate de despliegue y evidencia

```bash
npm run db:migrations:check
npm run db:migrate
npm run typecheck
npm run build
npm run test -w @miclub/api
npm run test -w @miclub/web
```

Registrar commit, entorno, backup restaurable, salida del ledger SQL, resultado de cada comando, smoke tests de login/logout, acceso permitido/denegado y aislamiento con dos clubes. Confirmar al cierre `IMPORT_ENDPOINTS_ENABLED=false`, `DEBUG_ENDPOINTS_ENABLED=false`, `BOOTSTRAP_DIRECTOR_ENABLED=false` y ausencia de credenciales en el repositorio.

## Pendientes

1. Retirar el fallback legacy el 2026-11-06 después de auditar que ningún titular activo carece de sus equivalentes granulares.
2. Aplicar permisos granulares a los GET administrativos que hoy dependen sólo del gate tenant o de `administration.view`.
3. Implementar UI de edición para sectores, actividades y trabajadores; las fichas actuales son de sólo lectura.
4. Implementar gestión de categorías, cuotas y socios desde las acciones rápidas.
5. Definir modelo antes de habilitar Reservas y Membresías; hoy son placeholders intencionales.
6. Completar asignación de tareas (`tasks.assign`) y una UI de bandeja/decisión de solicitudes.
7. Eliminar el fallback legacy de trabajadores después de desplegar y validar `miclub.employees` en todos los entornos.
8. Añadir conciliación, cierres por período, reapertura con doble autorización y exportación administrativa.
9. Ejecutar y adjuntar evidencias de migración, backup, restauración, smoke tests e aislamiento en el entorno productivo; no pueden certificarse desde el repositorio.
10. Regenerar los artefactos HTML/PDF del manual desde el Markdown actualizado antes de su distribución externa.

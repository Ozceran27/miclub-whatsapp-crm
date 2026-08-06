# Checkpoint canónico post-admin

**Fecha de corte:** 2026-08-06  
**Estado:** implementación cerrada en código; despliegue sujeto al gate operativo de este documento.  
**Reemplaza para trabajo nuevo:** [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md), que se conserva como evidencia del baseline.

## Alcance entregado

El panel **Administración** ya ofrece resumen ejecutivo, capacidad, tendencias, rankings y consultas de sectores, actividades, trabajadores, movimientos e inscripciones. Los detalles de sector, actividad y trabajador son de sólo lectura. También están operativos la creación manual de movimientos e inscripciones y el alta, cambio de estado y archivo de tareas. Las solicitudes permiten consulta y decisión manual para tipos con handler seguro.

Las tarjetas de acciones aún no implementadas muestran una indicación de próxima fase; no deben interpretarse como operaciones disponibles. El manual de uso actualizado está en [`manual/Manual Oficial - miClub Gestión.md`](manual/Manual%20Oficial%20-%20miClub%20Gestión.md).

## SQL incorporado y estado de aplicación

Las siguientes migraciones versionadas están incorporadas al manifiesto y deben aplicarse, en este orden, con `npm run db:migrate`:

| Migración | Cambio |
| --- | --- |
| `202608060001_activity_mutation_model.sql` | `activities.archived_at`, `updated_by`, índice activo y trigger de invariantes. |
| `202608060002_tasks.sql` | tabla `tasks`, normalización, constraints e índices tenant-scoped. |
| `202608060003_movement_mutation_model.sql` | conciliación/anulación de movimientos y protección de movimientos finalizados. |
| `202608060004_manual_movement_creation.sql` | `activity_id`, `idempotency_key` e índices para creación manual idempotente. |

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
| Editar / anular movimiento | `finance:write` (permiso legacy efectivo del router) |
| Crear inscripción | `club:manage` (permiso legacy efectivo del router) |

`workers.view`, `workers.manage`, `tasks.assign`, `movements.edit`, `movements.cancel` y los permisos `enrollments.*` ya figuran en el contrato compartido, pero no todos tienen hoy una ruta o enforcement homónimo. No conceden por sí solos las operaciones legacy `finance:write` o `club:manage`. Esta diferencia queda como pendiente explícito, no como equivalencia implícita.

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
| PATCH | `/api/movements/:id` | `finance:write`; requiere `updatedAt` |
| POST | `/api/movements/:id/void` | `finance:write`; requiere `updatedAt` y motivo |
| POST | `/api/inscripciones` | `club:manage`; alta validada y auditada |

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

1. Alinear `finance:write` y `club:manage` con los permisos granulares `movements.*` y `enrollments.*`, incluida migración de membresías y pruebas de compatibilidad.
2. Aplicar permisos granulares a los GET administrativos que hoy dependen sólo del gate tenant o de `administration.view`.
3. Implementar UI de edición para sectores, actividades y trabajadores; las fichas actuales son de sólo lectura.
4. Implementar gestión de categorías, cuotas y socios desde las acciones rápidas.
5. Definir modelo antes de habilitar Reservas y Membresías; hoy son placeholders intencionales.
6. Completar asignación de tareas (`tasks.assign`) y una UI de bandeja/decisión de solicitudes.
7. Eliminar el fallback legacy de trabajadores después de desplegar y validar `miclub.employees` en todos los entornos.
8. Añadir conciliación, cierres por período, reapertura con doble autorización y exportación administrativa.
9. Ejecutar y adjuntar evidencias de migración, backup, restauración, smoke tests e aislamiento en el entorno productivo; no pueden certificarse desde el repositorio.
10. Regenerar los artefactos HTML/PDF del manual desde el Markdown actualizado antes de su distribución externa.

# Auditoría de preparación pública y multi-tenancy — 2026-07-25

## Alcance y conclusión ejecutiva

Se revisaron los workspaces API/web/shared, rutas, servicios, repositorios, migraciones y el dump `dump-miclub_gestion-202607242305.txt` (PostgreSQL 18.4). La actualización ya introdujo correctamente `club_id` en el núcleo operativo, membresías usuario-club, índices compuestos por club y propagación de `RequestAuthContext`. Sin embargo, el dump aún no representa por sí solo una versión apta para exposición pública.

Esta revisión corrige el bloqueo principal de autenticación (el middleware descartaba el tenant firmado), agrega registro transaccional de club/propietario, auditoría de acceso y dos invariantes cross-tenant en base de datos. Antes de producción deben cerrarse los riesgos P0/P1 restantes de esta página.

## Hallazgos corregidos

1. **P0 — sesión autenticada inutilizable:** el login firmaba `clubId`, membresía, rol, permisos y sectores, pero `createAuthProtection` reconstruía únicamente identidad. `requireMembership` rechazaba luego todas las rutas tenant. Ahora se conserva el contexto firmado completo.
2. **P0 — registro presentado pero inexistente:** web enviaba `POST /auth/register`, sin implementación API. El alta ahora valida y normaliza entradas, hashea con scrypt y crea dentro de una única transacción club, rol owner, usuario, membresía y medios de pago iniciales. Un rollback evita tenants parciales.
3. **P1 — integridad de autorización:** una membresía podía referir un `role_id` perteneciente a otro club. La FK compuesta nueva obliga `(role_id, club_id)` a coincidir.
4. **P1 — integridad de importación:** `import_errors.club_id` podía diferir del club de su batch. La FK compuesta nueva elimina esa mezcla.
5. **P1 — trazabilidad:** login, logout y registro exitosos ahora generan eventos sanitizados en `audit_log`.
6. **P1 — contraseña incoherente:** frontend aceptaba 8 caracteres; el contrato público ahora exige 10–128, al menos una letra y un número, igual que el backend.

## Modelo de datos observado

### Fortalezas

- Entidades operativas principales (`people`, `club_memberships`, `sectors`, `activities`, `enrollments`, `movements`, `payments`, `receivables`, balances y catálogos editables) contienen `club_id`.
- La mayoría de identidades naturales y external IDs se hicieron únicas dentro del club, no globalmente.
- Los repositorios nuevos reciben `auth.clubId` y filtran consultas; import batches y errores se consultan con tenant.
- Existe historial financiero y de normalización, estados tipados, auditoría e índices adecuados para listados corrientes.

### Riesgos pendientes antes de producción

#### P0 — aislamiento CRM incompleto

`crm_message_templates` y `crm_message_history` no tienen `club_id`; el repositorio PostgreSQL lista, modifica y elimina globalmente. En un despliegue con dos clubes, plantillas e historial quedarían expuestos o modificables entre tenants. Además `ensureCrmSchema()` ejecuta DDL durante requests y define una estructura distinta de la del dump. Debe crearse una migración canónica que agregue `club_id NOT NULL`, índices/uniques por club, backfill explícito, y después pasar `RequestAuthContext` a todas las funciones CRM. No se debe habilitar CRM público antes de hacerlo.

#### P0 — rutas mutables sin permisos finos

La autenticación y membresía se aplican globalmente, pero las rutas CRM e importación no usan `requirePermission`. Cualquier miembro activo del club puede disparar importaciones o cambiar plantillas. Aplicar al menos `imports:run`, `crm:write`, `finance:write`, `users:manage`; reservar lecturas sensibles según rol.

#### P1 — defensa de base de datos

No hay Row Level Security en el dump. El filtro de aplicación es útil pero un query omitido puede filtrar datos. Para exposición pública se recomienda una transacción por request que configure `SET LOCAL app.club_id`, políticas RLS sobre tablas tenant y un rol runtime sin `BYPASSRLS`; jobs/migraciones deben usar un rol separado.

#### P1 — membresías múltiples

El login elige la primera membresía activa (`ORDER BY created_at LIMIT 1`). Esto es determinista, pero no permite escoger club y puede seleccionar uno inesperado. Implementar endpoint para listar tenants autorizados y selección explícita que reemita sesión; nunca aceptar un `clubId` arbitrario sin verificar membresía.

#### P1 — autorización obsoleta durante 12 horas

Rol/permisos se copian a la cookie firmada. Deshabilitar una membresía no revoca de inmediato una sesión vigente. Para acciones sensibles, revalidar membresía en PostgreSQL o introducir `session_version`/tabla de sesiones revocables.

#### P1 — migraciones

No existe runner/tabla de migraciones visible y hay identificadores cronológicos duplicados. Definir una herramienta única, checksum y orden estricto; validar migraciones desde cero y sobre copia del dump. El dump contiene nombres de constraints heredados `app_users_*` y la columna legacy `users.role_id`, que debe retirarse cuando todo consumidor use `user_club_memberships`.

#### P2 — disponibilidad y operación

- El rate limiter es memoria-local: no coordina réplicas y se pierde al reiniciar. Usar Redis/almacén compartido y limitar también por email normalizado.
- El servidor no cierra pool/HTTP de forma ordenada ante SIGTERM.
- `seedDefaultTemplates` sigue usando SQLite al arrancar aunque PostgreSQL sea oficial.
- La aplicación conserva pares `.js`/`.ts` fuente en web/shared, con riesgo de drift; eliminar generados del árbol fuente y compilar únicamente desde TS.
- Agregar health de readiness que ejecute consulta mínima y verifique versión de migración, métricas, alertas de 5xx y backups restaurados periódicamente.

## Migración desde Google Sheets con multi-tenancy

**Sí, es posible mantenerla**, y la arquitectura actual ya contiene la base correcta: el importador recibe `RequestAuthContext`, deriva `clubId` de la sesión (no del body), crea batches por club y usa external IDs únicos por club. Las altas/upserts de sectores, personas, instructores, actividades, inscripciones, movimientos, balances y snapshots se escriben con ese tenant.

Condiciones obligatorias:

1. Mantener `clubId` exclusivamente desde una membresía autenticada y exigir `imports:run`.
2. No compartir una configuración global de planilla entre todos los clubes. Guardar por club un identificador/rangos o un `import_source` cifrado; secretos en un secret manager, nunca en `clubs.settings` ni en logs.
3. Conservar idempotencia como `(club_id, source, external_id)` y añadir club a cualquier unique legacy que todavía sea global.
4. Ejecutar cada import bajo advisory lock por `(club_id, source)` para impedir dos importaciones simultáneas del mismo club.
5. Confirmar que archive/missing sólo compare contra filas y último batch del mismo club. Mantener dry-run por defecto, resumen y aprobación humana para bajas.
6. Validar pertenencia cross-tenant de todas las FKs. La migración de esta revisión lo hace para errores/batches; debe extenderse a relaciones como activity-sector/instructor, enrollment-person/activity, receivable-person/enrollment y payment-allocation cuando cada tabla tiene `club_id`.
7. Separar límites y cuotas por tenant, registrar actor/membership en el batch y auditar inicio, final, fallo y borrado de faltantes.
8. Crear tests de integración con dos clubes que reutilicen DNI, teléfono, nombres y external IDs, demostrando idempotencia dentro del club y cero lecturas/escrituras cruzadas.

## Plan recomendado de salida

1. **Gate 1 (bloqueante):** tenantizar CRM, permisos por ruta, revocación/revalidación y tests de aislamiento de dos tenants.
2. **Gate 2:** aplicar migraciones en staging restaurado del dump; ejecutar auditorías de huérfanos, relaciones cross-club, duplicados y montos.
3. **Gate 3:** prueba end-to-end: registro → sesión → onboarding → dry-run Sheets → import → dashboards → CRM → logout.
4. **Gate 4:** RLS/rol runtime, rate limiting distribuido, observabilidad, backups/restores, política de privacidad y retención de DNI/teléfono/auditoría.
5. **Lanzamiento gradual:** registro público inicialmente con feature flag/invitación, un club piloto, monitoreo y rollback documentado.

La recomendación final es **no declarar todavía disponibilidad pública general**, pero sí continuar con una beta cerrada después de completar Gate 1. La migración Sheets puede y debe conservarse como herramienta tenant-scoped de onboarding/operación.

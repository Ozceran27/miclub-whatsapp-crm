# Tenancy and RBAC

## Autoridad

User autenticado → Person/membership activa → Club. Nunca elegir tenant mediante body/query/XLSX, primer club o UUID fijo. user_club_memberships gobierna acceso; club_memberships es relación de persona, no autenticación.

User es global; Person, roles y entidades operativas son tenant. DIRECTOR/TRABAJADOR/INSTRUCTOR y permisos se definen en shared contracts/auth.ts. Backend exige permisos; ocultar botones no autoriza.

## Tres fronteras diferentes

1. HTTP: authProtection revalida membership y revocación y asigna req.auth; requireMembership/permission/sector controlan acceso.
2. Queries/FKs: predicados club_id, nested references y claves compuestas.
3. PostgreSQL: miclub_runtime NOBYPASSRLS y contexto local a transacción.

withTenantTransaction establece app.club_id y app.current_club_id. withTransaction sólo abre/cierra transacción. El middleware no establece ese contexto en conexiones del pool.

**B02:** activitiesRepository, movementsRepository, enrollmentsRepository y crmRepository tienen accesos directos/withTransaction sin contexto requerido. Con tablas protegidas pueden producir vacíos/rechazos; no significa por sí mismo filtración cross-tenant. Cobertura RLS prioritaria detallada en DATA_MODEL; no universal ni certificada.

rejectClientClubId sólo cubre clubId camelCase; operaciones inspeccionadas usan tenant autenticado. No interpretar ausencia de rechazo de club_id como autoridad permitida.

## Auth y sesiones

Scrypt con salt aleatorio; cookie HMAC v2 de 12 h, HttpOnly, SameSite=Lax y Secure según HTTPS. Login bloquea tras intentos fallidos y exige membership válida. /auth/me re-resuelve permisos. Logout actualiza users.session_revoked_before (revoca sesiones del usuario) y limpia cookies; web propaga logout por BroadcastChannel.

Membership bootstrap usa funciones SQL resolve_login_membership, resolve_active_membership y list_active_memberships. Producción exige autenticación; bypass sólo explícito de tests.

**B06:** ruta worker-invitations valida cookie pero no revocación como /me. **C02:** entrega de token no encontrada; aceptación y cambios de rol no sincronizan Instructor como alta nueva. No ampliar privilegios de identidad existente sin aceptación válida.

## Sector scope y cache

sectors:any habilita acceso a sectores del mismo club. Otros actores usan sector_ids, con aplicación variable según superficie; comprobar rutas concretas. Referencias extranjeras deben fallar aun con UUID válido.

Web usa QueryClient propio y keys con club/recurso/filtros/paginación/versión. TenantCacheBoundary cancela/retira cache al cambiar club; logout invalida sesión. No declarar test E2E de cambio de tenant ejecutado.

## RBAC y planes

imports:run AND DATA_MIGRATION. El override efectivo más reciente prevalece; si no existe, se exige subscription activa con entitlement. Onboarding activa el plan sin cobro; no cambia permisos del actor.

## Seguridad pendiente de entorno

CORS/CSRF, límites auth/import, headers y auditoría sanitizada existen. Logout está exceptuado de CSRF. trust proxy=true requiere proxy confiable; PGSSL usa rejectUnauthorized:false. Fotos privadas necesitan almacenamiento persistente configurado. .env no versionado; no se inspeccionaron secretos.

Ver TESTING: ejecutar positivos y negativos A/B bajo rol runtime en instancia aislada. No usar DB real ni declarar zero-tenant startup certificado.

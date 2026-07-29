# Corrección forense de INICIO y CRM — 2026-07-29

## Checkpoint y alcance

- SHA inicial: `71a43719ffad4b11cc33b6fd0d5944177eb7e931`.
- Rama de trabajo: `fix/dashboard-postgres-forensic-20260729`.
- No se modificaron ECONOMÍA, MIGRACIÓN, autenticación, CSP, migraciones ni archivos `dist` a mano.

## Hallazgo demostrado

`miclub.v_current_enrollments` es una vista legacy creada sobre `enrollments`, `people`, `activities` y `sectors`. Su proyección no incluye `club_id`. El SQL de `getPostgresMembers` introducido durante el tenant-scope refactor era:

```sql
select * from miclub.v_current_enrollments where club_id = $1
```

PostgreSQL señala `club_id` (posición 50) con `42703`. De esta función dependen directamente `/members`, `/debtors` y `/summary`; por eso fallaban en cascada.

`miclub.v_enrollment_receivable_fees` tampoco proyecta `club_id`. La promesa de índice 8 (base cero) de `getPostgresClubFinanceSummary` ejecutaba:

```sql
with enrollment_receivables as (
  select status, due_date, receivable_fee
  from miclub.v_enrollment_receivable_fees
  where club_id = $1
)
select ... from enrollment_receivables
```

Eso explica el segundo `42703`. El array paralelo conserva este orden: (0) dashboard básico, (1) último saldo operativo, (2) saldos sectoriales, (3) ingresos por sector, (4) egresos por sector, (5) ingresos por categoría, (6) egresos por categoría, (7) snapshots de liquidación, **(8) cuotas derivadas**, (9) movimientos pendientes.

El escenario real es **E**: el tenant existe en la tabla relacionada `miclub.enrollments`, no en ambas vistas legacy. No era ambigüedad ni caída de PostgreSQL. Agregar `club_id` a las vistas habría requerido una migración y despliegue coordinado innecesarios para restaurar la compatibilidad. La aplicación ahora une cada vista por `enrollment_id` a `miclub.enrollments` y aplica `e.club_id = $1`; el filtro opcional `e.inactive` se aplica sobre esa misma tabla autoritativa.

## Contratos y consumidores

Las rutas raíz de `legacyCompatRoutes.ts` siguen siendo el contrato consumido por `homeApi` y `crmApi`. `/members` y `/debtors` continúan devolviendo arrays; `/summary`, `/club-finance-summary` y `/sector-operational-summary` continúan devolviendo objetos. No se introdujo paginación ni un segundo contrato.

Los errores SQL internos ahora responden `500 DATABASE_QUERY_FAILED`, mensaje controlado y `requestId`. Solo SQLSTATE de conexión (`08...`), shutdown (`57P01`–`57P03`), saturación (`53300`) y errores equivalentes de transporte responden `503 DATABASE_UNAVAILABLE`.

INICIO resuelve las seis solicitudes de forma independiente: conserva respuestas exitosas, presenta errores locales de finanzas/sectores y un resumen determinista de fallos de membresías/sincronización, incluyendo el `requestId` ya transportado por `ApiError`. El botón Sincronizar permite reintentar.

## Auditorías secundarias

- `GET /auth/me` es la comprobación pública de bootstrap de `SessionProvider`; usa `credentials: 'include'`. Un `401` antes del login representa sesión anónima normal. Las respuestas 401 posteriores a endpoints protegidos se revalidan una sola vez. No se encontró motivo para cambiar autenticación.
- La CSP deliberadamente mantiene `script-src 'self'`. No existe integración de Cloudflare Web Analytics en el código; el beacon inyectado externamente queda bloqueado. Se conserva la opción segura: no permitir el dominio ni agregar comodines/`unsafe-inline`. El warning no afecta las consultas.
- No se necesita SQL correctivo en DBeaver. `docs/dbeaver/08_dashboard_crm_forensic_readonly.sql` permite auditar el schema real y ejecutar equivalentes tenant-scoped sin modificar datos.

## Límites de validación ambiental

El contenedor no contiene `.env` ni credenciales PostgreSQL/sesión. El arranque productivo se detiene correctamente por configuración insegura antes de escuchar un puerto. El proxy de ejecución rechaza el túnel Cloudflare con HTTP 403. Por ello no fue posible afirmar resultados 200 ni datos reales en localhost/túnel desde este entorno; deben validarse con una sesión real después de desplegar este commit. Los tests con un pool PostgreSQL instrumentado comprueban el SQL exacto, parámetros y aislamiento de dos clubes, pero no sustituyen esa verificación operativa.

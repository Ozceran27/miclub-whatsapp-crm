# Matriz de autorización de rutas de lectura

`club_id` siempre proviene de la sesión y permanece en cada consulta tenant. En las filas con alcance **sectorial**, la API agrega `sector_id = ANY(sectorIds)` cuando falta `sectors:any`; una lista vacía no concede acceso.

| Endpoint(s) | Módulo | Permiso de lectura | Alcance |
|---|---|---|---|
| `GET /api/sectores`, `/api/sectors` | Sectores | `sectors.view` | club (el catálogo se reduce a `sectorIds`) |
| `GET /api/actividades`, `/api/activities` | Actividades | `activities.view` | sectorial |
| `GET /api/trabajadores`, `/api/instructors` | Trabajadores | `workers.view` | club; no devuelve membresías ni credenciales |
| `GET /api/inscripciones` | Inscripciones | `enrollments.view` | sectorial, vía actividad |
| `GET /api/movimientos`, `/api/movements`, `/api/receivables`, `/api/payments`, `/api/operational-balances`, `/api/sector-settlements` | Finanzas | `finance:read` | sectorial para movimientos y saldos; club para pagos/cobranzas |
| `GET /api/economy/*`, `/api/modules/economy/*` | Economía | `finance:read` | agregado financiero del club |
| `GET /api/dashboard/basic`, `/api/dashboard-reconciliation` | Dashboard | `dashboard:read` | agregado del club |
| `GET /api/sector-finance-summary` | Dashboard | `dashboard:read` | sectorial |
| catálogos financieros | Finanzas | `finance:read` | club |
| catálogos de descuentos/precios y `GET /api/catalogs*` | Administración | `administration.view` | club |
| legacy `/members` | Personas | `people:read` | club |
| legacy `/debtors`, `/club-finance-summary` | Finanzas | `finance:read` | club |
| legacy `/summary`, `/sector-operational-summary` | Dashboard | `dashboard:read` | club/sectorial según respuesta |
| legacy `/sync-status` | Administración | `administration.view` | club |
| legacy `/*-debug`, `/comparison-debug*` | Debug temporal | `administration.configure` | club; sólo si el flag de debug está activo |
| `/health` | Operación | público | sin datos tenant |

## Roles canónicos

Las altas nuevas de `owner`, `DIRECTOR` y `admin` usan el catálogo canónico completo. La migración `202608060005` incorpora los permisos de lectura separados a membresías existentes de esos roles. Los roles personalizados no se elevan automáticamente: deben recibir únicamente los permisos requeridos y sus `sectorIds`.

## Decisión sobre legacy y debug

Se conservan temporalmente porque el frontend y la verificación de migración aún los consumen. No constituyen un bypass: atraviesan autenticación tenant, el permiso de esta matriz y las consultas con `club_id`. Los endpoints debug además requieren `administration.configure` y el flag de runtime.

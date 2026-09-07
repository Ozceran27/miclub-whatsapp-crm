# Tenancy and RBAC

## Autoridad tenant

```text
Authenticated User
→ Active Membership
→ Club
```

El cliente no decide libremente clubId.

## Middleware observado

La API exige auth/membership en superficies tenant y rechaza clubId del cliente.

## Repositories/services

Toda operación tenant debe scopearse. Evitar SELECT/UPDATE/DELETE por UUID sin club y joins cruzados.

## Membership

Relaciona User y Club. `/auth/me` re-resuelve autorización para reflejar cambios durante la cookie.

## Roles

El provisioning observado crea roles por club desde `CLUB_ROLE_DEFINITIONS`; Director recibe permisos canónicos.

## Permissions

Backend es autoridad. El inventario documenta permisos de administration, sectors, activities, tasks, requests, movements, enrollments e imports.

## Sector scope

Membership/context puede contener `sectorIds`; validar nested ownership.

## RBAC vs planes

Ejemplo import:

```text
permission imports:run
AND
feature DATA_MIGRATION
```

## Tests negativos

Club A no puede leer/modificar/borrar/usuar recursos de Club B ni importar contra B.

Usar DB de test aislada, no crear tenants de prueba en DB real.

## Zero-tenant

La app debe iniciar con cero clubs y conservar superficies públicas.

## RLS

Provisioning establece `app.club_id` en transacción; migrations nuevas deben respetar RLS.

## Seguridad

Evitar IDOR, mass assignment, hashes expuestos y cache cross-tenant.

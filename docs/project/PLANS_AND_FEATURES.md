# Plans and Features

## Planes

Arquitectura observada/documentada:

- FREE
- SOCIAL
- COMPLEX
- CLUB

## Estado actual

Provisioning asigna FREE.

`BILLING_MODE=disabled|sandbox|live` todavía no representa cobro real; onboarding no solicita tarjetas.

## DATA_MIGRATION

Documentación actual:

- FREE: sin migración
- SOCIAL: con migración
- COMPLEX: con migración
- CLUB: con migración

Validar contra catálogo real antes de modificar.

## Separación

- RBAC = permiso del actor.
- Feature entitlement = capacidad comercial del club.

## Modelo conceptual

```text
Plan
→ Features
→ Club Subscription
→ Effective Entitlements
```

Evitar condicionales de plan dispersos.

## Billing futuro

Integrar en frontera separada; cuando exista pago real, actualizar docs, estados, gates y tests.

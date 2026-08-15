# Arquitectura actual

**Vigencia:** 2026-07-28. Esta página describe el contrato de runtime, no los mecanismos históricos de transición.

## Flujo productivo

1. La web inicia sesión contra `/auth`; la API firma una cookie `httpOnly`.
2. El middleware resuelve usuario, membresía activa y `clubId`. Las rutas tenant-scoped rechazan un `clubId` suministrado por el cliente.
3. Repositorios y servicios consultan PostgreSQL con el tenant del contexto autenticado.
4. PostgreSQL es la fuente autoritativa para identidad, CRM, personas, operación, finanzas y auditoría.

El arranque productivo exige `AUTH_ENABLED=true`, `DATA_SOURCE=postgres`, `CRM_SOURCE=postgres`, una sesión robusta, conexión PostgreSQL y `PUBLIC_APP_URL` HTTPS. Una configuración legacy no degrada silenciosamente: el proceso debe fallar antes de servir tráfico.

## Importaciones

Google Sheets es exclusivamente un origen temporal de importación hacia PostgreSQL. No participa como read path ordinario. La importación requiere habilitación explícita, operador autorizado, tenant determinado y posterior auditoría; al terminar se deshabilitan sus flags.

SQLite permanece como artefacto de prueba de compatibilidad y no es fuente, respaldo automático ni fallback de producción. El `mockData` sin consumidores fue eliminado. El grafo y la puerta de retiro están en [`legacy-runtime-inventory.md`](legacy-runtime-inventory.md); el contexto anterior está en [`history/`](history/README.md).

## Superficies HTTP

Las rutas se montan en `apps/api/src/index.ts`; el inventario reconciliado está en [`api-route-inventory.md`](api-route-inventory.md). Salvo login/registro y health técnico, las superficies de negocio requieren autenticación; las rutas tenant-scoped requieren además membresía.

## Referencia operativa

El documento canónico para el estado previo al módulo admin es [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md). Los procedimientos detallados se mantienen en runbooks enlazados desde allí para evitar versiones duplicadas.

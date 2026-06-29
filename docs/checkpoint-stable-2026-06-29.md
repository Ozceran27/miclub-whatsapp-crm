# Checkpoint estable 2026-06-29: CRM en producción

Este checkpoint registra el valor esperado de `CRM_SOURCE` para producción en la rama estable actual, sin incluir credenciales, URLs privadas ni otros secretos.

## Confirmación de documentación existente

La configuración de ejemplo del repositorio ya documenta PostgreSQL como fuente oficial para CRM:

```env
CRM_SOURCE=postgres
```

El runbook de corte a PostgreSQL también define `CRM_SOURCE=postgres` como estado objetivo de producción para que plantillas e historial CRM usen PostgreSQL en lugar de SQLite.

## Valor esperado en producción

Para entornos productivos, el valor esperado es:

```env
CRM_SOURCE=postgres
```

Este valor debe mantenerse junto con la configuración PostgreSQL productiva correspondiente (`POSTGRES_ENABLED=true` y credenciales PostgreSQL provistas por variables de entorno o secreto administrado por la plataforma). Este documento no debe incluir valores reales de `DATABASE_URL`, `PGPASSWORD`, claves privadas ni secretos de sesión.

## Comportamiento legacy/local

No se cambia el default de la aplicación en este checkpoint. Si `CRM_SOURCE` no es exactamente `postgres`, la API conserva el comportamiento actual y usa SQLite para CRM legacy/local.

Este mantenimiento del default evita romper instalaciones locales o ventanas de migración CRM que todavía dependan de SQLite.

## Control agregado en arranque

A partir de este checkpoint, la API emite un warning no invasivo durante el arranque cuando detecta un entorno productivo con `CRM_SOURCE` distinto de `postgres`. El warning no bloquea el proceso ni cambia la fuente efectiva; solo deja evidencia operativa para corregir la configuración.

## Próximo paso propuesto

En una PR posterior, evaluar cambiar el default productivo a PostgreSQL con un feature flag explícito para habilitar SQLite legacy de forma intencional durante migraciones o soporte local.

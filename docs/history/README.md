# Archivo histórico

> **Advertencia (2026-07-28): no use el contenido de este directorio para despliegues nuevos.** Describe checkpoints, Sheets, SQLite o fallbacks anteriores al contrato productivo vigente. Puede servir para arqueología, migraciones y auditorías, pero no define configuración actual.

La referencia vigente es [`../pre-reset-readiness.md`](../pre-reset-readiness.md). PostgreSQL, autenticación y tenant de sesión son obligatorios en producción; no se permite fallback productivo.

## Documentos archivados

- [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md): checkpoint pre-admin sustituido el 2026-08-16.
- [`checkpoint-post-admin.md`](checkpoint-post-admin.md): checkpoint post-admin sustituido el 2026-08-16; conserva la tabla generada del manifiesto para trazabilidad.
- [`readiness-target-2026-08-07.md`](readiness-target-2026-08-07.md): auditoría sanitizada y bloqueada del entorno destino.
- [`migration-readiness-2026-06-28.md`](migration-readiness-2026-06-28.md): evaluación de la migración anterior.
- [`postgres-backup-and-ledger-readiness.md`](postgres-backup-and-ledger-readiness.md): hallazgos anteriores sobre backup y ledger.

- [`checkpoint-stable-2026-06-29.md`](checkpoint-stable-2026-06-29.md): fotografía operativa declarada el 2026-06-29, reemplazada por el checkpoint pre-admin.
- [`sheets-sqlite-fallback-context-2026-07-28.md`](sheets-sqlite-fallback-context-2026-07-28.md): descripción legacy del fallback Sheets/mock y SQLite, archivada el 2026-07-28.

## Sección forense

Las auditorías y reconstrucciones fechadas están catalogadas separadamente en
[`forensics/`](forensics/README.md). No deben usarse como runbooks vigentes.

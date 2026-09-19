# Archivo histórico

> **Advertencia (2026-07-28): no use el contenido de este directorio para despliegues nuevos.** Describe checkpoints, Sheets, SQLite o fallbacks anteriores al contrato productivo vigente. Puede servir para arqueología, migraciones y auditorías, pero no define configuración actual.

La referencia vigente es
[`../operations/pre-reset-readiness.md`](../operations/pre-reset-readiness.md).
PostgreSQL, autenticación y tenant de sesión son obligatorios en producción; no
se permite fallback productivo.

## Organización

- [`audits/`](audits/): auditorías fechadas y evidencia de inspección.
- [`decisions/`](decisions/): decisiones sustituidas o absorbidas por la documentación canónica.
- [`plans/`](plans/): planes de entrega ya ejecutados o reemplazados.
- [`forensics/`](forensics/README.md): reconstrucciones de incidentes y análisis forense.
- Archivos de esta carpeta: checkpoints y contexto legacy que todavía se cita por nombre.

## Documentos archivados

- [`checkpoint-pre-admin.md`](checkpoint-pre-admin.md): checkpoint pre-admin sustituido el 2026-08-16.
- [`checkpoint-post-admin.md`](checkpoint-post-admin.md): checkpoint post-admin sustituido el 2026-08-16; conserva la tabla generada del manifiesto para trazabilidad.
- [`readiness-target-2026-08-07.md`](readiness-target-2026-08-07.md): auditoría sanitizada y bloqueada del entorno destino.
- [`migration-readiness-2026-06-28.md`](migration-readiness-2026-06-28.md): evaluación de la migración anterior.
- [`postgres-backup-and-ledger-readiness.md`](postgres-backup-and-ledger-readiness.md): hallazgos anteriores sobre backup y ledger.
- [`sheet-structure.md`](sheet-structure.md): rangos de la antigua integración con Google Sheets; no describe el importador XLSX vigente.
- [`google-sheets-enrollment-archive.sql`](google-sheets-enrollment-archive.sql): parche manual sustituido por migraciones versionadas; no ejecutar en instalaciones nuevas.

- [`checkpoint-stable-2026-06-29.md`](checkpoint-stable-2026-06-29.md): fotografía operativa declarada el 2026-06-29, reemplazada por el checkpoint pre-admin.
- [`sheets-sqlite-fallback-context-2026-07-28.md`](sheets-sqlite-fallback-context-2026-07-28.md): descripción legacy del fallback Sheets/mock y SQLite, archivada el 2026-07-28.

## Sección forense

Las auditorías y reconstrucciones fechadas están catalogadas separadamente en
[`forensics/`](forensics/README.md). No deben usarse como runbooks vigentes.

Los documentos históricos no se eliminan cuando conservan decisiones, checksums
o contexto necesario para interpretar Git. Cualquier procedimiento todavía
vigente debe vivir fuera de `history/` y enlazarse desde [`../README.md`](../README.md).

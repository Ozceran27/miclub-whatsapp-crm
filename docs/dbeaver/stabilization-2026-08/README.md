# Estabilización PostgreSQL 2026-08 (ejecución manual)

Runbook versionado para **DBeaver**, PostgreSQL **14 o superior**, base esperada
`miclub_gestion` y schema `miclub`. No forma parte del runner de migraciones ni de CI.

Orden obligatorio: `01_audit.sql` → aprobación humana → `02_cleanup.sql` →
`03_constraints.sql` → `04_indexes.sql` → `05_validation.sql`. Use
`06_rollback.sql` solamente para deshacer 02–04, en orden inverso.

La aprobación de RLS requiere que `01_audit.sql` no produzca ningún `BLOCK` y
que no liste FKs tenant simples. El dump de referencia aún bloquea la aprobación:
`activity_schedules` y `sector_settlements` son hijos tenant sin `club_id`, y
`audit_log.club_id` es nullable. `03_constraints.sql` contiene la única propuesta
de policies y falla cerradamente mientras esos puntos sigan presentes. No debe
habilitarse parcialmente.

Tras remediar y aprobar, cada request de aplicación debe abrir una transacción,
asumir el rol `miclub_runtime` y usar `SET LOCAL app.club_id`; los repositories
mantienen además sus filtros explícitos. Workers usan `miclub_worker`, scripts de
diagnóstico `miclub_operations`, y el Backfill exclusivamente `miclub_backfill`.
Los logins y sus membresías se administran fuera de estos scripts para no guardar
credenciales en Git. Ejecute `07_rls_integration_test.sql` después de 05: omite a
propósito el filtro tenant y prueba también una asociación FK entre clubes.

Antes de aplicar, guarde la salida de 01, confirme que las precondiciones devuelven
los valores esperados y seleccione explícitamente la conexión de producción. Los
encabezados de cada archivo documentan transacciones, bloqueos y tiempos. Los
scripts no hacen backfill ni alteran datos de clubes.

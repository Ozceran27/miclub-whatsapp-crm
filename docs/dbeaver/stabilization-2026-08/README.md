# Estabilización PostgreSQL 2026-08 (ejecución manual)

Runbook versionado para **DBeaver**, PostgreSQL **14 o superior**, base esperada
`miclub_gestion` y schema `miclub`. No forma parte del runner de migraciones ni de CI.

Orden obligatorio: `01_audit.sql` → aprobación humana → `02_cleanup.sql` →
`03_constraints.sql` → `04_indexes.sql` → `05_validation.sql`. Use
`06_rollback.sql` solamente para deshacer 02–04, en orden inverso.

Antes de aplicar, guarde la salida de 01, confirme que las precondiciones devuelven
los valores esperados y seleccione explícitamente la conexión de producción. Los
encabezados de cada archivo documentan transacciones, bloqueos y tiempos. Los
scripts no hacen backfill ni alteran datos de clubes.

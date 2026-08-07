/* Estrategia conservadora. Ejecutar sólo con backup y salida 01 disponibles.
   Los IDs previos se deben restaurar desde tablas de evidencia/export, nunca adivinar.
   Este script revierte sólo metadatos inequívocos etiquetados por este backfill. */
BEGIN;
DELETE FROM miclub.club_memberships WHERE metadata->>'backfill'='2026-08-integral-v1';
DELETE FROM miclub.audit_log WHERE action IN('BACKFILL_STARTED','BACKFILL_DOMAIN_COMPLETED','BACKFILL_COMPLETED') AND metadata->>'version'='2026-08-integral-v1';
-- club_id y relaciones: restaurar desde backup mediante tablas staging verificadas,
-- con UPDATE ... FROM staging WHERE current = expected_after. No se incluye un
-- UPDATE a NULL porque podría destruir asociaciones preexistentes.
COMMIT;
-- Índices (auto-commit):
-- DROP INDEX CONCURRENTLY IF EXISTS miclub.movements_club_activity_idx;
-- DROP INDEX CONCURRENTLY IF EXISTS miclub.enrollments_club_activity_person_idx;
-- DROP INDEX CONCURRENTLY IF EXISTS miclub.import_errors_club_batch_idx;

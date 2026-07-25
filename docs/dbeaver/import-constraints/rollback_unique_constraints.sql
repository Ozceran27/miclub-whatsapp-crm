/* ROLLBACK DDL MANUAL. Usar solo si la aplicación anterior debe revertirse y tras detener importadores.
   No es posible retirar un valor de ENUM de forma segura/in-place; `failed_configuration` queda como valor compatible e inocuo.
   Este rollback elimina únicamente los índices autoritativos creados por apply; no restaura ni inventa uniques globales. */
BEGIN;
DROP INDEX IF EXISTS miclub.movements_club_external_id_key;
DROP INDEX IF EXISTS miclub.enrollments_club_external_id_key;
COMMIT;
-- Después del rollback, desplegar también la versión anterior del importador; el nuevo ON CONFLICT requiere estos índices.

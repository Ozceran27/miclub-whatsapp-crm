-- SQL manual para habilitar archivado seguro de inscripciones de Google Sheets.
-- Revisar y ejecutar manualmente; no es una migración automática.

alter table miclub.enrollments
  add column if not exists inactive boolean not null default false;

alter table miclub.enrollments
  add column if not exists inactive_reason text;

alter table miclub.enrollments
  add column if not exists inactive_at timestamptz;

-- Opcionales: permiten registrar semántica de reemplazo/superseded sin tocar enums.
alter table miclub.enrollments
  add column if not exists superseded_at timestamptz;

alter table miclub.enrollments
  add column if not exists superseded_reason text;

-- Si miclub.v_current_enrollments existe y se usa como fuente vigente,
-- actualizar su definición para excluir registros archivados, por ejemplo:
--   ...
--   from miclub.enrollments e
--   ...
--   where coalesce(e.inactive, false) = false
--     and <condiciones vigentes existentes>;
--
-- No se incluye CREATE OR REPLACE VIEW completo porque debe conservar la
-- definición actual de la instalación y sólo agregar el filtro anterior.

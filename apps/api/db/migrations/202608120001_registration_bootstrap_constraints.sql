BEGIN;

-- Una persona puede conservar historial laboral, pero sólo una relación vigente por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS employees_active_club_person_key
  ON miclub.employees (club_id, person_id)
  WHERE status IN ('active', 'on_leave');

COMMENT ON INDEX miclub.employees_active_club_person_key IS
  'Impide dos relaciones laborales vigentes para la misma persona dentro de un club.';

COMMIT;

BEGIN;

-- Avoid assigning a role belonging to a different tenant.
ALTER TABLE miclub.roles
  ADD CONSTRAINT roles_id_club_unique UNIQUE (id, club_id);
ALTER TABLE miclub.user_club_memberships
  DROP CONSTRAINT IF EXISTS user_club_memberships_role_id_fkey,
  ADD CONSTRAINT user_club_memberships_role_club_fkey
    FOREIGN KEY (role_id, club_id) REFERENCES miclub.roles(id, club_id);

CREATE TRIGGER trg_user_club_memberships_updated_at
  BEFORE UPDATE ON miclub.user_club_memberships
  FOR EACH ROW EXECUTE FUNCTION miclub.touch_updated_at();

-- Import errors must always refer to a batch in the same club.
ALTER TABLE miclub.import_batches
  ADD CONSTRAINT import_batches_id_club_unique UNIQUE (id, club_id);
ALTER TABLE miclub.import_errors
  DROP CONSTRAINT IF EXISTS import_errors_batch_id_fkey,
  ADD CONSTRAINT import_errors_batch_club_fkey
    FOREIGN KEY (batch_id, club_id) REFERENCES miclub.import_batches(id, club_id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT user_club_memberships_role_club_fkey ON miclub.user_club_memberships IS
  'Garantiza que el rol y la membresía pertenecen al mismo tenant.';
COMMENT ON CONSTRAINT import_errors_batch_club_fkey ON miclub.import_errors IS
  'Impide relacionar errores y lotes de importación de clubes distintos.';

COMMIT;

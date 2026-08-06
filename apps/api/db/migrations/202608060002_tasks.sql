CREATE TABLE IF NOT EXISTS miclub.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'PENDING',
  priority text NOT NULL DEFAULT 'NORMAL',
  due_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  created_by_membership_id uuid REFERENCES miclub.user_club_memberships(id) ON DELETE SET NULL,
  assigned_to_user_id uuid REFERENCES miclub.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE miclub.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE miclub.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE miclub.tasks DROP CONSTRAINT IF EXISTS tasks_completed_status_check;
ALTER TABLE miclub.tasks DROP CONSTRAINT IF EXISTS tasks_archived_status_check;
ALTER TABLE miclub.tasks DROP CONSTRAINT IF EXISTS tasks_title_not_blank_check;
UPDATE miclub.tasks SET status = upper(status), priority = upper(priority);
UPDATE miclub.tasks SET archived_at = coalesce(archived_at, now()), status = 'CANCELLED' WHERE status = 'ARCHIVED';
UPDATE miclub.tasks SET status = 'IN_PROGRESS' WHERE status = 'BLOCKED';
ALTER TABLE miclub.tasks ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE miclub.tasks ALTER COLUMN priority SET DEFAULT 'NORMAL';
ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED'));
ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'));
ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_title_not_blank_check CHECK (btrim(title) <> '');
ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_completed_status_check CHECK (completed_at IS NULL OR status = 'COMPLETED');
CREATE INDEX IF NOT EXISTS tasks_club_active_idx ON miclub.tasks (club_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_club_due_idx ON miclub.tasks (club_id, due_at) WHERE archived_at IS NULL AND due_at IS NOT NULL;

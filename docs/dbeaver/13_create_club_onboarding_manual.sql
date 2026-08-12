/* Manual DBeaver script. Review the transaction and COMMIT explicitly. */
BEGIN;

CREATE TABLE IF NOT EXISTS miclub.club_onboarding (
  club_id uuid PRIMARY KEY REFERENCES miclub.clubs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NOT_STARTED',
  current_step smallint NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_onboarding_status_check CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
  CONSTRAINT club_onboarding_current_step_check CHECK (current_step BETWEEN 1 AND 7)
);

-- Preserve settings.onboarding. Only copy clubs which actually have that key.
INSERT INTO miclub.club_onboarding (club_id, status, current_step, started_at, completed_at)
SELECT c.id,
  CASE
    WHEN upper(coalesce(c.settings->'onboarding'->>'status', c.settings->>'onboarding')) IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')
      THEN upper(coalesce(c.settings->'onboarding'->>'status', c.settings->>'onboarding'))
    ELSE 'NOT_STARTED'
  END,
  greatest(1, least(7, CASE
    WHEN coalesce(c.settings->'onboarding'->>'currentStep', c.settings->'onboarding'->>'current_step') ~ '^[0-9]+$'
      THEN coalesce(c.settings->'onboarding'->>'currentStep', c.settings->'onboarding'->>'current_step')::integer
    ELSE 1 END)),
  CASE WHEN upper(coalesce(c.settings->'onboarding'->>'status', c.settings->>'onboarding')) IN ('IN_PROGRESS','COMPLETED') THEN now() END,
  CASE WHEN upper(coalesce(c.settings->'onboarding'->>'status', c.settings->>'onboarding')) = 'COMPLETED' THEN now() END
FROM miclub.clubs c
WHERE c.settings ? 'onboarding'
ON CONFLICT (club_id) DO NOTHING;

-- Onboarding is a Director/owner capability. Do not add either permission to
-- worker/instructor/sector-operator memberships.
UPDATE miclub.user_club_memberships membership
SET permissions = array_cat(
    array_remove(array_remove(coalesce(membership.permissions, '{}'::text[]), 'onboarding.read'), 'onboarding.write'),
    ARRAY['onboarding.read', 'onboarding.write']::text[]
  ),
  updated_at = now()
FROM miclub.roles role
WHERE role.id = membership.role_id AND role.club_id = membership.club_id
  AND lower(role.code) IN ('owner','director','admin')
  AND NOT (
    'onboarding.read' = ANY(coalesce(membership.permissions, '{}'::text[]))
    AND 'onboarding.write' = ANY(coalesce(membership.permissions, '{}'::text[]))
  );

COMMIT;

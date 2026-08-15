/* Run as the database migration login, which must be allowed to SET ROLE
   miclub_runtime. Every deliberate query omits a club_id predicate. */
BEGIN;
SET LOCAL ROLE miclub_runtime;

-- With no tenant setting, fail closed even when data exists.
DO $missing_tenant$
DECLARE table_name text; visible_rows bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'people', 'club_memberships', 'user_club_memberships', 'movements',
    'enrollments', 'activities', 'crm_message_templates',
    'crm_message_history', 'import_batches', 'import_errors', 'xlsx_import_rows'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM miclub.%I', table_name) INTO visible_rows;
    IF visible_rows <> 0 THEN
      RAISE EXCEPTION 'RLS FAILURE: miclub.% exposed % rows without app.club_id', table_name, visible_rows;
    END IF;
  END LOOP;
END
$missing_tenant$;

-- A syntactically valid but unknown tenant must also expose nothing.
SELECT set_config('app.club_id', '00000000-0000-4000-8000-000000000000', true);
DO $unknown_tenant$
BEGIN
  IF EXISTS (SELECT FROM miclub.people) OR EXISTS (SELECT FROM miclub.movements) THEN
    RAISE EXCEPTION 'RLS FAILURE: an unknown tenant observed rows';
  END IF;
END
$unknown_tenant$;

ROLLBACK;

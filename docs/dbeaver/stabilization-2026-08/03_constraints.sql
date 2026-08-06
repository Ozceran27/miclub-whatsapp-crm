/* DBeaver/manual | PostgreSQL >=14 | DB: miclub_gestion | schema: miclub
 Order: 03. Estimated add <1 min, validation 1-5 min/table; brief SHARE UPDATE EXCLUSIVE locks.
 CHECKs are installed NOT VALID first; validation is deliberately separate. */
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='2min';
DO $apply$
BEGIN
 IF to_regclass('miclub.tasks') IS NULL OR to_regclass('miclub.activities') IS NULL OR to_regclass('miclub.sectors') IS NULL
 THEN RAISE EXCEPTION 'required tables are absent'; END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.tasks'::regclass AND conname='tasks_title_nonblank_chk') THEN
  ALTER TABLE miclub.tasks ADD CONSTRAINT tasks_title_nonblank_chk CHECK (btrim(title) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.activities'::regclass AND conname='activities_name_nonblank_chk') THEN
  ALTER TABLE miclub.activities ADD CONSTRAINT activities_name_nonblank_chk CHECK (btrim(name) <> '') NOT VALID;
 END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_name_nonblank_chk') THEN
  ALTER TABLE miclub.sectors ADD CONSTRAINT sectors_name_nonblank_chk CHECK (btrim(name) <> '') NOT VALID;
 END IF;
END $apply$;
COMMIT;

-- Separate validation phase: each statement may be retried independently after a lock timeout.
SET lock_timeout='5s'; SET statement_timeout='10min';
DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.tasks'::regclass AND conname='tasks_title_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.tasks VALIDATE CONSTRAINT tasks_title_nonblank_chk; END IF;
END $validate$;
DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.activities'::regclass AND conname='activities_name_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.activities VALIDATE CONSTRAINT activities_name_nonblank_chk; END IF;
END $validate$;
DO $validate$ BEGIN
 IF EXISTS (SELECT FROM pg_constraint WHERE conrelid='miclub.sectors'::regclass AND conname='sectors_name_nonblank_chk' AND NOT convalidated)
 THEN ALTER TABLE miclub.sectors VALIDATE CONSTRAINT sectors_name_nonblank_chk; END IF;
END $validate$;

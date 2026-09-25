-- Categories identify the business concept. The movement_type identifies cash direction.
-- Preserve catalog/category IDs and every historical movement association.
DO $$ BEGIN
  IF to_regclass('miclub.movement_categories') IS NULL OR to_regclass('miclub.category_catalog') IS NULL THEN
    RAISE EXCEPTION 'The canonical movement category catalog is required';
  END IF;
END $$;

ALTER TABLE miclub.movement_categories ALTER COLUMN direction DROP NOT NULL;

UPDATE miclub.movement_categories
SET direction = NULL
WHERE is_active AND direction IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM miclub.movement_categories category
    WHERE category.is_active AND category.direction IS NOT NULL
  ) THEN RAISE EXCEPTION 'An active category still has a fixed direction'; END IF;
END $$;

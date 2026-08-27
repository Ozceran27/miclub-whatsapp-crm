-- Sector identity is independent from the optional template used to create it.
ALTER TABLE miclub.sectors ADD COLUMN IF NOT EXISTS icon_key text;

UPDATE miclub.sectors s
SET icon_key = CASE s.code
  WHEN 'administracion' THEN 'administration'
  WHEN 'tesoreria' THEN 'treasury'
  WHEN 'areas-comunes' THEN 'social-hall'
  ELSE coalesce(t.icon_key, 'other')
END
FROM (SELECT s2.id, st.icon_key FROM miclub.sectors s2 LEFT JOIN miclub.sector_templates st ON st.id=s2.template_id) t
WHERE t.id=s.id AND nullif(btrim(s.icon_key),'') IS NULL;

ALTER TABLE miclub.sectors ALTER COLUMN icon_key SET DEFAULT 'other';
UPDATE miclub.sectors SET icon_key='other' WHERE nullif(btrim(icon_key),'') IS NULL;
ALTER TABLE miclub.sectors ALTER COLUMN icon_key SET NOT NULL;

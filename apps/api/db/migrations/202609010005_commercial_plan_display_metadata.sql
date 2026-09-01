-- Display copy belongs to the canonical plan catalog. Keeping it here avoids
-- clients inventing commercial promises or prices independently.
ALTER TABLE miclub.plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS highlighted_features text[],
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cta_text text,
  ADD COLUMN IF NOT EXISTS price_label text;

UPDATE miclub.plans SET
  description=metadata.description,
  target_audience=metadata.target_audience,
  highlighted_features=metadata.highlighted_features,
  display_order=metadata.display_order,
  recommended=metadata.recommended,
  cta_text=metadata.cta_text,
  price_label='Precio próximamente'
FROM (VALUES
  ('FREE','Empezá a organizar tu institución y completá el onboarding.','Clubes que quieren conocer miClub.',ARRAY['Onboarding completo','Configuración inicial del club','Sin importación de datos'],1,false,'Continuar con Free'),
  ('SOCIAL','Centralizá la gestión cotidiana y probá la migración de datos.','Clubes sociales y equipos en crecimiento.',ARRAY['Todo lo necesario para comenzar','Migración desde XLSX','Acceso de prueba en sandbox'],2,false,'Probar Social'),
  ('COMPLEX','Coordiná una operación con más sectores, actividades y responsables.','Complejos deportivos con operación diversa.',ARRAY['Gestión para múltiples áreas','Migración desde XLSX','Acceso de prueba en sandbox'],3,true,'Probar Complex'),
  ('CLUB','Prepará una gestión integral para una institución de mayor escala.','Clubes con una estructura amplia.',ARRAY['Gestión institucional integral','Migración desde XLSX','Acceso de prueba en sandbox'],4,false,'Probar Club')
) AS metadata(code,description,target_audience,highlighted_features,display_order,recommended,cta_text)
WHERE miclub.plans.code=metadata.code;

ALTER TABLE miclub.plans DROP CONSTRAINT IF EXISTS plans_catalog_display_metadata_check;
ALTER TABLE miclub.plans ADD CONSTRAINT plans_catalog_display_metadata_check CHECK
  (catalog_status<>'catalog' OR (
    description IS NOT NULL AND length(description) BETWEEN 1 AND 240 AND
    target_audience IS NOT NULL AND length(target_audience) BETWEEN 1 AND 160 AND
    highlighted_features IS NOT NULL AND cardinality(highlighted_features) BETWEEN 1 AND 6 AND
    display_order IS NOT NULL AND display_order > 0 AND
    cta_text IS NOT NULL AND length(cta_text) BETWEEN 1 AND 80 AND
    price_label IS NOT NULL AND length(price_label) BETWEEN 1 AND 80));

CREATE UNIQUE INDEX IF NOT EXISTS plans_catalog_display_order_idx
  ON miclub.plans(display_order) WHERE catalog_status='catalog';

COMMENT ON COLUMN miclub.plans.price_label IS
  'Display-only catalog label; it is deliberately not a price or billing amount.';

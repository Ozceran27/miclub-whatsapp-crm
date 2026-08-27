/* Diagnóstico previo al despliegue de navegación por sectores.
   Solo lectura: no crea tipos, etiquetas ni modifica columnas o filas. */

-- Etiquetas efectivamente instaladas y su orden en miclub.entity_status.
SELECT namespace.nspname AS type_schema,
       enum_type.typname AS type_name,
       enum_value.enumsortorder AS sort_order,
       enum_value.enumlabel AS enum_label
FROM pg_type enum_type
JOIN pg_namespace namespace ON namespace.oid = enum_type.typnamespace
JOIN pg_enum enum_value ON enum_value.enumtypid = enum_type.oid
WHERE namespace.nspname = 'miclub'
  AND enum_type.typname = 'entity_status'
ORDER BY enum_value.enumsortorder;

-- Tipos reales de las columnas auditadas. udt_* identifica el enum subyacente.
SELECT table_schema,
       table_name,
       column_name,
       data_type,
       udt_schema,
       udt_name,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'miclub'
  AND (table_name, column_name) IN (
    ('sectors', 'status'),
    ('sectors', 'operational_status'),
    ('activities', 'status')
  )
ORDER BY table_name, column_name;

-- Distribución textual, incluida la ausencia de estado, sin coaccionar literales al enum.
SELECT 'sectors.operational_status' AS source,
       operational_status::text AS persisted_label,
       count(*) AS row_count
FROM miclub.sectors
GROUP BY operational_status::text
UNION ALL
SELECT 'sectors.status', status::text, count(*)
FROM miclub.sectors
GROUP BY status::text
UNION ALL
SELECT 'activities.status', status::text, count(*)
FROM miclub.activities
GROUP BY status::text
ORDER BY source, persisted_label NULLS FIRST;

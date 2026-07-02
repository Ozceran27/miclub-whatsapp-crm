-- Evita que una importación posterior vuelva a dejar en 0 las comisiones EC de AULA.
-- La causa raíz era que el upsert genérico de actividades escribía club_commission_percent=0
-- para cada fila de socio y corría después de leer las comisiones de AULA.
-- Se recalculan desde el último snapshot importado de AULA!B18:V30 para no hardcodear la planilla.

with latest_snapshot as (
  select source_payload
  from miclub.sheet_metric_snapshots
  where metric_key = 'aula.average_commission'
    and source_range = 'AULA!B18:V30'
  order by captured_at desc
  limit 1
), aula_commissions as (
  select
    trim(regexp_replace(
      translate(lower(coalesce(row_data.row->>1, '')), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+',
      ' ',
      'g'
    )) as activity_name,
    greatest(0::numeric, least(1::numeric,
      case
        when nullif(regexp_replace(coalesce(row_data.row->>10, ''), '[^0-9,.-]', '', 'g'), '') is null then 0::numeric
        when position('%' in coalesce(row_data.row->>10, '')) > 0
          or replace(regexp_replace(coalesce(row_data.row->>10, ''), '[^0-9,.-]', '', 'g'), ',', '.')::numeric > 1
          then replace(regexp_replace(coalesce(row_data.row->>10, ''), '[^0-9,.-]', '', 'g'), ',', '.')::numeric / 100
        else replace(regexp_replace(coalesce(row_data.row->>10, ''), '[^0-9,.-]', '', 'g'), ',', '.')::numeric
      end
    )) as commission_rate
  from latest_snapshot
  cross join lateral jsonb_array_elements(coalesce(source_payload->'rows', '[]'::jsonb)) as row_data(row)
  where upper(coalesce(row_data.row->>0, '')) = 'EC'
)
update miclub.activities a
set club_commission_percent = c.commission_rate,
    updated_at = now()
from miclub.sectors s
join aula_commissions c on true
where s.id = a.sector_id
  and upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA'
  and c.activity_name <> ''
  and c.commission_rate > 0
  and trim(regexp_replace(
        translate(lower(coalesce(a.name, '')), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]+',
        ' ',
        'g'
      )) = c.activity_name;

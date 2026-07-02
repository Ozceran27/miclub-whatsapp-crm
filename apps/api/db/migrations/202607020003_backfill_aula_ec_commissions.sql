-- Restaura los porcentajes EC de AULA usados por la planilla para calcular cuotas a cobrar.
-- La importación anterior dejaba club_commission_percent en 0, por eso AULA no aportaba a Cuotas a Cobrar.

with aula_commissions(activity_name, commission_rate) as (
  values
    ('arte ninos', 0.40::numeric),
    ('magia e ilusionismo', 0.40::numeric),
    ('arte adultos', 0.40::numeric)
)
update miclub.activities a
set club_commission_percent = c.commission_rate,
    updated_at = now()
from miclub.sectors s
join aula_commissions c on true
where s.id = a.sector_id
  and upper(regexp_replace(coalesce(s.code, s.name, ''), '[^[:alnum:]]+', '_', 'g')) = 'AULA'
  and trim(regexp_replace(
        translate(lower(coalesce(a.name, '')), 'áéíóúüñ', 'aeiouun'),
        '[^a-z0-9]+',
        ' ',
        'g'
      )) = c.activity_name;

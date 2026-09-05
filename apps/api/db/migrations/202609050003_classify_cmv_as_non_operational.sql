-- Corrige CMV hacia adelante para bases que ya aplicaron catálogos anteriores.
-- No modifica movimientos ni importes: sólo el catálogo y sus categorías tenant.
begin;

update miclub.category_catalog
set classification = 'NON_OPERATIONAL', updated_at = now()
where code = 'CMV';

-- Conserva los ids tenant (y por ende todas sus referencias históricas). Vincula
-- además las variantes legacy identificables por nombre normalizado. `name` está
-- presente en todos los esquemas conocidos; `code` sólo existe en algunos.
with cmv_catalog as (
  select id from miclub.category_catalog where code = 'CMV'
)
update miclub.movement_categories mc
set catalog_id = cmv_catalog.id,
    direction = 'EGRESOS'::miclub.movement_type
from cmv_catalog
where mc.catalog_id = cmv_catalog.id
   or (
     mc.catalog_id is null
     and upper(regexp_replace(regexp_replace(translate(trim(mc.name), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\s+', ' ', 'g'), '\.+$', '', 'g')) = 'CMV'
   );

-- Algunas instalaciones creadas desde el bootstrap antiguo conservan `code`.
-- SQL dinámico evita que PostgreSQL intente resolver mc.code cuando la columna
-- no existe, que es el esquema habitual de las bases alineadas/importadas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'miclub'
      and table_name = 'movement_categories'
      and column_name = 'code'
  ) then
    execute $cmv_code$
      update miclub.movement_categories mc
      set catalog_id = cc.id,
          direction = 'EGRESOS'::miclub.movement_type
      from miclub.category_catalog cc
      where cc.code = 'CMV'
        and mc.catalog_id is null
        and upper(regexp_replace(regexp_replace(translate(trim(coalesce(mc.code, '')), 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), '\s+', ' ', 'g'), '\.+$', '', 'g')) = 'CMV'
    $cmv_code$;
  end if;
end $$;

-- Mantiene el alias de importación apuntando a la fila canónica.
insert into miclub.category_import_aliases(normalized_alias, catalog_id)
select 'CMV', id from miclub.category_catalog where code = 'CMV'
on conflict (normalized_alias) do update set catalog_id = excluded.catalog_id;

do $$
begin
  if not exists (
    select 1 from miclub.category_catalog
    where code = 'CMV' and classification = 'NON_OPERATIONAL'
  ) then
    raise exception 'CMV debe existir con clasificación NON_OPERATIONAL';
  end if;
end $$;

commit;

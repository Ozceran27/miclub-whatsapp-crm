-- Corrige y cierra el catálogo publicado por 202608130003 sin reescribir historia.
begin;

insert into miclub.category_catalog(code, display_name, classification, is_active, display_order) values
  ('SERVICIOS', 'Servicios', 'SERVICE', true, 320),
  ('CAPITAL_INICIAL', 'Capital inicial', 'NON_OPERATIONAL', true, 330)
on conflict (code) do update set
  display_name = excluded.display_name,
  classification = excluded.classification,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  updated_at = now();

update miclub.category_catalog
set classification = case code
  when 'SALARIOS' then 'OPERATIONAL'
  when 'CMV' then 'OPERATIONAL'
  when 'DEUDAS' then 'LIABILITY'
end, updated_at = now()
where code in ('SALARIOS', 'CMV', 'DEUDAS');

create table if not exists miclub.category_import_aliases (
  normalized_alias text primary key check (normalized_alias = upper(normalized_alias)),
  catalog_id uuid not null references miclub.category_catalog(id) on delete restrict,
  created_at timestamptz not null default now()
);

insert into miclub.category_import_aliases(normalized_alias, catalog_id)
select alias, cc.id
from (values
  ('MANTENIM', 'MANTENIMIENTO'), ('MANTENIM.', 'MANTENIMIENTO'),
  ('DEUDA', 'DEUDAS'), ('DEUDAS', 'DEUDAS'),
  ('SUELDOS', 'SALARIOS'), ('SALARIO', 'SALARIOS'),
  ('INSCRIPCIÓN', 'INSCRIPCION'), ('COMISIÓN', 'COMISION'),
  ('DEPÓSITOS', 'DEPOSITOS'), ('DÓLARES', 'DOLARES'),
  ('PÉRDIDA', 'PERDIDA'), ('VIÁTICOS', 'VIATICOS'),
  ('LIBRERÍA', 'LIBRERIA'), ('CAPITAL INICIAL', 'CAPITAL_INICIAL'),
  ('IMPUESTO', 'IMPUESTOS')
) a(alias, code)
join miclub.category_catalog cc on cc.code = a.code
on conflict (normalized_alias) do update set catalog_id = excluded.catalog_id;

-- Primero resuelve aliases; después, códigos exactos. No crea categorías tenant nuevas.
update miclub.movement_categories mc set catalog_id = cia.catalog_id
from miclub.category_import_aliases cia
where mc.catalog_id is null and cia.normalized_alias = upper(trim(mc.name));
update miclub.movement_categories mc set catalog_id = cc.id
from miclub.category_catalog cc
where mc.catalog_id is null and cc.code = replace(upper(trim(mc.name)), ' ', '_');

create or replace function miclub.require_movement_category_catalog()
returns trigger language plpgsql as $$
begin
  if new.catalog_id is null then
    raise exception 'Las categorías nuevas requieren catalog_id canónico';
  end if;
  return new;
end $$;

drop trigger if exists movement_categories_require_catalog_on_insert on miclub.movement_categories;
create trigger movement_categories_require_catalog_on_insert
before insert on miclub.movement_categories
for each row execute function miclub.require_movement_category_catalog();

create or replace view miclub.v_legacy_movement_categories as
select mc.club_id, mc.id, mc.name, mc.created_at
from miclub.movement_categories mc
where mc.catalog_id is null;

do $$
declare actual_codes text[];
begin
  select array_agg(code order by display_order) into actual_codes from miclub.category_catalog;
  if actual_codes <> array[
    'INSCRIPCION','CUOTA','TURNOS','COMISION','ALQUILER','EVENTOS','VENTAS','CLASES','CURSOS','KIOSCO','BEBIDAS',
    'PUBLICIDAD','SALARIOS','MANTENIMIENTO','DEPOSITOS','EXTRACCIONES','DOLARES','REPARACIONES','VIATICOS','GANANCIA',
    'PERDIDA','CMV','SEGUROS','LIMPIEZA','LIBRERIA','OTROS','IMPUESTOS','LUZ','AGUA','INTERNET','DEUDAS','SERVICIOS','CAPITAL_INICIAL'
  ]::text[] then raise exception 'Códigos canónicos inesperados: %', actual_codes; end if;
end $$;

commit;

-- Catálogo económico global. Ejecutable en DBeaver dentro de una transacción.
-- Diagnóstico/decisión: movement_categories no puede hacerse global in-place cuando
-- existen club_id, referencias históricas o códigos/nombres divergentes entre clubes.
-- Se conserva como tabla de compatibilidad y cada fila apunta al catálogo global.
begin;

select
  exists (select 1 from information_schema.columns where table_schema='miclub' and table_name='movement_categories' and column_name='club_id') as is_tenant_scoped,
  (select count(distinct club_id) from miclub.movement_categories) as clubs_with_categories,
  (select count(*) from miclub.movements where category_id is not null) as historical_references,
  (select count(*) from (select upper(regexp_replace(translate(trim(name),'áéíóúÁÉÍÓÚ','aeiouAEIOU'),'\\.+$','')) from miclub.movement_categories group by 1 having count(distinct club_id)>1) x) as shared_labels;

create table if not exists miclub.category_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_]+$'),
  display_name text not null,
  classification text not null check (classification in ('OPERATIONAL','NON_OPERATIONAL','TAX','SERVICE','LIABILITY')),
  is_active boolean not null default true,
  display_order integer not null unique check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into miclub.category_catalog(code,display_name,classification,is_active,display_order) values
('INSCRIPCION','Inscripción','OPERATIONAL',true,10),('CUOTA','Cuota','OPERATIONAL',true,20),('TURNOS','Turnos','OPERATIONAL',true,30),
('COMISION','Comisión','OPERATIONAL',true,40),('ALQUILER','Alquiler','OPERATIONAL',true,50),('EVENTOS','Eventos','OPERATIONAL',true,60),
('VENTAS','Ventas','OPERATIONAL',true,70),('CLASES','Clases','OPERATIONAL',true,80),('CURSOS','Cursos','OPERATIONAL',true,90),
('KIOSCO','Kiosco','OPERATIONAL',true,100),('BEBIDAS','Bebidas','OPERATIONAL',true,110),
('PUBLICIDAD','Publicidad','NON_OPERATIONAL',true,120),('SALARIOS','Salarios','NON_OPERATIONAL',true,130),('MANTENIMIENTO','Mantenimiento','NON_OPERATIONAL',true,140),
('DEPOSITOS','Depósitos','NON_OPERATIONAL',true,150),('EXTRACCIONES','Extracciones','NON_OPERATIONAL',true,160),('DOLARES','Dólares','NON_OPERATIONAL',true,170),
('REPARACIONES','Reparaciones','NON_OPERATIONAL',true,180),('VIATICOS','Viáticos','NON_OPERATIONAL',true,190),('GANANCIA','Ganancia','NON_OPERATIONAL',true,200),
('PERDIDA','Pérdida','NON_OPERATIONAL',true,210),('CMV','CMV','NON_OPERATIONAL',true,220),('SEGUROS','Seguros','NON_OPERATIONAL',true,230),
('LIMPIEZA','Limpieza','NON_OPERATIONAL',true,240),('LIBRERIA','Librería','NON_OPERATIONAL',true,250),('OTROS','Otros','NON_OPERATIONAL',true,260),
('IMPUESTOS','Impuestos','TAX',true,270),('LUZ','Luz','SERVICE',true,280),('AGUA','Agua','SERVICE',true,290),
('INTERNET','Internet','SERVICE',true,300),('DEUDAS','Deudas','LIABILITY',true,310)
on conflict (code) do update set display_name=excluded.display_name,classification=excluded.classification,is_active=excluded.is_active,display_order=excluded.display_order,updated_at=now();

do $$ begin
 if (select count(*) from miclub.category_catalog) <> 31 then raise exception 'El catálogo debe contener exactamente 31 categorías aprobadas'; end if;
end $$;

alter table miclub.movement_categories add column if not exists catalog_id uuid;
update miclub.movement_categories mc set catalog_id=cc.id
from miclub.category_catalog cc
where mc.catalog_id is null and cc.code = case
  when upper(regexp_replace(translate(trim(mc.name),'áéíóúÁÉÍÓÚ','aeiouAEIOU'),'\\.+$','')) in ('MANTENIM','MANTENIMIENTO') then 'MANTENIMIENTO'
  when upper(regexp_replace(translate(trim(mc.name),'áéíóúÁÉÍÓÚ','aeiouAEIOU'),'\\.+$','')) in ('IMPUESTO','IMPUESTOS') then 'IMPUESTOS'
  when upper(regexp_replace(translate(trim(mc.name),'áéíóúÁÉÍÓÚ','aeiouAEIOU'),'\\.+$','')) in ('DEUDA','DEUDAS') then 'DEUDAS'
  else upper(regexp_replace(translate(trim(mc.name),'áéíóúÁÉÍÓÚ','aeiouAEIOU'),'\\.+$','')) end;

-- No se borra ni reasigna ninguna referencia histórica: las filas incompatibles quedan
-- visibles en este diagnóstico y deben mapearse explícitamente antes de NOT NULL.
select mc.club_id,mc.id,mc.name from miclub.movement_categories mc where mc.catalog_id is null order by mc.club_id,mc.name;
create index if not exists movement_categories_catalog_id_idx on miclub.movement_categories(catalog_id);
do $$ begin
 if not exists (select 1 from pg_constraint where conname='movement_categories_catalog_id_fkey') then
  alter table miclub.movement_categories add constraint movement_categories_catalog_id_fkey foreign key(catalog_id) references miclub.category_catalog(id);
 end if;
end $$;

commit;

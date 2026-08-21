-- Sincroniza el catálogo de producto sin borrar categorías ni referencias históricas.
begin;

-- Libera los órdenes publicados antes de aplicar el manifiesto estable. Las filas
-- fuera del producto se conservan, pero dejan de estar disponibles para altas.
update miclub.category_catalog
set display_order = display_order * 1000, is_active = false, updated_at = now();

insert into miclub.category_catalog(code, display_name, classification, is_active, display_order) values
('INSCRIPCION','Inscripción','OPERATIONAL',true,10),('CUOTA','Cuota','OPERATIONAL',true,20),('TURNOS','Turnos','OPERATIONAL',true,30),
('COMISION','Comisión','OPERATIONAL',true,40),('ALQUILER','Alquiler','OPERATIONAL',true,50),('EVENTOS','Eventos','OPERATIONAL',true,60),
('VENTAS','Ventas','OPERATIONAL',true,70),('CLASES','Clases','OPERATIONAL',true,80),('CURSOS','Cursos','OPERATIONAL',true,90),
('KIOSCO','Kiosco','OPERATIONAL',true,100),('BEBIDAS','Bebidas','OPERATIONAL',true,110),('PUBLICIDAD','Publicidad','NON_OPERATIONAL',true,120),
('SALARIOS','Salarios','OPERATIONAL',true,130),('MANTENIMIENTO','Mantenimiento','NON_OPERATIONAL',true,140),
('DEPOSITOS','Depósitos','NON_OPERATIONAL',true,150),('EXTRACCIONES','Extracciones','NON_OPERATIONAL',true,160),
('DOLARES','Dólares','NON_OPERATIONAL',true,170),('REPARACIONES','Reparaciones','NON_OPERATIONAL',true,180),
('VIATICOS','Viáticos','NON_OPERATIONAL',true,190),('GANANCIA','Ganancia','NON_OPERATIONAL',true,200),
('PERDIDA','Pérdida','NON_OPERATIONAL',true,210),('CMV','CMV','OPERATIONAL',true,220),('SEGUROS','Seguros','NON_OPERATIONAL',true,230),
('LIMPIEZA','Limpieza','NON_OPERATIONAL',true,240),('LIBRERIA','Librería','NON_OPERATIONAL',true,250),('OTROS','Otros','NON_OPERATIONAL',true,260),
('IMPUESTOS','Impuestos','TAX',true,270),('LUZ','Luz','SERVICE',true,280),('AGUA','Agua','SERVICE',true,290),
('INTERNET','Internet','SERVICE',true,300),('DEUDAS','Deudas','LIABILITY',true,310),('SERVICIOS','Servicios','SERVICE',true,320),
('CAPITAL_INICIAL','Capital inicial','NON_OPERATIONAL',true,330)
on conflict (code) do update set display_name=excluded.display_name, classification=excluded.classification,
  is_active=true, display_order=excluded.display_order, updated_at=now();

-- Todo código y etiqueta de producto también es una clave válida de importación.
insert into miclub.category_import_aliases(normalized_alias, catalog_id)
select alias, id from (
  select code as alias, id from miclub.category_catalog where is_active
  union
  select upper(display_name) as alias, id from miclub.category_catalog where is_active
) canonical
on conflict (normalized_alias) do update set catalog_id=excluded.catalog_id;

insert into miclub.category_import_aliases(normalized_alias, catalog_id)
select alias, cc.id from (values
 ('MANTENIM','MANTENIMIENTO'),('MANTENIM.','MANTENIMIENTO'),('IMPUESTO','IMPUESTOS'),
 ('DEUDA','DEUDAS'),('SUELDOS','SALARIOS'),('SALARIO','SALARIOS'),('CAPITAL','CAPITAL_INICIAL')
) a(alias, code) join miclub.category_catalog cc on cc.code=a.code
on conflict (normalized_alias) do update set catalog_id=excluded.catalog_id;

-- Algunas bases fueron creadas por el flujo de alineación legacy, donde
-- movement_categories no incorporó direction aunque el enum sí existe. La
-- columna es nullable para preservar filas históricas aún no catalogadas.
alter table miclub.movement_categories
  add column if not exists direction miclub.movement_type;

-- Aprovisiona también los tenants existentes. El conflicto conserva el id de la
-- categoría (y por lo tanto sus movimientos), actualizando sólo datos de catálogo.
insert into miclub.movement_categories(club_id, name, direction, is_active, catalog_id)
select club.id, cc.display_name, product.direction::miclub.movement_type, true, cc.id
from miclub.clubs club
cross join (values
 ('INSCRIPCION','INGRESOS'),('CUOTA','INGRESOS'),('TURNOS','INGRESOS'),('COMISION','INGRESOS'),('ALQUILER','INGRESOS'),
 ('EVENTOS','INGRESOS'),('VENTAS','INGRESOS'),('CLASES','INGRESOS'),('CURSOS','INGRESOS'),('KIOSCO','INGRESOS'),('BEBIDAS','INGRESOS'),
 ('PUBLICIDAD','EGRESOS'),('SALARIOS','EGRESOS'),('MANTENIMIENTO','EGRESOS'),('DEPOSITOS','INGRESOS'),('EXTRACCIONES','EGRESOS'),
 ('DOLARES','EGRESOS'),('REPARACIONES','EGRESOS'),('VIATICOS','EGRESOS'),('GANANCIA','INGRESOS'),('PERDIDA','EGRESOS'),
 ('CMV','EGRESOS'),('SEGUROS','EGRESOS'),('LIMPIEZA','EGRESOS'),('LIBRERIA','EGRESOS'),('OTROS','EGRESOS'),
 ('IMPUESTOS','EGRESOS'),('LUZ','EGRESOS'),('AGUA','EGRESOS'),('INTERNET','EGRESOS'),('DEUDAS','EGRESOS'),
 ('SERVICIOS','EGRESOS'),('CAPITAL_INICIAL','INGRESOS')
) product(code,direction)
join miclub.category_catalog cc on cc.code=product.code and cc.is_active
on conflict (club_id, upper(trim(name))) do update set catalog_id=excluded.catalog_id,
  direction=excluded.direction, is_active=true;

-- Las categorías históricas ajenas al producto siguen referenciables, pero no se
-- ofrecen para movimientos nuevos ni para resolver filas XLSX nuevas.
update miclub.movement_categories mc set is_active=false
where mc.catalog_id is null
   or exists (select 1 from miclub.category_catalog cc where cc.id=mc.catalog_id and not cc.is_active);

commit;

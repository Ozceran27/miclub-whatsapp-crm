-- Sincroniza el catálogo visual compartido antes de aceptar nuevas actividades.
ALTER TABLE miclub.activity_icon_catalog
  ADD COLUMN IF NOT EXISTS glyph text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Libera temporalmente el índice único para poder asignar el orden canónico.
UPDATE miclub.activity_icon_catalog SET sort_order = sort_order + 1000;

INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, glyph, category, sort_order, active) VALUES
 ('football','Fútbol','⚽','Deportes',1,true),
 ('basketball','Básquet','🏀','Deportes',2,true),
 ('volleyball','Vóley','🏐','Deportes',3,true),
 ('rugby','Rugby','🏉','Deportes',4,true),
 ('tennis','Tenis','🎾','Deportes',5,true),
 ('table-tennis','Tenis de mesa','🏓','Deportes',6,true),
 ('badminton','Bádminton','🏸','Deportes',7,true),
 ('hockey','Hockey','🏑','Deportes',8,true),
 ('ice-hockey','Hockey sobre hielo','🏒','Deportes',9,true),
 ('boxing','Boxeo','🥊','Deportes',10,true),
 ('martial-arts','Artes marciales','🥋','Deportes',11,true),
 ('gymnastics','Gimnasia','🤸','Deportes',12,true),
 ('weights','Musculación','🏋️','Deportes',13,true),
 ('handball','Handball','🤾','Deportes',14,true),
 ('swimming','Natación','🏊','Deportes',15,true),
 ('water-polo','Waterpolo','🤽','Deportes',16,true),
 ('cycling','Ciclismo','🚴','Deportes',17,true),
 ('running','Running','🏃','Deportes',18,true),
 ('yoga','Yoga','🧘','Bienestar',19,true),
 ('dance','Danza','💃','Bienestar',20,true),
 ('skating','Patín','⛸️','Deportes',21,true),
 ('target','Tiro al blanco','🎯','Juegos',22,true),
 ('chess','Ajedrez','♟️','Juegos',23,true),
 ('archery','Arquería','🏹','Deportes',24,true),
 ('sales','Ventas','🛍️','Comercio',25,true),
 ('gastronomy','Gastronomía','🍽️','Comercio',26,true),
 ('services','Servicios','🛠️','Servicios',27,true),
 ('health','Salud','🩺','Bienestar',28,true),
 ('fitness','Fitness','💪','Bienestar',29,true),
 ('meditation','Meditación','🌿','Bienestar',30,true),
 ('music','Música','🎵','Cultura',31,true),
 ('theater','Teatro','🎭','Cultura',32,true),
 ('education','Educación','📚','Cultura',33,true),
 ('children','Infancias','🧒','Comunidad',34,true),
 ('social','Social','🤝','Comunidad',35,true),
 ('other','Otra actividad','✨','Otros',36,true)
ON CONFLICT (icon_key) DO UPDATE SET
  display_name=excluded.display_name, glyph=excluded.glyph, category=excluded.category,
  sort_order=excluded.sort_order, active=excluded.active;

-- `football` es canónico; se conserva un alias explícito y se corrigen datos guardados.
CREATE TABLE IF NOT EXISTS miclub.activity_icon_aliases (
  alias_key text PRIMARY KEY,
  icon_key text NOT NULL REFERENCES miclub.activity_icon_catalog(icon_key),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO miclub.activity_icon_aliases (alias_key, icon_key) VALUES ('soccer','football')
ON CONFLICT (alias_key) DO UPDATE SET icon_key=excluded.icon_key;
UPDATE miclub.activities SET icon_key='football' WHERE icon_key='soccer';

-- Las claves históricas siguen resolviendo FKs, pero dejan de estar disponibles para altas.
UPDATE miclub.activity_icon_catalog SET active=false
WHERE icon_key NOT IN (
 'football','basketball','volleyball','rugby','tennis','table-tennis','badminton','hockey','ice-hockey','boxing','martial-arts','gymnastics','weights','handball','swimming','water-polo','cycling','running','yoga','dance','skating','target','chess','archery','sales','gastronomy','services','health','fitness','meditation','music','theater','education','children','social','other'
);

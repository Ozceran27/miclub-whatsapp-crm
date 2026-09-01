-- Agrega las nuevas claves canónicas sin borrar las históricas que aún referencian actividades.
INSERT INTO miclub.activity_icon_catalog (icon_key, display_name, glyph, category, sort_order, active) VALUES
 ('baseball','Béisbol','⚾','Deportes',37,true), ('softball','Sóftbol','🥎','Deportes',38,true),
 ('golf','Golf','⛳','Deportes',39,true), ('cricket','Críquet','🏏','Deportes',40,true),
 ('surfing','Surf','🏄','Deportes',41,true), ('rowing','Remo','🚣','Deportes',42,true),
 ('climbing','Escalada','🧗','Deportes',43,true), ('skiing','Esquí','⛷️','Deportes',44,true),
 ('pilates','Pilates','🤸‍♀️','Bienestar',45,true), ('spa','Spa','💆','Bienestar',46,true),
 ('nutrition','Nutrición','🥗','Bienestar',47,true), ('therapy','Terapia','🧠','Bienestar',48,true),
 ('store','Tienda','🏪','Comercio',49,true), ('market','Mercado','🛒','Comercio',50,true),
 ('cafeteria','Cafetería','☕','Comercio',51,true), ('tickets','Entradas','🎟️','Comercio',52,true),
 ('maintenance','Mantenimiento','🔧','Servicios',53,true), ('transport','Transporte','🚌','Servicios',54,true),
 ('childcare','Cuidado infantil','🧸','Servicios',55,true), ('consulting','Consultoría','💼','Servicios',56,true),
 ('painting','Pintura','🎨','Cultura',57,true), ('photography','Fotografía','📷','Cultura',58,true),
 ('cinema','Cine','🎬','Cultura',59,true), ('writing','Escritura','✍️','Cultura',60,true)
ON CONFLICT (icon_key) DO UPDATE SET
 display_name=excluded.display_name, glyph=excluded.glyph, category=excluded.category,
 sort_order=excluded.sort_order, active=true;

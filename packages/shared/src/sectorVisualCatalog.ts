export type SectorIconCategory = "deportes" | "administracion" | "tesoreria" | "social" | "salud" | "mantenimiento" | "marketing" | "gastronomia" | "servicios";
export type SectorIconCatalogItem = Readonly<{ key: string; name: string; category: SectorIconCategory; glyph: string }>;

/** Stable persistence keys plus a presentation glyph. Glyphs are deliberately never identifiers. */
export const SECTOR_ICON_CATALOG: readonly SectorIconCatalogItem[] = [
  {key:"soccer",name:"Fútbol",category:"deportes",glyph:"⚽"},{key:"tennis",name:"Tenis",category:"deportes",glyph:"🎾"},{key:"basketball",name:"Básquet",category:"deportes",glyph:"🏀"},{key:"volleyball",name:"Vóley",category:"deportes",glyph:"🏐"},{key:"swimming",name:"Natación",category:"deportes",glyph:"🏊"},{key:"gym",name:"Gimnasio",category:"deportes",glyph:"🏋️"},{key:"running",name:"Atletismo",category:"deportes",glyph:"🏃"},{key:"hockey",name:"Hockey",category:"deportes",glyph:"🏑"},
  {key:"administration",name:"Administración",category:"administracion",glyph:"🏢"},{key:"documents",name:"Documentación",category:"administracion",glyph:"📋"},{key:"management",name:"Dirección",category:"administracion",glyph:"🗂️"},{key:"treasury",name:"Tesorería",category:"tesoreria",glyph:"💰"},{key:"billing",name:"Facturación",category:"tesoreria",glyph:"🧾"},{key:"cashier",name:"Caja",category:"tesoreria",glyph:"💳"},
  {key:"social-hall",name:"Salón social",category:"social",glyph:"🏛️"},{key:"events",name:"Eventos",category:"social",glyph:"🎉"},{key:"playground",name:"Juegos",category:"social",glyph:"🛝"},{key:"library",name:"Biblioteca",category:"social",glyph:"📚"},
  {key:"health",name:"Salud",category:"salud",glyph:"🩺"},{key:"first-aid",name:"Primeros auxilios",category:"salud",glyph:"⛑️"},{key:"wellness",name:"Bienestar",category:"salud",glyph:"🧘"},
  {key:"maintenance",name:"Mantenimiento",category:"mantenimiento",glyph:"🛠️"},{key:"cleaning",name:"Limpieza",category:"mantenimiento",glyph:"🧹"},{key:"gardening",name:"Jardinería",category:"mantenimiento",glyph:"🌿"},{key:"security",name:"Seguridad",category:"servicios",glyph:"🛡️"},
  {key:"marketing",name:"Marketing",category:"marketing",glyph:"📣"},{key:"communications",name:"Comunicaciones",category:"marketing",glyph:"📱"},{key:"press",name:"Prensa",category:"marketing",glyph:"📰"},
  {key:"restaurant",name:"Restaurante",category:"gastronomia",glyph:"🍽️"},{key:"cafe",name:"Cafetería",category:"gastronomia",glyph:"☕"},{key:"grill",name:"Parrilla",category:"gastronomia",glyph:"🔥"},{key:"bar",name:"Bar",category:"gastronomia",glyph:"🥤"},
  {key:"parking",name:"Estacionamiento",category:"servicios",glyph:"🅿️"},{key:"reception",name:"Recepción",category:"servicios",glyph:"🛎️"},{key:"transport",name:"Transporte",category:"servicios",glyph:"🚌"},{key:"other",name:"Otro sector",category:"servicios",glyph:"📍"},
] as const;

export const SECTOR_COLOR_PALETTE = [
  {hex:"#2563EB",name:"Azul"},{hex:"#047857",name:"Verde"},{hex:"#B45309",name:"Ámbar"},{hex:"#B91C1C",name:"Rojo"},
  {hex:"#7C3AED",name:"Violeta"},{hex:"#0E7490",name:"Cian"},{hex:"#BE185D",name:"Rosa"},{hex:"#C2410C",name:"Naranja"},
  {hex:"#4338CA",name:"Índigo"},{hex:"#3F6212",name:"Oliva"},{hex:"#9A6B00",name:"Dorado"},{hex:"#64748B",name:"Plateado"},
] as const;

export const DEFAULT_SECTOR_ICON_KEY = "other";
export const isSectorIconKey = (value: unknown): value is string => typeof value === "string" && SECTOR_ICON_CATALOG.some(icon => icon.key === value);
export const getSectorIcon = (key?: string | null) => SECTOR_ICON_CATALOG.find(icon => icon.key === key) ?? SECTOR_ICON_CATALOG.find(icon => icon.key === DEFAULT_SECTOR_ICON_KEY)!;

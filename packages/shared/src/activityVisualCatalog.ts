export type ActivityVisualCategory = "Deportes" | "Bienestar" | "Juegos" | "Comercio" | "Servicios" | "Cultura" | "Comunidad" | "Otros";
export type ActivityVisualCatalogItem = Readonly<{ key: string; glyph: string; name: string; category: ActivityVisualCategory }>;

/** Canonical persistence keys and their localized presentation metadata. */
export const ACTIVITY_VISUAL_CATALOG: readonly ActivityVisualCatalogItem[] = [
  {key:"football",glyph:"⚽",name:"Fútbol",category:"Deportes"},{key:"basketball",glyph:"🏀",name:"Básquet",category:"Deportes"},{key:"volleyball",glyph:"🏐",name:"Vóley",category:"Deportes"},{key:"rugby",glyph:"🏉",name:"Rugby",category:"Deportes"},
  {key:"tennis",glyph:"🎾",name:"Tenis",category:"Deportes"},{key:"table-tennis",glyph:"🏓",name:"Tenis de mesa",category:"Deportes"},{key:"badminton",glyph:"🏸",name:"Bádminton",category:"Deportes"},{key:"hockey",glyph:"🏑",name:"Hockey",category:"Deportes"},
  {key:"ice-hockey",glyph:"🏒",name:"Hockey sobre hielo",category:"Deportes"},{key:"boxing",glyph:"🥊",name:"Boxeo",category:"Deportes"},{key:"martial-arts",glyph:"🥋",name:"Artes marciales",category:"Deportes"},{key:"gymnastics",glyph:"🤸",name:"Gimnasia",category:"Deportes"},
  {key:"weights",glyph:"🏋️",name:"Musculación",category:"Deportes"},{key:"handball",glyph:"🤾",name:"Handball",category:"Deportes"},{key:"swimming",glyph:"🏊",name:"Natación",category:"Deportes"},{key:"water-polo",glyph:"🤽",name:"Waterpolo",category:"Deportes"},
  {key:"cycling",glyph:"🚴",name:"Ciclismo",category:"Deportes"},{key:"running",glyph:"🏃",name:"Running",category:"Deportes"},{key:"yoga",glyph:"🧘",name:"Yoga",category:"Bienestar"},{key:"dance",glyph:"💃",name:"Danza",category:"Bienestar"},
  {key:"skating",glyph:"⛸️",name:"Patín",category:"Deportes"},{key:"target",glyph:"🎯",name:"Tiro al blanco",category:"Juegos"},{key:"chess",glyph:"♟️",name:"Ajedrez",category:"Juegos"},{key:"archery",glyph:"🏹",name:"Arquería",category:"Deportes"},
  {key:"sales",glyph:"🛍️",name:"Ventas",category:"Comercio"},{key:"gastronomy",glyph:"🍽️",name:"Gastronomía",category:"Comercio"},{key:"services",glyph:"🛠️",name:"Servicios",category:"Servicios"},{key:"health",glyph:"🩺",name:"Salud",category:"Bienestar"},
  {key:"fitness",glyph:"💪",name:"Fitness",category:"Bienestar"},{key:"meditation",glyph:"🌿",name:"Meditación",category:"Bienestar"},{key:"music",glyph:"🎵",name:"Música",category:"Cultura"},{key:"theater",glyph:"🎭",name:"Teatro",category:"Cultura"},
  {key:"education",glyph:"📚",name:"Educación",category:"Cultura"},{key:"children",glyph:"🧒",name:"Infancias",category:"Comunidad"},{key:"social",glyph:"🤝",name:"Social",category:"Comunidad"},{key:"other",glyph:"✨",name:"Otra actividad",category:"Otros"},
] as const;

export const ACTIVITY_ICON_KEY_ALIASES: Readonly<Record<string, string>> = { soccer: "football" };
export const DEFAULT_ACTIVITY_ICON_KEY = "other";
export const normalizeActivityIconKey = (value: string): string => ACTIVITY_ICON_KEY_ALIASES[value] ?? value;
export const isActivityIconKey = (value: unknown): value is string => typeof value === "string" && ACTIVITY_VISUAL_CATALOG.some(item => item.key === value);
export const getActivityVisual = (key?: string | null) => ACTIVITY_VISUAL_CATALOG.find(item => item.key === normalizeActivityIconKey(key ?? DEFAULT_ACTIVITY_ICON_KEY)) ?? ACTIVITY_VISUAL_CATALOG.find(item => item.key === DEFAULT_ACTIVITY_ICON_KEY)!;

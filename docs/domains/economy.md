# Economía canónica

Las categorías provienen de `category_catalog` y de su asociación tenant `movement_categories`. Los porcentajes, montos fijos y condiciones se versionan en `activity_terms` (`effective_from`/`effective_to`); no deben codificarse por nombre de sector. Las liquidaciones relacionan `sector_id` y `activity_id` UUID con términos persistidos.

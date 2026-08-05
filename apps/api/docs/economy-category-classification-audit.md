# Auditoría de clasificación de categorías económicas

## Estado actual

`apps/api/src/services/economyDomain.ts` concentra hoy la clasificación de categorías económicas en arrays TypeScript. Debe mantenerse como fuente transitoria hasta que exista una migración versionada que agregue metadatos canónicos al catálogo persistido.

La tabla `miclub.movement_categories` es el catálogo canónico de nombres de categorías. No se debe modificar su semántica ni cargar nuevas clasificaciones directamente sin una migración versionada y revisable.

## Diagnóstico disponible

Ejecutar `apps/api/db/diagnostics/202608050001_movement_categories_columns.sql` contra la base destino para confirmar la forma real de `miclub.movement_categories` antes de diseñar cambios. El diagnóstico lista columnas, disponibilidad de campos de clasificación y restricciones, sin modificar datos ni esquema.

## Migración futura propuesta

Una migración versionada futura debería incorporar clasificación canónica con estos atributos mínimos:

- `operational_classification`: clasifica cada categoría como operativa, no operativa o sin clasificar.
- `direction`: expresa la dirección económica esperada cuando aplique, por ejemplo ingresos, egresos o ambas.
- `description`: documenta el criterio de negocio usado para clasificar la categoría.
- Disponibilidad por club: preservar `club_id` cuando el catálogo esté tenant-scoped y definir si ciertas categorías se habilitan/deshabilitan por club.

## Reglas hasta migrar

- No cambiar el catálogo canónico sin migración versionada.
- No inferir columnas inexistentes desde código de aplicación.
- Mantener los helpers de `economyDomain.ts` como compatibilidad transitoria y alinear su salida con la migración cuando el catálogo tenga metadatos persistidos.

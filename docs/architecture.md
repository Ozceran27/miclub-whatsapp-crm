# Arquitectura canónica

## Runtime productivo

React/Vite consume una API Express autenticada y multi-tenant. PostgreSQL es la única fuente operativa. El backend devuelve los módulos habilitados y el catálogo de sectores por UUID mediante `GET /api/modules/navigation`; el frontend no sintetiza nombres históricos.

`apps/api/src/legacy/` es una frontera de migración, no una capa productiva. La prueba `apps/api/src/architecture.test.ts` impide que rutas, servicios o repositorios productivos importen Google Sheets, SQLite o datos mock. Las migraciones SQL aplicadas son inmutables: cualquier evolución se agrega en un archivo nuevo y al manifiesto.

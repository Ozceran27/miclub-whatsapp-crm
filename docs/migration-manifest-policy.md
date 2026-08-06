# Política del manifiesto de migraciones

## Orden canónico e identidad

`migrationManifest` es la única secuencia ejecutable. El runner **no** concatena
primero la raíz y después `multitenant/`, ni ordena por nombre: ambas carpetas se
intercalan exactamente como aparecen en el array. Esto es necesario, por ejemplo,
para ejecutar las fases `multitenant/20260724…`, el Backfill `202607250001`, luego
las migraciones raíz de identidad y después nuevas vistas multitenant.

Toda migración nueva se agrega al final con
`YYYYMMDDHHMM_descripcion_inequivoca.sql`. Los doce dígitos son un identificador
global: **un timestamp no puede repetirse entre ninguna carpeta**. Los timestamps
duplicados históricos declarados en `legacyDuplicateTimestamps` están congelados;
no autorizan excepciones nuevas. La ruta del manifiesto identifica inequívocamente
el archivo, pero `public.miclub_schema_migrations.name` históricamente guarda el
basename. Por eso no se renombra, mueve, reordena ni modifica una migración aplicada
sin diseñar antes una transición compatible con nombres y checksums del registro.

## Grafo y validaciones actuales

`dependsOn` expresa aristas entre archivos. `provides` y `requires` expresan objetos
PostgreSQL (`schema.kind.objeto` para tablas/vistas y `schema.tabla.columna` para
columnas). Antes de conectarse, el runner rechaza dependencias ausentes o posteriores,
objetos declarados que se consumen antes de su creador, nombres/timestamps nuevos
duplicados, checksums distintos, SQL no registrado, entradas sin archivo y una
transacción que queda abierta. Cada objeto nuevo que sea consumido por otra
migración debe incorporarse al grafo.

## Baseline mínimo antes del Backfill multitenant

Antes de `multitenant/202607250001_backfill_and_scope_unique_constraints.sql` deben
estar aplicadas, como mínimo: todas las entradas anteriores del manifiesto; el
esquema y tablas operativas `miclub`; `miclub.clubs`; `miclub.club_memberships`; y
las columnas `club_id` nullable agregadas por `202607240003` a las tablas tenant.
Además debe existir exactamente el contexto legacy determinista que el script puede
asignar, no debe haber duplicados para las futuras claves por club y se requiere un
backup verificado. Si cualquiera de estas precondiciones falla, no se ejecuta el
Backfill ni se marca manualmente como aplicado.

## Futura fase de implementación

La validación estática no sustituye PostgreSQL. La siguiente fase debe reconstruir
una base vacía ejecutando el manifiesto completo, inspeccionar `pg_catalog` para
comparar el grafo declarado con tablas, columnas y vistas reales, y comparar el
resultado normalizado con `apps/api/data/db/dumpD-miclub_gestion-202608052004.txt`.
Las diferencias esperadas (propietarios, ACL, datos y metadatos volátiles) deberán
quedar explicitadas; toda diferencia estructural restante bloqueará el release.

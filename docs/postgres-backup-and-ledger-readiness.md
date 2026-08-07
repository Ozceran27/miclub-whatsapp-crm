# Backup PostgreSQL y readiness del ledger

## Hallazgo forense del dump histórico

El dump versionado `dump-miclub_gestion-202608061915.txt` crea el schema `miclub`,
pero no contiene `CREATE SCHEMA public`, la tabla
`public.miclub_schema_migrations` ni sus datos. Por tanto fue generado con un
filtro que excluyó `public` (o con una selección equivalente); no sirve como
backup restaurable/verificable del estado de migraciones. Este hallazgo no
autoriza a completar el ledger manualmente.

Los dumps y datos que ya están versionados se mantienen intactos durante la
etapa de prueba para permitir la inspección solicitada. Este cambio no elimina,
reescribe ni vuelve a agregar esos artefactos, y tampoco añade reglas de ignore
para ocultarlos. Su retiro y la rotación de credenciales quedan como una acción
posterior del propietario.

## Backup corregido

Ejecutar en el host destino, sin imprimir credenciales y con una ruta cifrada o
protegida **fuera del checkout**:

```bash
BACKUP_DIR=/ruta/operativa/fuera-del-repo npm run db:backup
```

El procedimiento no filtra schemas, incluye blobs, schema y datos, y rechaza el
archivo si el TOC no contiene `public`, `miclub`, la definición del ledger y los
datos del ledger. Los backups nuevos producidos por este procedimiento permanecen
fuera de Git; esto no afecta los dumps de prueba ya versionados. Después se
debe restaurar en una base vacía y descartable:

```bash
createdb miclub_restore_check
pg_restore --exit-on-error --clean --if-exists --no-owner --dbname=miclub_restore_check /ruta/miclub-UTC.dump
READINESS_ENVIRONMENT=restore-check DATABASE_URL=postgres:///miclub_restore_check \
  npm run db:readiness-report -- docs/readiness-restore-check.md
dropdb miclub_restore_check
```

La restauración sólo se aprueba si termina sin error y el reporte no presenta
faltantes, entradas inesperadas ni checksums distintos.

## Reconciliación controlada por DBA

Cuando exista un objeto administrativo sin su entrada correspondiente:

1. conservar la salida del ledger y del catálogo (`pg_get_viewdef`,
   `pg_get_functiondef`, columnas, constraints, índices, grants y políticas);
2. comparar esa definición con la migración exacta del manifest, incluyendo sus
   precondiciones y efectos de datos;
3. registrar los scripts manuales sólo desde tickets, logs o evidencia firmada;
4. preparar una **nueva migración versionada**, idempotente y revisada por DBA
   que lleve el estado real al esperado;
5. ejecutar esa migración mediante el runner para que éste registre su propio
   checksum. Nunca insertar o actualizar el ledger para simular una aplicación.

El reporte se genera con:

```bash
READINESS_ENVIRONMENT=production npm run db:readiness-report -- docs/readiness-production.md
```

La etiqueta de entorno está restringida a caracteres seguros. El reporte sólo
consulta nombre, checksum y fecha del ledger; no consulta datos de negocio ni
personales.

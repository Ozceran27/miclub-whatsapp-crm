# Ejecución en DBeaver

Los archivos son SQL plano UTF-8. Abrirlos directamente desde DBeaver y usar
**Execute SQL Script**; no copiar una representación JSON que muestre `\n`, ya
que esos caracteres literales no son saltos de línea válidos en PostgreSQL.

## Orden

1. Abrir una conexión nueva y ejecutar `01_auth_tenant_diagnostic_readonly.sql`.
2. Confirmar que existe exactamente un club candidato `miClub`.
3. Ejecutar el diagnóstico 08. Si todas las filas muestran `PASS`, no ejecutar
   ningún backfill. Sólo si hay `club_id` nulos confirmados como datos legacy de
   miClub: hacer backup y ejecutar `02_miclub_backfill_manual.sql` completo, no
   por selecciones parciales. El primer `ROLLBACK` limpia el estado `25P02`
   dejado por errores anteriores; luego el script abre su propia transacción.
4. Crear/corregir la identidad con la CLI oficial (PostgreSQL no implementa el
   hash `scrypt` usado por la aplicación):

   ```bash
   BOOTSTRAP_DIRECTOR_ENABLED=true \
   BOOTSTRAP_DIRECTOR_PASSWORD='valor-temporal-no-versionado' \
   npm run bootstrap:director
   ```

   En PowerShell, asignar ambas variables a `$env:` sólo para esa consola. Al
   terminar, eliminarlas. La CLI no imprime la contraseña ni el hash.
5. Reconectar la aplicación para forzar un login nuevo y ejecutar
   `03_final_validation_readonly.sql`. Todas las filas deben mostrar `PASS`.

## Scripts administrativos post-admin

Los archivos de `administration/` son diagnósticos y remediaciones **manuales para instalaciones legacy**. Su presencia en Git no demuestra que hayan sido ejecutados y no reemplazan `npm run db:migrate`. El estado, orden de migraciones versionadas y evidencia exigida se documentan en [`../checkpoint-post-admin.md`](../checkpoint-post-admin.md).

Antes de ejecutar uno, registrar backup, entorno, operador y checksum. Ejecutar primero `administration/01_admin_schema_diagnostic_readonly.sql`; no aplicar DDL manual si el objeto equivalente ya existe por migración. `administration/99_admin_rollback_manual.sql` sólo revierte objetos manuales vacíos, no el ledger de migraciones ni datos productivos.

## Errores corregidos

- `min(uuid)` no existe en PostgreSQL: el backfill ahora cuenta candidatos sin
  agregar UUID.
- La FK real de `miclub.import_errors` se llama `batch_id`, no
  `import_batch_id`.
- La columna financiera real es `movement_type`, no `type`.
- `25P02` no es una causa adicional: significa que una sentencia previa abortó
  la transacción. Los tres scripts comienzan con `ROLLBACK` para recuperarla.

Los registros operativos pertenecen al club mediante `club_id`; no deben recibir
el `user_id` de Fernando. Sólo la cuenta, su perfil `people`, la membresía y los
eventos de auditoría usan los IDs de usuario/persona correspondientes.

## Planes de consultas de la aplicación

`06_application_query_plans_readonly.sql` reúne el inventario de `pg_indexes`,
constraints y estadísticas, seguido de `EXPLAIN (ANALYZE, BUFFERS)` para Home,
Economía, movimientos, personas, inscripciones y CRM. Debe ejecutarse manualmente
en una réplica o entorno seguro con datos representativos, después de reemplazar
el UUID centinela. El script es de solo lectura y **no crea índices**: cualquier
DDL posterior requiere comparar el inventario y conservar los planes reales.

- `07_integral_regression_audit_readonly.sql`: auditoría integral pre-admin, reconciliación por módulo y reporte PASS/FAIL; no modifica datos.

## Diagnóstico de INICIO/CRM

`08_dashboard_crm_forensic_readonly.sql` no solicita parámetros y no modifica
datos. Resuelve automáticamente el UUID del único club cuyo nombre es `miClub`.
Si se está usando una copia anterior que abre **Enlazar parámetro(s)** para
`:club_id`, se puede cancelar y usar la versión actual. Alternativamente, en esa
copia anterior hay que pegar en **Valor** el UUID exacto obtenido con
`SELECT id FROM miclub.clubs WHERE lower(trim(name))=lower('miClub');`, sin
inventar ni usar el ID del usuario o de la membresía.

Antes de considerar un nuevo backfill, revisar en la salida de 08:

- una sola fila para `resolved_club_id`;
- una sola cadena de Fernando Ramos con membresía `active` y el mismo club en
  `person_club_id`, `membership_club_id` y `club_id`;
- `without_club = 0`, y —si miClub es realmente el único tenant con datos—
  `linked_elsewhere = 0` para todas las relaciones;
- cero filas en el resultado de relaciones cruzadas;
- PASS en las cinco consultas finales.

No ejecutar `02_miclub_backfill_manual.sql` si todo lo anterior pasa. Si aparece
`REVIEW`, conservar/exportar esos resultados y hacer backup antes de decidir una
corrección: un UUID distinto puede pertenecer legítimamente a otro club y no debe
reasignarse automáticamente.

## Cuando el diagnóstico ya está todo OK

No hay un segundo enlace «datos → Fernando Ramos». Los datos operativos
pertenecen a `miclub.clubs.id`; Fernando accede a ellos mediante su fila activa
en `user_club_memberships`, y su perfil privado se enlaza por `people.user_id` y
el mismo `people.club_id`. Es incorrecto escribir el UUID del usuario o de la
membresía en las columnas `club_id`.

Si 08 confirma la cadena activa de Fernando, `without_club = 0`,
`linked_elsewhere = 0`, cero relaciones cruzadas y los cinco PASS finales, el
backfill ya está realizado. Ejecutar 02 sería idempotente y actualizaría cero
filas, pero no debe hacerse sólo «para asegurar»: continúe directamente con 03,
reinicie la sesión de la aplicación y valide INICIO/CRM.

Si, en cambio, 08 muestra `REVIEW` por filas nulas y se confirmó que pertenecen
a miClub, el procedimiento manual es:

1. Exportar los resultados de 08 y realizar un backup restaurable.
2. Abrir una conexión DBeaver nueva con autocommit activo.
3. Ejecutar **todo** `02_miclub_backfill_manual.sql` con **Execute SQL Script**;
   no ejecutar sólo el bloque `UPDATE` ni sustituir UUID manualmente.
4. Confirmar que no hubo excepción y que llegó a `COMMIT`.
5. Ejecutar completo `03_final_validation_readonly.sql`; todas las comprobaciones
   deben dar PASS y los totales deben coincidir con los guardados antes.
6. Cerrar sesiones abiertas, iniciar sesión de nuevo como Fernando y validar los
   cinco endpoints. Si 02 falla antes del COMMIT, ejecutar `ROLLBACK`, conservar
   el error exacto y no repetir parcialmente el script.

### `09_create_employees_manual.sql`

Crea manualmente `miclub.employees` sólo si no existe una tabla equivalente.
La tabla modela datos laborales y referencia `people`, `users`,
`user_club_memberships` y `sectors`, sin duplicar nombres, DNI, teléfono ni email.

### `11_activities_manual_metadata_audit_and_add_columns.sql`

Audita y amplía manualmente `miclub.activities` sin crear tablas paralelas de
actividades. Agrega sólo si faltan los metadatos nuevos (`club_id`,
`description`, `generates_enrollments`, `settlement_*`, `archived_at`,
`created_by`, `updated_by`) y conserva los campos existentes que ya modelan
sector, responsable, instructor, cuotas, comisiones, estado, color, código y
notas.

### `12_movements_activity_id_manual.sql`

Audita `miclub.movements.activity_id`, la agrega como `uuid NULL` con referencia
a `miclub.activities(id)` sólo si falta y crea el índice
`movements_club_activity_date_idx` —o `movements_activity_date_idx` como
equivalente legacy sin `club_id`— para consultas por actividad y fecha. El script
no hace backfill por texto y conserva los movimientos históricos con
`activity_id NULL`.

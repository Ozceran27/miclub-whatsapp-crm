# Ejecución en DBeaver

Los archivos son SQL plano UTF-8. Abrirlos directamente desde DBeaver y usar
**Execute SQL Script**; no copiar una representación JSON que muestre `\n`, ya
que esos caracteres literales no son saltos de línea válidos en PostgreSQL.

## Orden

1. Abrir una conexión nueva y ejecutar `01_auth_tenant_diagnostic_readonly.sql`.
2. Confirmar que existe exactamente un club candidato `miClub`.
3. Hacer backup y ejecutar `02_miclub_backfill_manual.sql` completo, no por
   selecciones parciales. El primer `ROLLBACK` limpia el estado `25P02` dejado
   por errores anteriores; luego el script abre su propia transacción.
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

# Auditoría definitiva: claves de importación Google Sheets → PostgreSQL

## Hallazgo autoritativo

El importador ejecutaba dos targets idénticos sin predicado:

- `movements`: `ON CONFLICT (club_id, external_id) DO UPDATE`.
- `enrollments` (la entidad lógica “members/inscriptos”): `ON CONFLICT (club_id, external_id) DO UPDATE`.

El dump productivo auditado y la migración multi-tenant definen, en cambio, índices **UNIQUE parciales**:

- `movements_club_external_id_key ON miclub.movements (club_id, external_id) WHERE external_id IS NOT NULL`.
- `enrollments_club_external_id_key ON miclub.enrollments (club_id, external_id) WHERE external_id IS NOT NULL`.

La inferencia de `ON CONFLICT` no declaraba el predicado del índice parcial. PostgreSQL no podía inferir un árbitro compatible y devolvía `42P10`; por eso un único defecto de schema/SQL aparecía como 1.944 errores de filas. Los índices no únicos `idx_movements_external_id` y los índices tenant simples no son árbitros válidos.

## Claves lógicas finales

La identidad importada autoritativa de ambas entidades es `(club_id, external_id) WHERE external_id IS NOT NULL`.

- `external_id` se genera de manera estable con namespace `google_sheets` en el importador.
- `club_id` procede exclusivamente del contexto autenticado o del contexto explícito validado del script legacy, nunca de la fila.
- Los registros manuales pueden conservar `external_id NULL`; no se agregó `NOT NULL` y el índice parcial no los hace colisionar.
- Se preservan UUID local, `club_id`, `created_at` y campos no incluidos explícitamente en `DO UPDATE`.
- No se añadió `source_system` porque `external_id` ya incorpora el namespace de origen; ampliar el schema duplicaría información sin resolver un problema actual.

Se eligió inferencia por columnas más predicado y no `ON CONFLICT ON CONSTRAINT` porque PostgreSQL no permite adjuntar un índice parcial como constraint UNIQUE. El predicado explícito mantiene el SQL exactamente alineado con el índice autoritativo.

## Alcance auditado

Se revisaron rutas, autorización tenant, servicio/importador, repositories, helpers, migraciones, dump y tests. Las tablas físicas son `movements`, `enrollments`, `people`, `sectors`, `activities`, `import_batches`, `import_errors` y auxiliares; no existe una tabla física requerida llamada `members` para este flujo.

El clasificador ahora reconoce `42P10` y los mensajes inglés/español como `IMPORT_SCHEMA_CONFLICT_CONFIGURATION`, revierte el savepoint, aborta el batch en la primera ocurrencia, registra una sola fila de configuración y finaliza como `failed_configuration`. El panel recibe un mensaje amigable, causa probable y acción sugerida; el detalle crudo permanece en `import_errors` para diagnóstico técnico.

## Scripts manuales DBeaver

Ejecutar en orden, sin saltar precondiciones:

1. `docs/dbeaver/import-constraints/diagnostic_unique_constraints.sql` (solo lectura).
2. `docs/dbeaver/import-constraints/prepare_unique_constraints.sql` (transacción read-only; debe mostrar cero duplicados).
3. `docs/dbeaver/import-constraints/apply_unique_constraints.sql` (DDL manual; detener backend).
4. `docs/dbeaver/import-constraints/validate_import_constraints.sql` (solo lectura y `EXPLAIN`; no persiste filas).
5. `docs/dbeaver/import-constraints/rollback_unique_constraints.sql` (solo ante rollback coordinado).

Si aparecen duplicados, no ejecutar `apply`: conservar IDs, identificar origen/fechas y solicitar reconciliación humana. En particular, no fusionar ni borrar movimientos financieros automáticamente.

## Validación operacional pendiente del entorno

Este checkout no contiene credenciales PostgreSQL, club/usuario/membresía ni credenciales Google Sheets. Por seguridad no se aplicó DDL ni se ejecutó una importación real. El dry-run manual se intentó y quedó correctamente bloqueado antes de acceder a la fuente por ausencia de `GOOGLE_SHEETS_IMPORT_CLUB_ID`. La validación productiva requiere que Operaciones aplique los scripts en DBeaver y ejecute un dry-run autenticado; la importación real debe permanecer bloqueada hasta obtener `errors === 0`.

Tras el DDL: reiniciar backend, verificar `/api/db/health`, ejecutar `POST /api/import/google-sheets` con `dryRun=true`, consultar el batch y su resumen, y confirmar que no existe `IMPORT_SCHEMA_CONFLICT_CONFIGURATION` ni el mensaje 42P10. Comparar además conteos por ADMINISTRACIÓN, FITNESS, LOCAL 1, SALÓN y AULA; los errores restantes serán datos reales y no deben suponerse iguales a 1.944.

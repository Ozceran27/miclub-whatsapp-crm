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

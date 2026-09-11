# Instalación del circuito financiero — 2026-09-11

Usar los archivos de esta entrega juntos con el backend y frontend actualizados.
No se aplicaron cambios a la base real: la ejecución es manual en DBeaver.

## Orden de ejecución

1. Seleccionar la conexión y base correctas, con usuario propietario del esquema y backup disponible. Si un intento anterior dejó la transacción abortada, ejecutar `ROLLBACK;` en esa misma conexión antes de continuar. Esto descarta los cambios todavía no confirmados de esa transacción.
2. **Opcional:** ejecutar completo `apps/api/db/stabilization/owner_permissions_manual.sql`. Agrega únicamente los permisos de onboarding faltantes a memberships administrativos; conserva permisos personalizados. Puede repetirse. No instala tablas ni sustituye al script financiero. Si el onboarding ya funciona, no es un requisito de esta actualización.
3. Ejecutar **completo, como script**, `docs/dbeaver/2026-09-09-circuito-financiero.sql`. Incluye, en orden, `202609090002_financial_operating_circuit.sql` y `202609090003_initial_obligation_applications.sql`, sus validaciones y registro en el ledger. Esperar el `COMMIT` final exitoso.
4. **No ejecutar aparte** `apps/api/db/migrations/202609090003_initial_obligation_applications.sql`, ni volver a ejecutar la migración 002 en crudo. Son los archivos versionados que utiliza el instalador; ejecutarlos separadamente omite la recuperación de instalaciones parciales y el registro coordinado del ledger.
5. Compilar/desplegar la misma versión de la aplicación, reiniciar el backend y volver a ingresar. Comprobar Inicio, Economía y Administración. Los acuerdos históricos sin responsable confirmado se resuelven en Economía; el instalador no inventa responsables históricos.

Si sólo se necesita instalar este circuito y el onboarding funciona, **basta con el paso 3**.

## Qué hace el script completo

- Recupera objetos ya existentes compatibles, incluido `activity_terms.responsible_person_id`, sin duplicarlos.
- Verifica tipos, nulabilidad y restricciones antes de aceptar estructuras previas; registra checksums canónicos.
- Completa aplicaciones de saldos iniciales, estado de revisión, trazabilidad de devoluciones y la hoja `SALDOS_INICIALES` del contrato XLSX v4.
- Reinstala funciones, triggers, políticas tenant y permisos del circuito. No borra movimientos, pagos ni liquidaciones.
- Usa una transacción y un esquema vacío de comparación `financial_install_probe`, que elimina antes de confirmar.
- Conserva el historial y las versiones aprobadas. Las deudas resultantes de correcciones no eliminan pagos realizados.

Ante un error, detener la ejecución y hacer `ROLLBACK;`. No continuar sentencia por sentencia, eliminar columnas existentes ni cambiar checksums a mano. Una diferencia de checksum o estructura incompatible requiere revisar esa diferencia; el script la rechaza deliberadamente para no dar por válida una instalación distinta.

## Validación posterior de solo lectura

```sql
SELECT name, checksum
FROM public.miclub_schema_migrations
WHERE name IN (
 '202609090002_financial_operating_circuit.sql',
 '202609090003_initial_obligation_applications.sql'
)
ORDER BY name;

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'miclub'
  AND ((table_name = 'initial_obligations' AND column_name = 'review_state')
    OR (table_name = 'movements' AND column_name = 'initial_obligation_id'));

SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'miclub.xlsx_import_rows'::regclass
  AND conname = 'xlsx_import_rows_sheet_check';
```

Se esperan dos migraciones, las dos columnas y una restricción que incluya `SALDOS_INICIALES`. La consulta de acuerdos pendientes que muestra el instalador puede devolver filas: son decisiones de configuración que necesitan revisión, no un error de instalación.

## Reversión

Antes del `COMMIT`, `ROLLBACK` revierte la instalación completa. Después de empezar a operar, preservar tablas e historial y realizar correcciones auditadas; una restauración de backup requiere considerar las operaciones posteriores. No hay un borrado automático de datos financieros.

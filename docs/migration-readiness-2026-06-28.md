# Informe de preparación para migración real - 2026-06-28

## Alcance revisado

- Dump PostgreSQL fuente: `apps/api/data/db/dump-miclub_gestion-202606281204.txt`.
- Planilla fuente: `apps/api/data/db/Dashboard CLUB Actualizado.xlsx`.
- Backend API, servicios de normalización/importación, vistas SQL de agregación, frontend de dashboard/migración y documentación existente.

## Estado del dump PostgreSQL

El dump contiene una base `miclub` ya alineada con las vistas operativas nuevas. La carga está poblada con:

| Tabla | Filas en dump |
| --- | ---: |
| `miclub.people` | 232 |
| `miclub.person_kind_links` | 232 |
| `miclub.enrollments` | 213 |
| `miclub.movements` | 807 |
| `miclub.activities` | 34 |
| `miclub.instructors` | 27 |
| `miclub.movement_categories` | 40 |
| `miclub.sectors` | 9 |
| `miclub.operational_balances` | 1 |
| `miclub.import_batches` | 5 |
| `miclub.import_errors` | 0 |

Puntos relevantes:

- `miclub.v_dashboard_basic` ya separa saldos reales de administración, pendientes, cuotas a cobrar, cuotas futuras hasta fin de mes, saldos a liquidar y balance proyectado.
- `miclub.v_sector_finance_summary` ya expone ingresos, egresos, balance operativo, `settlement_balance`, rentabilidad total y rentabilidad del mes actual por sector.
- `miclub.sheet_metric_snapshots` existe para guardar métricas cuya fórmula de la planilla no se puede reconstruir todavía solo desde tablas normalizadas.
- No hay errores de importación registrados en `miclub.import_errors` dentro del dump revisado.

## Fórmulas críticas detectadas en la planilla

### Dashboard / Administración

- `DASHBOARD!AY6` toma ingresos completados del mes seleccionado desde `ADMINISTRACIÓN`.
- `DASHBOARD!BE6` toma egresos completados del mes seleccionado desde `ADMINISTRACIÓN`.
- `DASHBOARD!BH6 = AY6 + BE6`, por lo que el egreso ya viaja con signo negativo en la planilla.
- En `ADMINISTRACIÓN`, los ingresos/egresos mensuales usan `SUMIFS` por fecha, tipo (`INGRESOS`/`EGRESOS`) y estado operativo `COMPLETADO`.

### Métricas financieras del club

La semántica esperada queda cubierta por `v_dashboard_basic`:

- liquidez real = caja/banco/dólares administrados + saldos liquidables positivos de sectores;
- cuotas adeudadas = cuotas de inscripciones con estado `adeudando`;
- cuotas a cobrar = cuotas adeudadas actuales;
- cuotas futuras = inscripciones al día con vencimiento desde hoy hasta fin de mes;
- balance proyectado = liquidez + cuotas a cobrar + saldos a liquidar + pendientes netos.

### Sectores

- `LOCAL 1!X3` calcula saldo a liquidar con ingresos de `TATTOO`, `VENTAS` y `PIERCING`, dividido por dos, menos comisiones pagadas.
- `LOCAL 1!AN3` calcula rentabilidad total como ingresos computables menos egresos computables menos saldo a liquidar.
- `FITNESS!X3` calcula saldo a liquidar con ingresos de cuota/inscripción/clases divididos por dos, menos comisiones pagadas.
- `FITNESS!AN3` calcula rentabilidad total como ingresos computables menos egresos computables menos saldo a liquidar.
- `SALON`, `AULA` y algunas métricas de `FITNESS` dependen de fórmulas específicas de la planilla y por eso se resuelven mediante snapshots en `sheet_metric_snapshots` cuando no hay una reconstrucción relacional completa.
- `CANTINA` puede reconstruirse desde movimientos por categorías `KIOSCO`, `BEBIDAS` y egresos de `BEBIDAS` como CMV.

## Coherencia app vs planilla

- El importador normaliza montos argentinos sin reescalarlos y conserva movimientos de monto cero cuando son movimientos operativos válidos.
- El mapeo de columnas contempla layouts reales de `ADMINISTRACIÓN`, `FITNESS`, `SALON`, `AULA` y `LOCAL 1`.
- El dashboard PostgreSQL lee `v_dashboard_basic`, `v_sector_finance_summary`, `v_sector_settlement_balances` y `sheet_metric_snapshots`.
- La reconciliación compara métricas de Google Sheets/debug contra PostgreSQL y marca diferencias, faltantes de Sheets o faltantes de PostgreSQL con tolerancia configurable.
- El frontend incluye módulo de migración y dashboard consumiendo los endpoints existentes; el build productivo compila correctamente.

## Riesgos y pendientes antes de migración real

1. **Variables de entorno PostgreSQL**: el dry-run real no puede iniciarse sin `PGHOST`, `PGDATABASE` y `PGUSER`.
2. **Disponibilidad de Google Sheets**: para importar desde Sheets hacen falta credenciales/variables de Google válidas en el entorno real.
3. **Snapshots obligatorios**: antes de validar el dashboard final deben capturarse/insertarse snapshots para métricas que hoy dependen de celdas de la planilla (`fitness.*`, `salon.*`, `aula.*`).
4. **Verificación final con base real**: después de restaurar el dump o apuntar a la DB real, ejecutar la reconciliación del dashboard y revisar cualquier métrica con estado `difference` o `missing_postgres`.

## Checklist operativo recomendado

1. Restaurar el dump en una base PostgreSQL limpia o apuntar el entorno a la base real ya restaurada.
2. Configurar `PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGPORT` y credenciales de Google Sheets.
3. Ejecutar migraciones SQL hasta `202606280003_add_sheet_metric_snapshots.sql`.
4. Ejecutar `npm run import:sheets:dry` y verificar que no haya errores de importación.
5. Ejecutar la importación real.
6. Capturar snapshots de métricas de planilla no reconstruibles directamente.
7. Ejecutar reconciliación dashboard vs PostgreSQL.
8. Levantar frontend/API y revisar visualmente Dashboard, Finanzas, CRM y Migración.

## Verificaciones ejecutadas en este análisis

- `npm test -w @miclub/api`: 40 tests pasaron.
- `npm run typecheck`: TypeScript pasó en API, web y shared.
- `npm run build`: API, web y shared compilaron correctamente.
- `npm run import:sheets:dry`: no se pudo completar en este entorno por falta de variables PostgreSQL (`PGHOST`, `PGDATABASE`, `PGUSER`).
- Análisis estático del dump: conteos de tablas, vistas agregadas y ausencia de errores importados.
- Análisis estático del XLSX: hojas, fórmulas críticas y valores cacheados relevantes para Dashboard/Administración/sectores.

## Conclusión situacional

El repositorio está consistente a nivel de compilación, tests y semántica principal de dashboard. La estructura del dump coincide con las vistas esperadas por el backend, y las fórmulas críticas de la planilla están representadas por una combinación de vistas SQL, servicios TypeScript y snapshots para métricas aún dependientes de celdas. El bloqueo para ejecutar una simulación end-to-end real no está en el código sino en la falta de variables/credenciales de entorno para PostgreSQL y Google Sheets. Con esas variables configuradas, el proyecto queda listo para ejecutar dry-run, migración real y reconciliación final contra datos reales.

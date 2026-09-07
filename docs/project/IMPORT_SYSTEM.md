# Import System

## Contrato efectivo

XLSX → PostgreSQL; sin Google Sheets. MICLUB_XLSX_IMPORT_VERSION es v2, aunque el identificador XLSX_IMPORT_V1_SCHEMA y docs/migration/xlsx-v1.md mantienen nombre histórico.

Archivo: apps/api/data/db/Modelo_Import_miClub.xlsx. Hojas exactas (orden no contractual), headers fila 1, datos desde fila 2:

- ADMINISTRACIÓN A:Z: Fecha, Tipo, Categoría, Concepto, Contra-parte, Sector, Monto, Impuestos, Estado, M.P.
- INSCRIPCIONES A:U: Fecha, Nombre, Apellido, D.N.I., Telefono, Actividad, Modalidad, Cuota, Estado.

Separadores vacíos son parte de la firma. No interpretar A:Y ni renombrar el archivo/columnas sin transición contractual. Sector e instructor de inscripción se derivan de actividad.

## Acceso y pipeline

GET /api/migration/template; POST /api/migration/uploads. Auth/membership, imports:run, operador opcional IMPORT_OPERATOR_USER y DATA_MIGRATION efectiva.

Download → upload → validate → resolve references → dry-run → apply.

Tenant deriva de sesión. Matching normaliza Unicode, acentos, case y espacios; no fuzzy. Ambigüedad produce REFERENCE_AMBIGUOUS; referencia faltante bloquea apply. Personas de inscripción se upsert por DNI normalizado tenant; UUID sigue siendo PK.

Dry-run persiste batch/errores/auditoría, no entidades operativas finales. Apply exige dry-run equivalente en archivo/hash, versión, tenant, configuración y fingerprints de filas. Bloquea errores y lote exacto ya completado. La transacción escribe people, movements/enrollments y xlsx_import_rows con secuencias tenant.

## Autoridades

shared contracts/xlsxImport.ts; migrationUploadRoutes.ts; xlsxMigration/policy, zipInspector, validator, referenceResolver y workbook. persistence.ts es reexport; migrationService.ts sirve archivado de inscripciones faltantes, no sustituye al aplicador del workbook. Frontend: DataMigrationModule.

## Límites y seguridad

8 MiB comprimidos, 40 MiB expandidos, ratio máximo 40, 128 entradas ZIP, 10000 filas por hoja. Valida extensión/MIME/estructura, hojas y headers; rechaza macros y enlaces externos. No ejecuta fórmulas como código. Upload temporal eliminado tras procesar.

## Brechas abiertas

- B04: contrato admite ANULADO, pero movementStatus en workbook.ts lo transforma en COMPLETADO. No aplicar esta conducta como regla.
- La ruta acepta etiquetas retry/reversal, pero dirige las operaciones no dry_run a applyWorkbook; no hay semántica independiente de reversión certificada.
- projectedWrites cuenta filas de negocio; persistedWrites suma entidad y trazabilidad y no todos los upserts de personas. No comparar ambos como conteo idéntico de escrituras físicas.
- Import real/E2E con PostgreSQL aislado no ejecutado en bootstrap.
- Historia con CAPITAL inicial y opening balances puede duplicar capital; revisar conciliación.

La importación ocurre después del onboarding según permisos/plan. FREE no incluye DATA_MIGRATION; SOCIAL/COMPLEX/CLUB activos sí, salvo override efectivo.

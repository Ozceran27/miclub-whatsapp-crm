# Import System

## Contrato efectivo

XLSX → PostgreSQL; sin Google Sheets. MICLUB_XLSX_IMPORT_VERSION es v4 desde 2026-09-11. El identificador XLSX_IMPORT_V1_SCHEMA conserva su nombre por compatibilidad de código.

Archivo: apps/api/data/db/Modelo_Import_miClub.xlsx. Hojas exactas (orden no contractual), headers fila 1, datos desde fila 2:

- ADMINISTRACIÓN A:AC: Fecha, Tipo, Categoría, Concepto, Contra-parte, Sector, Monto, Impuestos, Estado, M.P., Actividad (AA), Identificador de origen (AB), Cuenta (AC).
- INSCRIPCIONES A:V: Fecha, Nombre, Apellido, D.N.I., Telefono, Actividad, Modalidad, Cuota, Estado, Identificador de origen (V).
- SALDOS_INICIALES A:G: Identificador de origen, D.N.I., Actividad, Tipo, Moneda, Monto, Fecha de vencimiento.

Separadores vacíos son parte de la firma. Sector e instructor de inscripción se derivan de actividad.

En movimientos, Actividad acepta nombre o código exacto normalizado del club.
Si Sector está vacío, se deriva de la actividad; si se informan ambos, deben
coincidir. Sin Actividad se conserva un movimiento general, sin participación
automática en liquidaciones de actividad. Concepto es descripción, nunca matching
automático. Una referencia inexistente o ambigua bloquea importación.

Transición v2 → v3: descargar la plantilla nueva, copiar valores en las columnas
conservadas y completar AA para los movimientos de actividades. Revisar manualmente
las asociaciones de conceptos históricos; no se implementa inferencia automática.
La firma antigua se rechaza y exige la cabecera Actividad. Los lotes v2 ya importados
se conservan; no volver a cargar esa historia como v3, cuya deduplicación entre
versiones/archivos todavía no está certificada.

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

- B04 corregido: ANULADO se conserva; estado desconocido bloquea y revierte apply.
- Sólo se aceptan dry_run y apply. retry/reversal se rechazan hasta definir su semántica.
- projectedWrites cuenta filas de negocio; persistedWrites suma entidad y trazabilidad y no todos los upserts de personas. No comparar ambos como conteo idéntico de escrituras físicas.
- Regresión 2026-09-09: importación HTTP real en PostgreSQL aislado de movimiento con actividad/sector e inscripción, rechazo de replay y de cambio de sector después del dry-run. El hash de referencias incluye las relaciones resueltas, no una constante. Se corrigió la consulta de instructores para usar status='activa', sin columnas inexistentes code/is_active.
- El lector admite prefijos XML estándar y celdas vacías autocerradas. La plantilla distribuida se valida con el mismo lector runtime.
- Los errores se guardan en las columnas canónicas source_table/source_row,
  error_message/raw_payload y metadata de referencia. Se corrigió el fallo 500
  por columnas inexistentes; el recorrido A/B prueba ACTIVITY_NOT_FOUND con 422
  y ningún movimiento creado en el segundo club.
- Historia con CAPITAL inicial y opening balances puede duplicar capital; revisar conciliación.

La importación ocurre después del onboarding según permisos/plan. FREE no incluye DATA_MIGRATION; SOCIAL/COMPLEX/CLUB activos sí, salvo override efectivo.

## Conciliación v4 — 2026-09-11

SALDOS_INICIALES admite STUDENT, RESPONSIBLE, EMPLOYEE y SUPPLIER. Reutiliza Person
del club o del lote de inscripciones. Queda DRAFT, sin caja ficticia ni obligaciones
activas hasta aprobar el arranque. PostgreSQL admite la tercera hoja en xlsx_import_rows.
Se revisan orígenes y huellas completas contra lotes anteriores; importe y fecha no
son una clave de deduplicación. Las cuentas se resuelven dentro del tenant y fijan
la moneda. La fecha de caja usa la zona del club. Historia anterior al corte
aprobado exige conciliación y no modifica automáticamente el saldo inicial.

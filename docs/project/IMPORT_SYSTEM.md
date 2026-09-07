# Import System

## Objetivo

Importar historia desde XLSX estándar sin depender de Google Sheets.

## Flujo

```text
Download template
→ Upload XLSX
→ Validate
→ Dry Run
→ Apply
→ PostgreSQL
```

## Endpoints

- `GET /api/migration/template`
- `POST /api/migration/uploads`

Requieren auth, tenant, permiso y feature.

## Archivo

`apps/api/data/db/Modelo_Import_miClub.xlsx`

## Contrato v1 observado

### ADMINISTRACIÓN

A:Z, headers fila 1, datos fila 2.

Campos reales:

- Fecha
- Tipo
- Categoría
- Concepto
- Contra-parte
- Sector
- Monto
- Impuestos
- Estado
- M.P.

Separadores vacíos son parte de la firma.

### INSCRIPCIONES

La documentación vigente inspeccionada indica A:U.

Campos:

- Fecha
- Nombre
- Apellido
- D.N.I.
- Telefono
- Actividad
- Modalidad
- Cuota
- Estado

Sector e instructor se derivan de la actividad resuelta.

**Si documentación antigua menciona A:Y, prevalecen el archivo real y `docs/migration/xlsx-v1.md`.**

## Matching

Dentro del tenant autenticado.

Normaliza trim, espacios, case, acentos y Unicode.

- 0 matches → error.
- >1 → `REFERENCE_AMBIGUOUS`.
- nunca escoger arbitrariamente.

## Dry-run

Valida sin materializar writes finales y devuelve ubicación/valor de errores.

## Apply

Tenant-scoped, transaccional, auditable e idempotente según estrategia vigente.

## Seguridad

Validar estructura ZIP, formato, tamaño, sheets, headers y versión. No ejecutar macros/fórmulas como código.

## Documentos canónicos

- `docs/import-xlsx.md`
- `docs/migration/xlsx-v1.md`

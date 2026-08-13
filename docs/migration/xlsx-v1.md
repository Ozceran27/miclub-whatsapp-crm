# Importación XLSX v1 sobre las planillas existentes

## Decisión

La versión v1 **conserva sin modificaciones** `apps/api/data/db/Modelo_Import_miClub.xlsx`: no agrega hojas, columnas, metadata ni fixtures binarios. El contrato identifica v1 mediante la firma formada por los nombres de las dos hojas y sus encabezados en las celdas actuales. Un archivo cuya firma no coincida se rechaza como formato desconocido; no se lo interpreta por posición aproximada.

Las celdas espaciadas y mergeadas continúan siendo parte del formato físico porque ya existen en la plantilla. El importador debe tratarlas como una sola columna lógica por encabezado (la celda superior izquierda), sin pedir al usuario que descombine o rediseñe el libro.

## Tipos y filas

Ambas hojas tienen encabezados en la fila **1** y datos desde la fila **2**. `date` admite fecha de Excel o texto de fecha válido; `decimal` admite un número sin inventar un valor ante errores; `string` conserva texto; `enum` se normaliza contra el catálogo del dominio. En una fila con datos, los valores obligatorios deben estar presentes. Los ejemplos siguientes son sintéticos.

## Hoja `ADMINISTRACIÓN`

| Encabezado | Celda de encabezado | Primera celda | Tipo | Obligatorio | Ejemplo |
|---|---:|---:|---|---|---|
| `Fecha` | A1 | A2 | date | Sí | `01/08/2026` |
| `Tipo` | C1 | C2 | enum | Sí | `INGRESOS` |
| `Categoría` | F1 | F2 | string | Sí | `CUOTA` |
| `Concepto` | I1 | I2 | string | Sí | `Pago cuota` |
| `Contra-parte` | N1 | N2 | string | No | `TEST-0001` |
| `Sector` | Q1 | Q2 | string | No | `FITNESS` |
| `Monto` | S1 | S2 | decimal | Sí | `25000` |
| `Impuestos` | V1 | V2 | decimal | No | `0` |
| `Estado` | X1 | X2 | enum | Sí | `COMPLETADO` |
| `M.P.` | Z1 | Z2 | string | No | `Transferencia` |

No se agrega `Actividad` ni `Referencia externa` a esta hoja. El `Id.` que contienen los layouts operativos es la referencia estable preferida; cuando falta, el importador mantiene su identificador determinista histórico basado en hoja, fila, fecha, tipo y monto.

### Relaciones automáticas de movimientos

1. Si un layout existente ofrece encabezado `Actividad`, se busca una única actividad del club con ese nombre normalizado.
2. Si no la ofrece, o no hay coincidencia única, `Contra-parte` se normaliza como DNI/documento y se busca el inscripto activo.
3. Si ese inscripto tiene una única actividad activa, se asignan `movement.activity_id` y el sector canónico de esa actividad.
4. Si hay cero o múltiples actividades, no se inventa la relación: `activity_id` queda nulo y se conserva el sector explícito o el de la hoja como fallback auditable.
5. Nunca se crea una actividad a partir del texto de concepto o contraparte.

Así, un pago de cuota cuya contraparte sea un DNI se vincula al inscripto y a su actividad cuando la relación es inequívoca, sin exigir nuevas celdas.

## Hoja `INSCRIPCIONES`

| Encabezado | Celda de encabezado | Primera celda | Tipo | Obligatorio | Ejemplo |
|---|---:|---:|---|---|---|
| `Fecha` | A1 | A2 | date | Sí | `01/08/2026` |
| `Nombre` | C1 | C2 | string | Sí | `Persona` |
| `Apellido` | F1 | F2 | string | Sí | `Ejemplo` |
| `D.N.I.` | I1 | I2 | string | Sí | `TEST-0001` |
| `Tel.` | K1 | K2 | string | No | `0000000000` |
| `Actividad` | M1 | M2 | string | Sí | `Natación` |
| `Modalidad` | O1 | O2 | string | No | `Mensual` |
| `Cuota` | Q1 | Q2 | decimal | Sí | `25000` |
| `Estado` | S1 | S2 | enum | Sí | `Al Día` |
| `Instructor` | V1 | V2 | string | No | `Instructor Ejemplo` |
| `Vence` | X1 | X2 | date | No | `31/08/2026` |

No existe ni se requiere una celda `Sector`. El sector se deriva exclusivamente de `Actividad`: toda actividad se guarda asociada al sector representado por su hoja de origen. La inscripción referencia la actividad, por lo que su sector se consulta por `enrollments.activity_id → activities.sector_id`; no se persiste información redundante.

## Matching e idempotencia

- Persona: primero DNI normalizado; si falta, nombre, apellido y teléfono normalizado.
- Inscripción: DNI/persona + actividad; el identificador externo incluye ambos y permite reimportar sin duplicar.
- Actividad: nombre normalizado dentro del sector de la hoja; nombres iguales en sectores distintos siguen siendo actividades distintas.
- Movimiento: `Id.` de origen cuando existe; fallback determinista sólo para layouts sin ID.
- Contraparte: se conserva el texto original y, si es un DNI inequívoco, se usa para derivar la actividad del movimiento.

## Compatibilidad futura

`packages/shared/src/contracts/xlsxImport.ts` es la fuente compartida de nombres y celdas. `detectMiclubXlsxImportVersion` acepta únicamente la firma v1 exacta y rechaza hojas ausentes, encabezados movidos o versiones desconocidas. Una futura firma incompatible se añadirá como un contrato y detector explícitos; v1 nunca cambiará de significado. Como la planilla actual no posee una celda de versión estable y no debe modificarse, la firma estructural reemplaza deliberadamente a `MICLUB_IMPORT_VERSION=v1`.

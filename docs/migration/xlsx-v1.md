# Contrato de importación de `Modelo_Import_miClub.xlsx`

## Inspección y decisión contractual

La fuente inspeccionada es `apps/api/data/db/Modelo_Import_miClub.xlsx`. El libro contiene exactamente las hojas `ADMINISTRACIÓN` e `INSCRIPCIONES`, ambas con cabecera en la fila 1 y datos desde la fila 2. **El orden de las hojas no es contractual**: sólo importan el conjunto exacto de nombres y la firma física de cabeceras de cada hoja. No se aceptan hojas adicionales.

La plantilla usa columnas vacías como separadores visuales (no son campos disponibles). También son parte de la firma: deben conservar la cabecera vacía. Una referencia escrita en una columna separadora no se interpreta ni se desplaza a un campo vecino.

## `ADMINISTRACIÓN` (A:Z)

| Columna | Cabecera / función | Campo | Tipo | Referencia o derivación |
|---|---|---|---|---|
| A | `Fecha` | `date` | date, obligatoria | — |
| B | vacía | separador | — | — |
| C | `Tipo` | `type` | enum, obligatorio | — |
| D:E | vacías | separadores | — | — |
| F | `Categoría` | `category` | string, obligatoria | categoría activa del tenant |
| G:H | vacías | separadores | — | — |
| I | `Concepto` | `concept` | string, obligatorio | — |
| J:M | vacías | separadores | — | — |
| N | `Contra-parte` | `counterparty` | string, opcional | documento de persona; conserva el texto aunque no exista aún |
| O:P | vacías | separadores | — | — |
| Q | `Sector` | `sector` | string, opcional | sector del tenant |
| R | vacía | separador | — | — |
| S | `Monto` | `amount` | decimal, obligatorio | — |
| T:U | vacías | separadores | — | — |
| V | `Impuestos` | `taxes` | decimal, opcional | — |
| W | vacía | separador | — | — |
| X | `Estado` | `status` | enum, obligatorio | — |
| Y | vacía | separador | — | — |
| Z | `M.P.` | `paymentMethod` | string, opcional | medio de pago activo del tenant |

No hay cabeceras de actividad, trabajador/instructor ni referencia externa en esta hoja. No se derivan esas referencias desde el concepto. `Contra-parte` puede enlazarse por documento a una persona del tenant, pero no bloquea la creación/upsert de personas de este mismo lote.

## `INSCRIPCIONES` (A:U)

| Columna | Cabecera / función | Campo | Tipo | Referencia o derivación |
|---|---|---|---|---|
| A | `Fecha` | `date` | date, obligatoria | — |
| B | vacía | separador | — | — |
| C | `Nombre` | `firstName` | string, obligatorio | — |
| D:E | vacías | separadores | — | — |
| F | `Apellido` | `lastName` | string, obligatorio | — |
| G:H | vacías | separadores | — | — |
| I | `D.N.I.` | `document` | string, obligatorio | identidad de la persona creada/actualizada en el tenant |
| J | vacía | separador | — | — |
| K | `Telefono` | `phone` | string, opcional | — |
| L | vacía | separador | — | — |
| M | `Actividad` | `activity` | string, obligatoria | actividad activa del tenant |
| N | vacía | separador | — | — |
| O | `Modalidad` | `modality` | string, opcional | texto libre; no identifica la actividad |
| P | vacía | separador | — | — |
| Q | `Cuota` | `fee` | decimal, obligatoria | — |
| R | vacía | separador | — | — |
| S | `Estado` | `status` | enum, obligatorio | — |
| T:U | vacías | separadores | — | — |

La plantilla real no contiene cabeceras `Sector`, `Trabajador`, `Instructor` ni `Vence`. Sector e instructor son **derivados** de la única actividad resuelta (`activity.sector_id` y `activity.instructor_id`). Por eso también se valida que la actividad tenga instructor vigente. Si un formato futuro incorpora referencias explícitas, requerirá otra firma/version contractual; no se reutilizan separadores silenciosamente.

## Resolución y bloqueo

Las referencias se buscan exclusivamente en catálogos filtrados por el `club_id` de la sesión. La comparación elimina espacios exteriores/repetidos, diferencias de mayúsculas, acentos y formas Unicode NFC/NFD. Una coincidencia debe ser única: cero resultados produce `*_NOT_FOUND` y más de uno `REFERENCE_AMBIGUOUS`; nunca se elige arbitrariamente. Un instructor explícito, cuando una firma futura lo ofrezca, además debe ser el responsable vigente de la actividad.

Cada problema informa `value_original`, `value_normalized`, `sheet`, `row_number` y `field`. El valor original también se conserva en `import_errors.details`. Cualquier error de referencia —inexistente, ambiguo, relación actividad-sector/instructor inconsistente o actividad sin instructor— hace fallar el dry-run y `apply` rechaza todo libro que contenga errores.

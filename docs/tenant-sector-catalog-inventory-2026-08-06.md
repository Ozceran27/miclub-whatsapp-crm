# Inventario de identidad sectorial (2026-08-06)

## Decisión

La identidad funcional de un sector es `miclub.sectors.id`, siempre dentro de
`club_id`. `name` y `code` son atributos mutables; `color` (y un eventual
`icon`) son presentación opcional. Ningún nombre crea, completa ni selecciona
un sector. Esta tarea no inserta sectores ni transforma datos persistidos.

## Referencias encontradas

| Área | Referencia | Clasificación / retiro |
| --- | --- | --- |
| Home | Las tarjetas fijas Fitness, Local 1, Salón, Aula y Cantina estaban en `useHomeDashboard.ts`. | Eliminadas; ahora se proyecta exactamente `SectorOperationalSummary.sectors`. |
| Visuales | `sectorVisualMeta.ts` normalizaba nombres para elegir icono y acento. | Eliminado; usa `color`/`icon` persistidos o fallback genérico. |
| Economía | `EconomyRankings.tsx` pedía visuales por `item.name`. | Eliminado; conserva identidad `item.id` y fallback genérico. |
| Administración | `SectorList.tsx` ya consume `/administration/sectors` y usa `sector.id`. | Aprobado, sin adaptación. |
| Dashboard PostgreSQL | `implementation.ts` conserva aliases, claves de snapshots y cálculos especiales por hoja. | Adaptador histórico de lectura; retiro **2026-12-31**, cuando no haya consumidores de los campos deprecados y todos los tenants estén reimportados. No alimenta el catálogo nuevo. |
| Contratos | `SourceSheet` y los campos `fitness/salon/aula/local1/cantina` modelan hojas históricas. | `SourceSheet` queda limitado a importación/CRM; los campos quedan deprecados temporalmente. `sectors[]` es el contrato canónico. |
| UI histórica fuera del alcance sectorial | CRM y Migración muestran “Hoja”, y `ModuleNav` conserva módulos nominales existentes. | Etiquetas de trazabilidad/navegación, no identidad sectorial. Retirar al migrar esas superficies, no usar en lógica nueva. |

## Reglas contables versus etiquetas históricas

Las reglas contables que se mantienen son: movimientos completados, ingresos
con signo positivo, egresos con signo negativo, ventana mensual argentina y
saldo a liquidar persistido. La clasificación transitoria de categorías en
`economyDomain.ts` es contable (aunque todavía debe migrarse a metadata
versionada) y no depende del nombre del sector.

`FITNESS`, `SALON`, `AULA`, `LOCAL_1`, `CANTINA`, nombres de rangos de Sheets y
claves como `fitness.settlement_balance` son etiquetas históricas. Solo pueden
existir en adaptadores de importación/reconciliación hasta el criterio de retiro
anterior; no son reglas contables ni identificadores tenant.

## Criterios de regresión

1. Un catálogo arbitrario produce una tarjeta por id y ninguna tarjeta para
   etiquetas históricas ausentes.
2. El mismo nombre en dos clubes conserva ids diferentes.
3. Renombrar dentro de un club conserva el id y actualiza únicamente el texto.
4. Un catálogo vacío produce cero tarjetas: nunca se sintetizan sectores.

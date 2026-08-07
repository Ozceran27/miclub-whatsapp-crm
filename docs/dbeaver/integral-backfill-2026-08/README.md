# Backfill integral histórico (ejecución manual)

Este runbook corresponde exclusivamente a la **Etapa A/B**. Codex no ejecutó
ningún `UPDATE`, `INSERT`, `DELETE`, DDL ni importación. La base no está accesible
desde este checkout (`.env.example` es el único archivo de entorno), por lo que
los conteos reales deben obtenerse exportando el resultado de `01` en DBeaver.
No se presentan conteos inventados.

## Orden obligatorio

1. Obtener un backup verificable fuera de estos scripts.
2. Ejecutar `01_pre_backfill_diagnostic.sql` (solo lectura) y exportar resultados.
3. Detenerse ante cualquier `BLOCKER` o más de un club operativo.
4. Revisar y completar únicamente los mapas explícitos temporales indicados en
   `04`, `07` y `10`; una coincidencia por nombre nunca basta para personas.
5. Ejecutar `02` a `11`, uno por uno. Cada archivo hace preflight y transacción.
6. Ejecutar `12`; solo endurece columnas si no quedan nulos.
7. Ejecutar `13` con auto-commit habilitado.
8. Ejecutar `14` y comparar los fingerprints financieros PRE/POST.
9. Conservar `15` junto con el backup y las salidas exportadas.

### Si la versión anterior de `03` falló por `is_system`

No continúe con `04`. El `RAISE EXCEPTION` revirtió por completo la transacción de
`03`, por lo que no dejó una aplicación parcial. No hace falta repetir `01` ni
`02` si ambos habían terminado con `COMMIT`. Abra la versión actual de `03`,
ejecútela completa (su primer `ROLLBACK` recupera la sesión), revise que reporte
exactamente tres decisiones y sólo entonces continúe con `04`. El script reutiliza
y protege coincidencias únicas existentes por código/nombre normalizado; crea
únicamente los sectores canónicos ausentes. Más de una coincidencia sigue siendo
`MANUAL_REVIEW` y revierte todo el script.

La trazabilidad de `sectors.created_by` y `sectors.updated_by` referencia
`miclub.people`; por eso `03` resuelve separadamente el `users.id` de Fernando
(audit log) y su `people.id` tenant-local (sectores). Nunca intercambie esos UUID.

`04` instala una función de compatibilidad para las dos variantes históricas de
`payment_allocations`: con `movement_id` protege esa relación; sin la columna
(modelo `receivable_id`) devuelve `false` sin referenciar una columna inexistente.
También reemplaza el trigger defectuoso creado por la migración antigua. Los
puntos `09` y `10` exigen esa función antes de tocar movimientos.

`07` reemplaza el validador histórico que comparaba `miclub.entity_status` con
literales ingleses inválidos. Usa `status::text` y reconoce tanto el schema legacy
(`active`, `archived`) como el real (`activa`, `cancelada`); no cambia estados.

No ejecutar la Etapa C (app, endpoints o import real) hasta confirmar por escrito
que `14` finalizó en `PASS`. Los scripts no cambian importes, fechas,
`external_id`, conceptos ni estados financieros, y nunca borran movimientos,
pagos, liquidaciones, personas, inscripciones o actividades.

## Convención de seguridad

El club se resuelve por `lower(btrim(name)) = 'miclub'`; Fernando se resuelve por
perfil vinculado (`people.user_id`) y nombre/apellido normalizados; DIRECTOR por
`roles.code`. Cada bloque exige cardinalidad exactamente uno. Las actualizaciones
tenant sólo afectan `club_id IS NULL`, después de demostrar que existe un único
club activo y que ningún dato operativo pertenece a otro club.

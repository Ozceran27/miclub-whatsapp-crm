# Asignación de movimientos a liquidaciones de actividades

## Decisión: los movimientos no se distribuyen

Un movimiento vinculado como `PAYMENT` o `ADVANCE` representa una unidad contable
indivisible y sólo puede pertenecer a una liquidación activa. El monto de la
allocation identifica cuánto aporta ese movimiento a la liquidación, pero no
habilita a fraccionar el mismo movimiento entre settlements.

Cuando una operación real deba aplicarse a más de una liquidación, se registrarán
movimientos separados por cada porción. Esto conserva una conciliación uno-a-uno,
evita disponibilidad derivada mutable y permite que PostgreSQL resuelva de forma
atómica dos intentos concurrentes de consumir el mismo movimiento.

La base aplica esta regla por tenant y tipo mediante la unicidad parcial de
`(club_id, movement_id, allocation_type)` mientras la allocation no tenga estado
`CANCELADO` ni `voided_at`. Una allocation cancelada o anulada libera el movimiento
para una nueva asignación explícita.

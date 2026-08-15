-- Decisión de dominio: un movimiento contable es una unidad indivisible. PAYMENT y
-- ADVANCE no pueden repartirse entre liquidaciones; si el pago debe dividirse, se
-- deben registrar movimientos contables separados.
--
-- La unicidad parcial también serializa inserciones concurrentes: PostgreSQL hace
-- esperar al segundo escritor y, al confirmar el primero, lo rechaza con 23505.
CREATE UNIQUE INDEX activity_settlement_allocations_active_movement_type_unique
  ON miclub.activity_settlement_allocations (club_id, movement_id, allocation_type)
  WHERE movement_id IS NOT NULL
    AND status <> 'CANCELADO'
    AND voided_at IS NULL;

COMMENT ON INDEX miclub.activity_settlement_allocations_active_movement_type_unique IS
  'PAYMENT y ADVANCE son indivisibles: un movimiento sólo puede estar asignado a una liquidación no cancelada por tipo.';

-- Mantener esta función sincronizada con packages/shared/src/moneyNormalization.ts
-- (normalizeMembershipFeeUnit). Replica exactamente la regla compartida de
-- cuota unitaria: reducir escala decimal solo mientras el importe absoluto sea
-- mayor a 100.000 y la división por 10 sea exacta.

begin;

create or replace function miclub.normalize_enrollment_fee_amount(value numeric)
returns numeric
language sql
immutable
as $$
  with recursive normalized(fee) as (
    select coalesce(value, 0::numeric)
    union all
    select fee / 10
    from normalized
    where abs(fee) > 100000
      and mod(fee, 10) = 0
  )
  select fee
  from normalized
  order by abs(fee) asc
  limit 1
$$;

commit;

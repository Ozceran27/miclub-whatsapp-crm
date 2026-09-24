import type { FinancialCircuit } from '@miclub/shared';
import { withTenantTransaction } from '../db/transaction.js';
import { readFinancialCircuit } from './financialCircuitService.js';

export type CanonicalSectorBalance = { sectorId: string; amount: number | null; currencyCode: string };

/** Aggregates the current circuit output. A mixed-currency or incomplete sector has no numeric total. */
export function aggregateSectorBalances(circuit: FinancialCircuit, baseCurrency: string, activitySectors: Map<string, string>): CanonicalSectorBalance[] {
  const totals = new Map<string, { cents: number; incomplete: boolean }>();
  const add = (sectorId: string, amount: number, currencyCode: string) => {
    const current = totals.get(sectorId) ?? { cents: 0, incomplete: false };
    current.incomplete ||= currencyCode !== baseCurrency || !Number.isFinite(amount);
    if (!current.incomplete) current.cents += Math.round(amount * 100);
    totals.set(sectorId, current);
  };
  for (const settlement of circuit.settlements) {
    const sectorId = activitySectors.get(settlement.activityId);
    if (sectorId) add(sectorId, settlement.balance, settlement.currencyCode);
  }
  for (const diagnostic of circuit.diagnostics) {
    const sectorId = activitySectors.get(diagnostic.activityId);
    if (sectorId) totals.set(sectorId, { cents: 0, incomplete: true });
  }
  return [...totals].map(([sectorId, total]) => ({ sectorId, amount: total.incomplete ? null : total.cents / 100, currencyCode: baseCurrency }));
}

export async function readCanonicalSectorBalances(clubId: string, preloadedCircuit?: FinancialCircuit): Promise<CanonicalSectorBalance[]> {
  const circuit = preloadedCircuit ?? await readFinancialCircuit({ clubId, permissions: ['sectors:any'], sectorIds: [] });
  const mapping = await withTenantTransaction(clubId, async db => {
    const club = (await db.query<{ base_currency_code: string }>('select base_currency_code from miclub.clubs where id=$1', [clubId])).rows[0];
    const activities = (await db.query<{ id: string; sector_id: string }>('select id::text,sector_id::text from miclub.activities where club_id=$1', [clubId])).rows;
    return { baseCurrency: club?.base_currency_code ?? '', activities: new Map(activities.map(activity => [activity.id, activity.sector_id])) };
  });
  return aggregateSectorBalances(circuit, mapping.baseCurrency, mapping.activities);
}

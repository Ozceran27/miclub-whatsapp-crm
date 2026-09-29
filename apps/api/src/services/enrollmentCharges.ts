export type FeeFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** Calculates from the original anchor, so January 31 returns to March 31 after February. */
export function feeDueDate(anchor: string, frequency: FeeFrequency, cycle: number): string {
  if (!Number.isSafeInteger(cycle) || cycle < 0) throw new Error('Ciclo inválido.');
  const date = utc(anchor);
  if (Number.isNaN(date.valueOf()) || iso(date) !== anchor) throw new Error('Fecha inválida.');
  if (frequency === 'DAILY' || frequency === 'WEEKLY') {
    date.setUTCDate(date.getUTCDate() + cycle * (frequency === 'WEEKLY' ? 7 : 1));
    return iso(date);
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + cycle * (frequency === 'YEARLY' ? 12 : 1);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), last))));
}

export function feeCyclesInMonth(anchor: string, frequency: FeeFrequency, month: string): Array<{dueDate:string;nextDueDate:string}> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido.');
  const first = `${month}-01`;
  const end = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)));
  const maxCycles = frequency === 'DAILY' ? 37000 : frequency === 'WEEKLY' ? 5400 : frequency === 'MONTHLY' ? 1250 : 110;
  const result: Array<{dueDate:string;nextDueDate:string}> = [];
  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const dueDate = feeDueDate(anchor, frequency, cycle);
    if (dueDate >= end) break;
    if (dueDate >= first) result.push({dueDate,nextDueDate:feeDueDate(anchor,frequency,cycle+1)});
  }
  return result;
}

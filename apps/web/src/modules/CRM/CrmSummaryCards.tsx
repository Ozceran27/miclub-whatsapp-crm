import type { CrmDebtSummary } from '@miclub/shared';
import { money } from './MembersTable';

export const CrmSummaryCards=({summary}:{summary:CrmDebtSummary|null})=><section className="dashboard">
  <article className="card"><h4>Inscripciones activas</h4><p>{summary?.totalEnrollments ?? '—'}</p></article>
  <article className="card"><h4>Con cuotas vencidas</h4><p>{summary?.overdueEnrollments ?? '—'}</p></article>
  <article className="card"><h4>Vencimientos pendientes</h4><p>{summary?.overdueInstallments ?? '—'}</p></article>
  <article className="card"><h4>Saldo comprobado</h4><p>{summary?money(summary.balances):'—'}</p></article>
  <article className="card"><h4>Para revisar sin cuota</h4><p>{summary?.reviewEnrollments ?? '—'}</p></article>
</section>;

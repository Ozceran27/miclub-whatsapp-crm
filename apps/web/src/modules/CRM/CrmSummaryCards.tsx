import type { Member } from '@miclub/shared';
import { formatArPeso } from '../../utils';
import type { Summary, SyncStatus } from './types';
import { Icon } from './Icon';

type Props = { summary: Summary | null; members: Member[]; debtors: Member[]; syncStatus: SyncStatus | null };
export const CrmSummaryCards = ({ summary, members, debtors, syncStatus }: Props) => {
  const syncMessage = !syncStatus ? 'Estado de sincronización no disponible' : syncStatus.error ? 'Google Sheets falló, usando datos mock' : syncStatus.source === 'google_sheets' ? 'Conectado a Google Sheets' : 'Usando datos mock';
  return <section className="dashboard">
    <article className="card"><h4><Icon label="👥" />Total inscriptos</h4><p>{summary?.totalMembers ?? members.length}</p></article>
    <article className="card"><h4><Icon label="💳" />Total adeudando</h4><p>{summary?.totalDebtors ?? debtors.length}</p></article>
    <article className="card"><h4><Icon label="$" />Deuda estimada</h4><p>{formatArPeso(summary?.totalEstimatedDebt ?? 0)}</p></article>
    <article className="card"><h4><Icon label="🧾" />Deudores sin pagos registrados</h4><p>{summary?.debtorsWithoutPayments ?? debtors.filter((d) => !d.lastPaymentAt).length}</p></article>
    <article className="card"><h4><Icon label="🗂" />Origen de datos</h4><p>{syncMessage}</p></article>
  </section>;
};

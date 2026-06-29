import type { HomeDashboardState } from './useHomeDashboard';

type Props = Pick<HomeDashboardState, 'error' | 'loading'>;

export function HomeAlerts({ error, loading }: Props) {
  return <>{error && <p className="error-msg">Error: {error}</p>}{loading && <p className="section-note">Cargando métricas del club...</p>}</>;
}

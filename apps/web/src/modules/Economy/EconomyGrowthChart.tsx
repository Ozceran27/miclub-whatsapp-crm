import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EconomyDashboardCollection, EconomyMonthlyEvolutionItem } from './types';

type Props = { monthlyEvolution: EconomyDashboardCollection<EconomyMonthlyEvolutionItem> };
const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const getMonthLabel = (item: EconomyMonthlyEvolutionItem) => monthFormatter.format(new Date(item.year, item.month - 1, 1));
const formatPercent = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Sin base comparable';

type TooltipProps = { active?: boolean; payload?: Array<{ payload?: EconomyMonthlyEvolutionItem & { label: string } }> };
function GrowthTooltip({ active, payload }: TooltipProps) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="economy-chart-tooltip"><strong>{item.label} {item.year}</strong><span>Crecimiento: {formatPercent(item.growth)}</span><span>Crec. económico: {formatPercent(item.economicGrowth)}</span><span>Crec. inscriptos: {formatPercent(item.clientGrowth)}</span></div>;
}

export function EconomyGrowthChart({ monthlyEvolution }: Props) {
  const data = monthlyEvolution.items.map((item) => ({ ...item, label: getMonthLabel(item), growth: typeof item.growth === 'number' && Number.isFinite(item.growth) ? item.growth : null }));
  return <article className="card home-kpi-card finance-card economy-chart-card economy-chart-card--growth"><div className="home-card-heading finance-card__header"><h4>🌱 Crecimiento mensual</h4><p>Ingresos e inscriptos acumulados vs mes anterior</p></div>{data.length > 0 ? <div className="economy-chart-card__canvas" aria-label="Gráfico de crecimiento mensual"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="rgba(143, 164, 200, 0.16)" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} tickFormatter={(value: number) => `${Number(value).toFixed(0)}%`} width={58} /><Tooltip content={<GrowthTooltip />} cursor={{ stroke: 'rgba(143, 216, 255, 0.35)' }} /><Line type="monotone" dataKey="growth" name="Crecimiento" stroke="#76f0c3" strokeWidth={3} dot={{ r: 3, fill: '#76f0c3' }} connectNulls /></LineChart></ResponsiveContainer></div> : <p className="economy-chart-empty">Sin crecimiento mensual disponible.</p>}</article>;
}

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatEconomyMoney } from './formatters';
import type { EconomyYearlyBreakdown, EconomyYearlySeries } from './types';

const INCOME_COLORS: Record<string, string> = {
  INSCRIPCION: '#76f0c3', CUOTA: '#8fd8ff', TURNOS: '#c6a6ff', COMISION: '#ffcf66', ALQUILER: '#ff9f7a',
  EVENTOS: '#f472b6', VENTAS: '#a3e635', CLASES: '#67e8f9', CURSOS: '#facc15', KIOSCO: '#fb7185', BEBIDAS: '#38bdf8',
};
const EXPENSE_COLORS: Record<string, string> = { OPERATING: '#ffad66', NON_OPERATING: '#ff6b7a', DEBT: '#c6a6ff', SERVICES: '#8fd8ff', TAXES: '#ffcf66' };

type ChartRow = { month: string; fullLabel: string; [key: string]: string | number };
type Props = { yearlyBreakdown: EconomyYearlyBreakdown };
type TooltipEntry = { name?: string; value?: number | string | null; color?: string; dataKey?: string; payload?: { fullLabel?: string } };
type TooltipProps = { active?: boolean; payload?: TooltipEntry[]; label?: string };

const toChartData = (months: EconomyYearlyBreakdown["months"], series: EconomyYearlySeries[]): ChartRow[] => months.map((month, index) => {
  const row: ChartRow = { month: month.label, fullLabel: month.fullLabel ?? month.label };
  for (const item of series) row[item.key] = item.values[index] ?? 0;
  return row;
});

function MultiSeriesTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return <div className="economy-chart-tooltip"><strong>{payload[0]?.payload?.fullLabel ?? label}</strong>{payload.map((entry) => <span key={entry.dataKey ?? entry.name} style={{ color: entry.color }}>{entry.name}: {formatEconomyMoney(Number(entry.value ?? 0))}</span>)}</div>;
}

function EconomyMultiSeriesLineChart({ title, subtitle, emptyMessage, series, months, colors, ariaLabel, note }: { title: string; subtitle: string; emptyMessage: string; series: EconomyYearlySeries[]; months: EconomyYearlyBreakdown["months"]; colors: Record<string, string>; ariaLabel: string; note?: string }) {
  const data = toChartData(months, series);
  const hasData = series.some((item) => item.values.some((value) => value !== 0));
  return (
    <article className="card home-kpi-card finance-card economy-chart-card economy-chart-card--yearly-breakdown">
      <div className="home-card-heading finance-card__header">
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      {hasData ? (
        <div className="economy-chart-card__canvas" aria-label={ariaLabel}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(143, 164, 200, 0.16)" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#91a4c8', fontSize: 11 }} tickFormatter={(value: number) => formatEconomyMoney(Number(value))} width={86} />
              <ReferenceLine y={0} stroke="rgba(244, 248, 255, 0.28)" />
              <Tooltip content={<MultiSeriesTooltip />} cursor={{ stroke: 'rgba(143, 216, 255, 0.35)' }} />
              <Legend wrapperStyle={{ color: '#9fb4d8', fontSize: 12, paddingTop: 8 }} />
              {series.map((item) => <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={colors[item.key] ?? '#d8e5ff'} strokeWidth={2.5} dot={{ r: 3, fill: colors[item.key] ?? '#d8e5ff' }} activeDot={{ r: 5 }} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="economy-chart-empty">{emptyMessage}</p>}
      {note ? <p className="economy-chart-note">{note}</p> : null}
    </article>
  );
}

export function EconomyYearlyBreakdownCharts({ yearlyBreakdown }: Props) {
  const unclassified = yearlyBreakdown.metadata?.unclassifiedExpenseCount ?? 0;
  const firstMonth = yearlyBreakdown.months[0]?.label;
  const lastMonth = yearlyBreakdown.months[yearlyBreakdown.months.length - 1]?.label;
  const subtitle = firstMonth && lastMonth ? `Evolución interanual · ${firstMonth} a ${lastMonth}` : 'Evolución interanual';
  return (
    <div className="economy-yearly-breakdown-grid" aria-label="Gráficos analíticos anuales de Economía Club">
      <EconomyMultiSeriesLineChart title="📈 Ingresos Operativos por Categoría" subtitle={subtitle} emptyMessage="Sin ingresos operativos para el período seleccionado." series={yearlyBreakdown.operatingIncomeByCategory} months={yearlyBreakdown.months} colors={INCOME_COLORS} ariaLabel="Gráfico de ingresos operativos por categoría" />
      <EconomyMultiSeriesLineChart title="📉 Gastos (Brutos) por Tipo " subtitle={subtitle} emptyMessage="Sin gastos clasificados para el período seleccionado." series={yearlyBreakdown.expensesByType} months={yearlyBreakdown.months} colors={EXPENSE_COLORS} ariaLabel="Gráfico de gastos por tipo" note={unclassified > 0 ? `${unclassified} movimientos de egreso sin clasificación no fueron incluidos.` : undefined} />
    </div>
  );
}

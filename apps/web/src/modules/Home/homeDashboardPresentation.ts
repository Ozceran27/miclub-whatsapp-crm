import type { Member, StatusBreakdown as ApiStatusBreakdown } from "@miclub/shared";
import type { ActivityBreakdownItem, StatusBreakdown } from "./useHomeDashboard.js";

export const MONTH_NAMES_ES_UPPER = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'] as const;

export const getCurrentSpanishMonthUpper = () => MONTH_NAMES_ES_UPPER[new Date().getMonth()];

export const STATUS_ALIASES: Record<string, 'current' | 'newEnrollment' | 'debtor' | 'abandoned' | 'cancelled'> = {
  'al dia': 'current', aldia: 'current', activo: 'current', activos: 'current',
  'nuevo inscripto': 'newEnrollment', nuevoinscripto: 'newEnrollment', 'nuevo inscrito': 'newEnrollment', nuevoinscrito: 'newEnrollment', nuevo: 'newEnrollment',
  adeudando: 'debtor', deudor: 'debtor', deudores: 'debtor', deuda: 'debtor',
  abandonado: 'abandoned', abandonada: 'abandoned', abandono: 'abandoned', inactivo: 'abandoned', inactivos: 'abandoned',
  cancelado: 'cancelled', cancelada: 'cancelled', cancelacion: 'cancelled'
};

export const normalizeText = (value?: string) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

export const formatDateTime = (value?: string) => {
  if (!value) return 'Sin sincronización registrada';
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};

export const normalizeStatus = (status?: string) => normalizeText(status).replace(/[-–—_/]+/g, ' ').replace(/[^a-z0-9ñ\s]/g, '').replace(/\s+/g, ' ').trim();

export const getStatusBucketFromRawStatus = (status?: string) => {
  const normalized = normalizeStatus(status);
  const compact = normalized.replace(/\s/g, '');
  if (STATUS_ALIASES[normalized]) return STATUS_ALIASES[normalized];
  if (STATUS_ALIASES[compact]) return STATUS_ALIASES[compact];
  if (normalized.includes('nuevo') && (normalized.includes('inscripto') || normalized.includes('inscrito'))) return 'newEnrollment';
  if (normalized.includes('abandon')) return 'abandoned';
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('adeud') || normalized.includes('deud')) return 'debtor';
  if (normalized.includes('al dia') || compact.includes('aldia')) return 'current';
  return undefined;
};

export const getStatusBucket = (member: Member) => getStatusBucketFromRawStatus(normalizeStatus(String(member.estado ?? '')));
export const isActiveMember = (member: Member) => !['abandoned', 'cancelled'].includes(getStatusBucket(member) ?? '');
export const isDebtor = (member: Member) => getStatusBucket(member) === 'debtor';

export const parseMemberFee = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9,-]/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const calculateWeightedAverageFee = (records: Member[]) => {
  const activeMembersWithFee = records.map((member) => ({ member, fee: parseMemberFee(member.cuota) })).filter(({ member, fee }) => isActiveMember(member) && fee > 0);
  if (activeMembersWithFee.length === 0) return undefined;
  return activeMembersWithFee.reduce((total, { fee }) => total + fee, 0) / activeMembersWithFee.length;
};

export const getActivityName = (member: Member) => member.actividad?.trim() || member.modalidad?.trim() || 'Sin actividad asignada';

export const getEnrollmentStatusBreakdown = (records: Member[], fallbackTotal?: number): StatusBreakdown => {
  const breakdown: StatusBreakdown = { total: records.length || fallbackTotal || 0, active: 0, current: 0, newEnrollment: 0, debtor: 0, abandoned: 0, cancelled: 0, others: 0 };
  records.forEach((member) => {
    const bucket = getStatusBucket(member);
    if (bucket === 'current') breakdown.current += 1;
    if (bucket === 'newEnrollment') breakdown.newEnrollment += 1;
    if (bucket === 'debtor') breakdown.debtor += 1;
    if (bucket === 'abandoned') breakdown.abandoned += 1;
    if (bucket === 'cancelled') breakdown.cancelled += 1;
    if (!bucket) breakdown.others += 1;
  });
  breakdown.active = records.filter(isActiveMember).length;
  return breakdown;
};

export const mapSummaryStatusBreakdown = (statusBreakdown?: ApiStatusBreakdown): StatusBreakdown | undefined => statusBreakdown ? {
  total: statusBreakdown.total, active: statusBreakdown.active, current: statusBreakdown.alDia, newEnrollment: statusBreakdown.nuevoInscripto, debtor: statusBreakdown.adeudando, abandoned: statusBreakdown.abandonado, cancelled: statusBreakdown.cancelado, others: statusBreakdown.otros
} : undefined;

export const buildActivityBreakdown = (records: Member[]): ActivityBreakdownItem[] => {
  const counts = new Map<string, number>();
  records.forEach((member) => counts.set(getActivityName(member), (counts.get(getActivityName(member)) ?? 0) + 1));
  return Array.from(counts.entries()).map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count || a.activity.localeCompare(b.activity, 'es'));
};

export const isFiniteNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

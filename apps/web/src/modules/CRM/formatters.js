import { formatArPeso } from '../../utils';
export const formatDateTime = (value) => {
    if (!value)
        return 'Sin fecha';
    return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
export const formatPaymentDate = (value) => {
    if (!value)
        return 'Sin pagos registrados';
    return new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
export const formatLastPayment = (member) => {
    if (!member.lastPaymentAt)
        return 'Sin pagos registrados';
    const amount = member.lastPaymentAmount !== undefined ? ` · ${formatArPeso(member.lastPaymentAmount)}` : '';
    return `${formatPaymentDate(member.lastPaymentAt)}${amount}`;
};
export const fill = (tpl, m) => {
    if (!m)
        return tpl;
    const values = {
        nombre: m.nombre,
        apellido: m.apellido,
        actividad: m.actividad ?? '',
        modalidad: m.modalidad ?? '',
        cuota: m.cuota !== undefined ? formatArPeso(m.cuota) : '',
        instructor: m.instructor ?? ''
    };
    return tpl.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};

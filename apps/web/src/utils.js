export const formatArPeso = (amount) => {
    if (typeof amount !== 'number' || Number.isNaN(amount))
        return '$0';
    return `$${Math.round(amount).toLocaleString('es-AR')}`;
};

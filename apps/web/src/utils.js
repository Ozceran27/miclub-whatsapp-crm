export const normalizeArPesoAmount = (amount) => {
    if (typeof amount !== 'number' || Number.isNaN(amount))
        return 0;
    if (amount === 0)
        return 0;
    const abs = Math.abs(amount);
    const looksLikeThousandsUnit = abs < 1000;
    return looksLikeThousandsUnit ? amount * 1000 : amount;
};
export const formatArPeso = (amount) => {
    const normalized = normalizeArPesoAmount(amount);
    return `$${Math.round(normalized).toLocaleString('es-AR')}`;
};

import { useEffect, useState } from 'react';
import { apiUrl } from '../../api';
export const useCrmData = () => {
    const [members, setMembers] = useState([]);
    const [debtors, setDebtors] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [summary, setSummary] = useState(null);
    const [prepared, setPrepared] = useState([]);
    const [history, setHistory] = useState([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyMeta, setHistoryMeta] = useState({ pageSize: 20, total: 0, totalPages: 0 });
    const [contactedRecent, setContactedRecent] = useState({ windowDays: 30, since: new Date(0).toISOString(), memberIds: [], byMemberId: {} });
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const loadHistory = async (page = 1) => {
        const res = await fetch(apiUrl(`/history?page=${page}&pageSize=20`));
        if (!res.ok) {
            const payload = (await res.json());
            throw new Error(payload.message ?? 'No se pudo cargar el historial.');
        }
        const payload = (await res.json());
        setHistory(payload.items);
        setHistoryPage(payload.page);
        setHistoryMeta({ pageSize: payload.pageSize, total: payload.total, totalPages: payload.totalPages });
    };
    const sync = async () => {
        setSyncing(true);
        setError(null);
        try {
            const [mRes, dRes, tRes, sRes, sumRes, hRes, cRes] = await Promise.all([
                fetch(apiUrl('/members')),
                fetch(apiUrl('/debtors')),
                fetch(apiUrl('/templates')),
                fetch(apiUrl('/sync-status')),
                fetch(apiUrl('/summary')),
                fetch(apiUrl('/history?page=1&pageSize=20')),
                fetch(apiUrl('/contacted-recent'))
            ]);
            if (!mRes.ok || !dRes.ok || !tRes.ok || !sRes.ok || !sumRes.ok || !hRes.ok || !cRes.ok) {
                throw new Error('No se pudo sincronizar la información.');
            }
            const [m, d, t, s, sum, h, c] = await Promise.all([mRes.json(), dRes.json(), tRes.json(), sRes.json(), sumRes.json(), hRes.json(), cRes.json()]);
            setMembers(m);
            setDebtors(d);
            setTemplates(t);
            setSyncStatus(s);
            setSummary(sum);
            const historyPayload = h;
            setHistory(historyPayload.items);
            setHistoryPage(historyPayload.page);
            setHistoryMeta({ pageSize: historyPayload.pageSize, total: historyPayload.total, totalPages: historyPayload.totalPages });
            setContactedRecent(c);
            return t;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
            return [];
        }
        finally {
            setSyncing(false);
        }
    };
    useEffect(() => {
        void sync();
    }, []);
    return { members, debtors, templates, setTemplates, summary, prepared, setPrepared, history, historyPage, historyMeta, contactedRecent, syncStatus, syncing, error, setError, loadHistory, sync };
};

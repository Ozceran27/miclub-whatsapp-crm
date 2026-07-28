import { useEffect, useState } from 'react';
import type { ContactedRecentResponse, Member, MessageTemplate, PreparedMessage } from '@miclub/shared';
import { crmApi } from '../../services/api/crmApi';
import type { Summary, SyncStatus } from './types';

export const useCrmData = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [debtors, setDebtors] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prepared, setPrepared] = useState<PreparedMessage[]>([]);
  const [history, setHistory] = useState<PreparedMessage[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyMeta, setHistoryMeta] = useState({ pageSize: 20, total: 0, totalPages: 0 });
  const [contactedRecent, setContactedRecent] = useState<ContactedRecentResponse>({ windowDays: 30, since: new Date(0).toISOString(), memberIds: [], byMemberId: {} });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (page = 1) => {
    const payload = await crmApi.history(page);
    setHistory(payload.items);
    setHistoryPage(payload.page);
    setHistoryMeta({ pageSize: payload.pageSize, total: payload.total, totalPages: payload.totalPages });
  };

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const [m, d, t, s, sum, h, c] = await Promise.all([
        crmApi.members(), crmApi.debtors(), crmApi.templates(), crmApi.syncStatus(), crmApi.summary(), crmApi.history(), crmApi.contactedRecent()
      ]);
      setMembers(m); setDebtors(d); setTemplates(t); setSyncStatus(s); setSummary(sum);
      const historyPayload = h;
      setHistory(historyPayload.items);
      setHistoryPage(historyPayload.page);
      setHistoryMeta({ pageSize: historyPayload.pageSize, total: historyPayload.total, totalPages: historyPayload.totalPages });
      setContactedRecent(c);
      return t;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido al sincronizar.');
      return [];
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void sync();
  }, []);

  return { members, debtors, templates, setTemplates, summary, prepared, setPrepared, history, historyPage, historyMeta, contactedRecent, syncStatus, syncing, error, setError, loadHistory, sync };
};

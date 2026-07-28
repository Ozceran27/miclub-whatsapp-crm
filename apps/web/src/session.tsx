import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from './api';
import { readSessionTenant, type SessionTenant } from './tenantScope';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
type SessionValue = {
  status: SessionStatus;
  authEnabled: boolean;
  isAuthenticated: boolean;
  username: string | null;
  clubId: string | null;
  membershipId: string | null;
  authenticate: (username: string | null, user?: SessionTenant | null) => void;
  selectClub: (membershipId: string) => Promise<void>;
  logout: () => Promise<void>;
};

type AuthPayload = {
  authenticated: boolean;
  authEnabled?: boolean;
  username?: string | null;
  user?: SessionTenant | null;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [clubId, setClubId] = useState<string | null>(null);
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const sessionChannel = useRef<BroadcastChannel | null>(null);
  const authGeneration = useRef(0);

  const applyTenant = useCallback((user?: SessionTenant | null) => {
    const tenant = readSessionTenant(user);
    setClubId(tenant.clubId);
    setMembershipId(tenant.membershipId);
  }, []);

  const authenticate = useCallback((nextUsername: string | null, user?: SessionTenant | null) => {
    authGeneration.current += 1;
    setUsername(nextUsername);
    applyTenant(user);
    setStatus('authenticated');
  }, [applyTenant]);

  const expireSession = useCallback(() => {
    authGeneration.current += 1;
    setAuthEnabled(true);
    setUsername(null);
    applyTenant(null);
    setStatus('anonymous');
  }, [applyTenant]);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('miclub-auth');
    sessionChannel.current = channel;
    channel.addEventListener('message', (event) => {
      if (event.data === 'logout') expireSession();
    });
    return () => {
      sessionChannel.current = null;
      channel.close();
    };
  }, [expireSession]);

  useEffect(() => {
    window.addEventListener('miclub:session-expired', expireSession);
    return () => window.removeEventListener('miclub:session-expired', expireSession);
  }, [expireSession]);

  useEffect(() => {
    const checkSession = async () => {
      const generation = authGeneration.current;
      try {
        const response = await apiFetch('/auth/me', { cache: 'no-store' }, { revalidate401: false });
        const payload = await response.json() as AuthPayload;
        if (generation !== authGeneration.current) return;
        setAuthEnabled(Boolean(payload.authEnabled));
        setUsername(payload.username ?? null);
        applyTenant(payload.user);
        setStatus(response.ok && payload.authenticated ? 'authenticated' : 'anonymous');
      } catch {
        if (generation !== authGeneration.current) return;
        setStatus('error');
      }
    };
    void checkSession();
  }, [applyTenant]);

  const selectClub = useCallback(async (nextMembershipId: string) => {
    const generation = ++authGeneration.current;
    const response = await apiFetch('/auth/clubs/select', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membershipId: nextMembershipId })
    });
    const payload = await response.json() as AuthPayload;
    if (!response.ok || !payload.authenticated) throw new Error(`No se pudo seleccionar el club (${response.status})`);
    if (generation !== authGeneration.current) return;
    applyTenant(payload.user);
    setStatus('authenticated');
  }, [applyTenant]);

  const logout = useCallback(async () => {
    const response = await apiFetch('/auth/logout', { method: 'POST', cache: 'no-store' }, { revalidate401: false });
    if (!response.ok) throw new Error(`No se pudo cerrar la sesión (${response.status})`);
    expireSession();
    sessionChannel.current?.postMessage('logout');
  }, [expireSession]);

  const value = useMemo(() => ({
    status, authEnabled, isAuthenticated: status === 'authenticated', username, clubId, membershipId,
    authenticate, selectClub, logout
  }), [authEnabled, authenticate, clubId, logout, membershipId, selectClub, status, username]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}

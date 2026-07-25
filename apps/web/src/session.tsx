import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiFetch } from './api';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';
type SessionValue = {
  status: SessionStatus;
  authEnabled: boolean;
  isAuthenticated: boolean;
  username: string | null;
  authenticate: (username: string | null) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const sessionChannel = useRef<BroadcastChannel | null>(null);
  const authGeneration = useRef(0);

  const authenticate = useCallback((nextUsername: string | null) => {
    authGeneration.current += 1;
    setUsername(nextUsername);
    setStatus('authenticated');
  }, []);

  const expireSession = useCallback(() => {
    authGeneration.current += 1;
    setAuthEnabled(true);
    setUsername(null);
    setStatus('anonymous');
  }, []);

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
        const payload = await response.json() as { authenticated: boolean; authEnabled?: boolean; username?: string | null };
        if (generation !== authGeneration.current) return;
        setAuthEnabled(Boolean(payload.authEnabled));
        setUsername(payload.username ?? null);
        setStatus(response.ok && payload.authenticated ? 'authenticated' : 'anonymous');
      } catch {
        if (generation !== authGeneration.current) return;
        setStatus('error');
      }
    };
    void checkSession();
  }, [expireSession]);

  const logout = useCallback(async () => {
    const response = await apiFetch('/auth/logout', { method: 'POST', cache: 'no-store' }, { revalidate401: false });
    if (!response.ok) throw new Error(`No se pudo cerrar la sesión (${response.status})`);
    expireSession();
    sessionChannel.current?.postMessage('logout');
  }, [expireSession]);

  const value = useMemo(() => ({
    status, authEnabled, isAuthenticated: status === 'authenticated', username, authenticate, logout
  }), [authEnabled, authenticate, logout, status, username]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}

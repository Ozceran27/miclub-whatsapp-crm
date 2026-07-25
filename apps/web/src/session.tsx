import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiUrl } from './api';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
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

  const authenticate = useCallback((nextUsername: string | null) => {
    setUsername(nextUsername);
    setStatus('authenticated');
  }, []);

  const expireSession = useCallback(() => {
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
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const response = await originalFetch(input, { credentials: 'include', ...init });
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (response.status === 401 && !url.includes('/auth/')) expireSession();
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, [expireSession]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch(apiUrl('/auth/me'), { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudo validar la sesión (${response.status})`);
        const payload = await response.json() as { authenticated: boolean; authEnabled?: boolean; username?: string | null };
        setAuthEnabled(Boolean(payload.authEnabled));
        setUsername(payload.username ?? null);
        setStatus(payload.authenticated ? 'authenticated' : 'anonymous');
      } catch {
        // Nunca convertir un error de red, proxy o JSON en una sesión válida.
        expireSession();
      }
    };
    void checkSession();
  }, [expireSession]);

  const logout = useCallback(async () => {
    const response = await fetch(apiUrl('/auth/logout'), { method: 'POST', cache: 'no-store' });
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

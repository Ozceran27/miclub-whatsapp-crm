import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiUrl } from './api';

type SessionStatus = 'loading' | 'authenticated' | 'anonymous';
type SessionValue = {
  status: SessionStatus;
  authEnabled: boolean;
  isAuthenticated: boolean;
  username: string | null;
  canAccessDataMigration: boolean;
  authenticate: (username: string | null, canAccessDataMigration?: boolean) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [authEnabled, setAuthEnabled] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [canAccessDataMigration, setCanAccessDataMigration] = useState(false);

  const authenticate = useCallback((nextUsername: string | null, migrationAccess = false) => {
    setUsername(nextUsername);
    setCanAccessDataMigration(migrationAccess);
    setStatus('authenticated');
  }, []);

  const expireSession = useCallback(() => {
    setAuthEnabled(true);
    setUsername(null);
    setCanAccessDataMigration(false);
    setStatus('anonymous');
  }, []);

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
        const response = await fetch(apiUrl('/auth/me'));
        const payload = await response.json() as { authenticated: boolean; authEnabled?: boolean; username?: string | null; canAccessDataMigration?: boolean };
        setAuthEnabled(Boolean(payload.authEnabled));
        setUsername(payload.username ?? null);
        setCanAccessDataMigration(Boolean(payload.canAccessDataMigration));
        setStatus(payload.authenticated ? 'authenticated' : 'anonymous');
      } catch {
        setAuthEnabled(false);
        setStatus('authenticated');
      }
    };
    void checkSession();
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(apiUrl('/auth/logout'), { method: 'POST' });
    } finally {
      // A network failure must never leave private UI mounted with stale local
      // session state. The server cookie will be retried/validated on reload.
      expireSession();
    }
  }, [expireSession]);

  const value = useMemo(() => ({
    status, authEnabled, isAuthenticated: status === 'authenticated', username, canAccessDataMigration, authenticate, logout
  }), [authEnabled, authenticate, canAccessDataMigration, logout, status, username]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession debe usarse dentro de SessionProvider');
  return context;
}

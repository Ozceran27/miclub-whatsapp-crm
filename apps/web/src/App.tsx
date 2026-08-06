import { useEffect } from 'react';
import { Router, useRouter } from './router';
import { SessionProvider, useSession } from './session';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import ProtectedAppShell from './pages/ProtectedAppShell';
import RegisterPage from './pages/RegisterPage';
import { TenantCacheBoundary } from './serverState/TenantCacheBoundary';

function AppRoutes() {
  const { path, navigate } = useRouter();
  const { status, isAuthenticated } = useSession();

  useEffect(() => {
    if (status === 'loading' || status === 'error') return;
    if (path.startsWith('/app') && !isAuthenticated) navigate('/login', { replace: true });
    if ((path === '/login' || path === '/register') && isAuthenticated) navigate('/app', { replace: true });
  }, [isAuthenticated, navigate, path, status]);

  if (status === 'loading') return <div className="auth-loading">Cargando acceso seguro…</div>;
  if (status === 'error') return <div className="auth-loading" role="alert">No se pudo validar la sesión. Revisá la conexión e intentá nuevamente.</div>;
  if (path.startsWith('/app')) return isAuthenticated ? <ProtectedAppShell /> : null;
  if (path === '/login') return isAuthenticated ? null : <LoginPage />;
  if (path === '/register') return isAuthenticated ? null : <RegisterPage />;
  return <LandingPage />;
}

export default function App() {
  return (
    <Router>
      <SessionProvider>
        <TenantCacheBoundary><AppRoutes /></TenantCacheBoundary>
      </SessionProvider>
    </Router>
  );
}

import { useState } from 'react';
import { login } from '../services/api/authApi';
import { Link, useRouter } from '../router';
import { useSession } from '../session';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { authenticate } = useSession();
  const { navigate } = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setIsLoading(true);
    try {
      const payload = await login(username, password);
      if (!payload.authenticated) {
        setError(payload?.message ?? 'No se pudo iniciar sesión. Revisá tus credenciales.'); return;
      }
      authenticate(payload.username ?? null, payload.user); navigate('/app', { replace: true });
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor local.'); }
    finally { setIsLoading(false); }
  };

  return (
    <main className="login-page">
      <Link className="auth-back" to="/">← Volver al inicio</Link>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <img src="/logo/miClub - Logo trans.png" alt="miClub" className="login-logo" />
          <p className="eyebrow">Acceso seguro</p><h1 id="login-title">Bienvenido de nuevo</h1>
          <p>Ingresá para continuar con la gestión de tu club.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>Correo o usuario<input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} disabled={isLoading} required /></label>
          <label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={isLoading} required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'Ingresando…' : 'Ingresar al panel'}</button>
        </form>
        <p className="auth-switch">¿Todavía no tenés una cuenta? <Link to="/register">Registrate</Link></p>
      </section>
    </main>
  );
}

import { useState } from 'react';
import { apiUrl } from './api';


type LoginScreenProps = {
  onAuthenticated: (username: string | null) => void;
};

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const payload = await response.json().catch(() => null) as { authenticated?: boolean; username?: string; message?: string } | null;

      if (!response.ok || !payload?.authenticated) {
        setError(payload?.message ?? 'No se pudo iniciar sesión. Revisá tus credenciales.');
        return;
      }

      onAuthenticated(payload.username ?? null);
    } catch {
      setError('No se pudo conectar con el servidor local.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <img src="/logo/miClub - Logo trans.png" alt="miClub" className="login-logo" />
          <p className="eyebrow">Acceso seguro</p>
          <h1 id="login-title">miClub Gestión</h1>
          <p>Acceso al panel operativo del club</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Usuario
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading}
              required
            />
          </label>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-submit" type="submit" disabled={isLoading}>
            {isLoading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}

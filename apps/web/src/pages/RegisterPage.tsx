import { useState } from 'react';
import { register } from '../services/api/authApi';
import { Link, useRouter } from '../router';
import { useSession } from '../session';

export default function RegisterPage() {
  const [clubName, setClubName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [isLoading, setIsLoading] = useState(false);
  const { authenticate } = useSession(); const { navigate } = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError('La contraseña debe tener al menos 10 caracteres e incluir letras y números.'); return; }
    setIsLoading(true);
    try {
      const payload = await register(clubName, email, password);
      if (!payload.authenticated) { setError(payload.message ?? 'El registro todavía no está disponible para este club.'); return; }
      authenticate(payload.username ?? email); navigate('/app', { replace: true });
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor local.'); }
    finally { setIsLoading(false); }
  };

  return (
    <main className="login-page">
      <Link className="auth-back" to="/">← Volver al inicio</Link>
      <section className="login-card" aria-labelledby="register-title">
        <div className="login-brand"><img src="/logo/miClub - Logo trans.png" alt="miClub" className="login-logo" /><p className="eyebrow">Empezá hoy</p><h1 id="register-title">Creá tu cuenta</h1><p>Prepará un espacio de gestión para tu comunidad.</p></div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>Nombre del club<input autoFocus autoComplete="organization" value={clubName} onChange={(event) => setClubName(event.target.value)} disabled={isLoading} required /></label>
          <label>Correo electrónico<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isLoading} required /></label>
          <label>Contraseña<input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} disabled={isLoading} required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'Creando cuenta…' : 'Crear cuenta'}</button>
        </form>
        <p className="auth-switch">¿Ya tenés una cuenta? <Link to="/login">Ingresá</Link></p>
      </section>
    </main>
  );
}

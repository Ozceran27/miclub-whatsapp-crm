import { useState } from 'react';
import { register } from '../services/api/authApi';
import { Link } from '../router';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', dni: '', phone: '', clubName: '', email: '', password: '' });
  const [error, setError] = useState(''); const [isLoading, setIsLoading] = useState(false); const [created, setCreated] = useState(false);
  const field = (name: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: event.target.value });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) { setError('La contraseña debe tener al menos 10 caracteres e incluir letras y números.'); return; }
    setIsLoading(true);
    try {
      await register({ firstName: form.firstName, lastName: form.lastName, dni: form.dni, phone: form.phone, email: form.email, password: form.password, club: { name: form.clubName } });
      setCreated(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo conectar con el servidor local.'); }
    finally { setIsLoading(false); }
  };

  return <main className="login-page">
    <Link className="auth-back" to="/">← Volver al inicio</Link>
    <section className="login-card" aria-labelledby="register-title">
      <div className="login-brand"><img src="/logo/miClub - Logo trans.png" alt="miClub" className="login-logo" />
        {created ? <><h1 id="register-title">¡Usuario creado de manera exitosa!</h1><p>Ya podés ingresar con tu correo y contraseña.</p></> : <><p className="eyebrow">Empezá hoy</p><h1 id="register-title">Creá tu cuenta</h1><p>Prepará un espacio de gestión para tu comunidad.</p></>}
      </div>
      {created ? <Link className="login-submit" to="/login">Volver al Login</Link> : <form className="login-form" onSubmit={handleSubmit}>
        <label>Nombre<input autoFocus autoComplete="given-name" value={form.firstName} onChange={field('firstName')} disabled={isLoading} required /></label>
        <label>Apellido<input autoComplete="family-name" value={form.lastName} onChange={field('lastName')} disabled={isLoading} required /></label>
        <label>DNI<input inputMode="numeric" value={form.dni} onChange={field('dni')} disabled={isLoading} required /></label>
        <label>Teléfono<input type="tel" autoComplete="tel" value={form.phone} onChange={field('phone')} disabled={isLoading} required /></label>
        <label>Nombre del club<input autoComplete="organization" value={form.clubName} onChange={field('clubName')} disabled={isLoading} required /></label>
        <label>Correo electrónico<input type="email" autoComplete="email" value={form.email} onChange={field('email')} disabled={isLoading} required /></label>
        <label>Contraseña<input type="password" autoComplete="new-password" minLength={10} value={form.password} onChange={field('password')} disabled={isLoading} required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={isLoading}>{isLoading ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>}
      {!created && <p className="auth-switch">¿Ya tenés una cuenta? <Link to="/login">Ingresá</Link></p>}
    </section>
  </main>;
}

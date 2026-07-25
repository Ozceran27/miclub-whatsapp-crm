import { Link } from '../router';
import { useSession } from '../session';
import { useTheme } from '../theme';

const FEATURES = [
  ['Una sola vista', 'Centralizá socios, conversaciones, pagos y actividades sin perder contexto.'],
  ['Decisiones claras', 'Consultá indicadores operativos y económicos preparados para actuar.'],
  ['Seguimiento cercano', 'Organizá cada contacto y mantené a tu comunidad siempre conectada.']
];

export default function LandingPage() {
  const { isAuthenticated } = useSession();
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="landing-page">
      <nav className="public-nav" aria-label="Navegación principal">
        <Link className="brand-link" to="/">
          <img src="/logo/miClub - Logo trans.png" alt="" />
          <span>miClub</span>
        </Link>
        <div className="public-nav__actions">
          <button className="theme-icon-btn" type="button" onClick={toggleTheme} aria-label="Cambiar tema">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {!isAuthenticated && <Link className="text-link" to="/login">Ingresar</Link>}
          <Link className="primary-link" to={isAuthenticated ? '/app' : '/register'}>
            {isAuthenticated ? 'Ir al panel' : 'Crear cuenta'}
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="eyebrow">Gestión que acerca</p>
          <h1>Tu club, más conectado que nunca.</h1>
          <p className="landing-lead">Una plataforma simple para ordenar la gestión, entender el presente y fortalecer el vínculo con cada socio.</p>
          <div className="landing-cta">
            <Link className="primary-link primary-link--large" to={isAuthenticated ? '/app' : '/register'}>
              {isAuthenticated ? 'Abrir miClub' : 'Empezar ahora'} <span aria-hidden="true">→</span>
            </Link>
            <Link className="secondary-link" to="/login">Ya tengo una cuenta</Link>
          </div>
        </div>
        <div className="hero-visual" aria-label="Vista resumida del panel de miClub">
          <div className="hero-visual__glow" />
          <div className="hero-dashboard">
            <div className="hero-dashboard__top"><span /><span /><span /></div>
            <div className="hero-dashboard__content">
              <div className="hero-dashboard__side"><b>miClub</b><i /><i /><i /><i /></div>
              <div className="hero-dashboard__main">
                <small>Resumen del club</small><h2>Todo marcha bien 👋</h2>
                <div className="hero-metrics"><span><b>1.248</b> Socios</span><span><b>92%</b> Cuotas al día</span><span><b>18</b> Actividades</span></div>
                <div className="hero-chart"><i /><i /><i /><i /><i /><i /><i /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-features" aria-label="Beneficios de miClub">
        {FEATURES.map(([title, description], index) => (
          <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{description}</p></article>
        ))}
      </section>
    </main>
  );
}

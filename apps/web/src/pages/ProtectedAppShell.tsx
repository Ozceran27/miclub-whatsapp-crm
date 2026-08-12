import { useState } from 'react';
import AdministrationModule from '../modules/AdministrationModule';
import CrmModule from '../modules/CrmModule';
import DataMigrationModule from '../modules/DataMigrationModule';
import EconomyModule from '../modules/EconomyModule';
import HomeModule from '../modules/HomeModule';
import ModuleNav, { type ModuleDefinition, type ModuleId } from '../modules/ModuleNav';
import PlaceholderModule from '../modules/PlaceholderModule';
import { useRouter } from '../router';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { tenantModuleKey } from '../tenantScope';
import { hasAdministrationCapability, visibleModules } from '../administrationCapabilities';
import { OnboardingGate } from '../modules/Onboarding/OnboardingGate';

const MODULES: ModuleDefinition[] = [
  { id: 'home', label: 'INICIO' }, { id: 'economy', label: 'ECONOMÍA CLUB' }, { id: 'fitness', label: 'ESPACIO FITNESS' },
  { id: 'salon', label: 'SALÓN' }, { id: 'aula', label: 'AULA' }, { id: 'local1', label: 'LOCAL 1' },
  { id: 'cantina', label: 'CANTINA' }, { id: 'crm', label: 'CRM' }, { id: 'administration', label: 'ADMINISTRACIÓN' }, { id: 'dataMigration', label: 'MIGRACIÓN' }
];

const PLACEHOLDERS: Record<Exclude<ModuleId, 'home' | 'economy' | 'crm' | 'administration' | 'dataMigration'>, { title: string; description: string; futureItems: string[] }> = {
  fitness: { title: 'Espacio Fitness', description: 'Gestión operativa del espacio de entrenamiento, cuotas, pagos y actividades vinculadas a Fitness.', futureItems: ['Inscriptos.', 'Deudores.', 'Ingresos por cuotas.', 'Últimos pagos.', 'Actividades.', 'Instructores.'] },
  salon: { title: 'Salón', description: 'Seguimiento de actividades, cuotas y posibles eventos o alquileres del salón.', futureItems: ['Actividades.', 'Inscriptos.', 'Cuotas.', 'Eventos o alquileres futuros.'] },
  aula: { title: 'Aula', description: 'Base para administrar talleres, cursos, inscriptos e ingresos asociados al aula.', futureItems: ['Talleres.', 'Cursos.', 'Inscriptos.', 'Ingresos.'] },
  local1: { title: 'Local 1', description: 'Control de movimientos, ingresos, comisiones y saldos a liquidar del Local 1.', futureItems: ['Movimientos.', 'Ingresos.', 'Saldo a liquidar.', 'Comisiones.'] },
  cantina: { title: 'Cantina', description: 'Espacio preparado para ventas, liquidaciones, saldos y movimientos de Cantina.', futureItems: ['Ventas.', 'Liquidación.', 'Saldos.', 'Movimientos.'] }
};

const isModuleId = (value: string): value is ModuleId => MODULES.some(({ id }) => id === value);

export default function ProtectedAppShell() {
  const { path, navigate } = useRouter();
  const rawPathModule = path.split('/')[2] ?? 'home';
  const pathModule = rawPathModule === 'migration' ? 'dataMigration' : rawPathModule;
  const { username, clubId, permissions, logout } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const requestedModule: ModuleId = isModuleId(pathModule) ? pathModule : 'home';
  const currentModule: ModuleId = requestedModule;
  const modules = visibleModules(MODULES, permissions);
  const canOpenAdministration = hasAdministrationCapability(permissions, 'enter');
  const { theme, toggleTheme } = useTheme();

  const selectModule = (module: ModuleId) => navigate(module === 'home' ? '/app' : `/app/${module}`);
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setLogoutError('');
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('No se pudo cerrar la sesión. Verificá la conexión e intentá nuevamente.');
      setIsLoggingOut(false);
    }
  };
  const renderModule = () => {
    if (currentModule === 'home') return <HomeModule onOpenModule={selectModule} />;
    if (currentModule === 'economy') return <EconomyModule />;
    if (currentModule === 'crm') return <CrmModule />;
    if (currentModule === 'administration') {
      if (!canOpenAdministration) return <section className="section-panel" role="alert"><p className="eyebrow">Acceso denegado</p><h2>No tenés acceso a Administración</h2><p>Tu membresía actual no incluye permiso para consultar este módulo.</p><button className="ghost-btn" type="button" onClick={() => navigate('/app', { replace: true })}>Volver al inicio</button></section>;
      return <AdministrationModule />;
    }
    if (currentModule === 'dataMigration') return <DataMigrationModule />;
    return <PlaceholderModule {...PLACEHOLDERS[currentModule]} />;
  };

  return (
    <OnboardingGate><div className="container app-shell">
      <header className="app-header">
        <img src="/logo/miClub - Logo trans.png" alt="miClub" className="club-logo" />
        <div><h1>miClub Gestión</h1><p>App operativa y de Gestión para tu club</p></div>
        <div className="app-header__actions">
          <button className="ghost-btn theme-toggle" type="button" onClick={toggleTheme} aria-pressed={theme === 'light'}><span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</button>
          <button className="ghost-btn logout-btn" type="button" onClick={() => void handleLogout()} disabled={isLoggingOut}>
            {isLoggingOut ? 'Cerrando sesión…' : `Cerrar sesión${username ? ` · ${username}` : ''}`}
          </button>
        </div>
      </header>
      {logoutError && <p className="login-error" role="alert">{logoutError}</p>}
      <ModuleNav modules={modules} currentModule={currentModule} onSelect={selectModule} />
      <div key={tenantModuleKey(clubId, currentModule)}>{renderModule()}</div>
    </div></OnboardingGate>
  );
}

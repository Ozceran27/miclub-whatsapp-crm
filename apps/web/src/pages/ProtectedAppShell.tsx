import { useEffect, useMemo, useState } from 'react';
import AdministrationModule from '../modules/AdministrationModule';
import CrmModule from '../modules/CrmModule';
import DataMigrationModule from '../modules/DataMigrationModule';
import EconomyModule from '../modules/EconomyModule';
import HomeModule from '../modules/HomeModule';
import ModuleNav, { type CoreModuleId, type ModuleDefinition, type ModuleId } from '../modules/ModuleNav';
import PlaceholderModule from '../modules/PlaceholderModule';
import { useRouter } from '../router';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { tenantModuleKey } from '../tenantScope';
import { hasAdministrationCapability, visibleModules } from '../administrationCapabilities';
import { OnboardingGate } from '../modules/Onboarding/OnboardingGate';
import { getNavigation, type BackendNavigation } from '../services/api/navigationApi';

const CORE_LABELS: Record<CoreModuleId, string> = { home: 'INICIO', economy: 'ECONOMÍA CLUB', crm: 'CRM', administration: 'ADMINISTRACIÓN', dataMigration: 'MIGRACIÓN' };
const isCoreModule = (value: string): value is CoreModuleId => value in CORE_LABELS;

export default function ProtectedAppShell() {
  const { path, navigate } = useRouter();
  const { username, clubId, permissions, logout } = useSession();
  const [navigation, setNavigation] = useState<BackendNavigation>({ modules: ['home'], sectors: [] });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => { const controller = new AbortController(); getNavigation(controller.signal).then(setNavigation).catch(() => undefined); return () => controller.abort(); }, [clubId]);
  const modules = useMemo(() => visibleModules([
    ...navigation.modules.map((id) => ({ id, label: CORE_LABELS[id] })),
    ...navigation.sectors.map((sector) => ({ id: `sector:${sector.id}` as const, label: sector.name.toLocaleUpperCase('es-AR') })),
  ] satisfies ModuleDefinition[], permissions), [navigation, permissions]);
  const segment = decodeURIComponent(path.split('/')[2] ?? 'home');
  const requested: ModuleId = segment === 'migration' ? 'dataMigration' : isCoreModule(segment) ? segment : segment.startsWith('sector:') ? segment as `sector:${string}` : 'home';
  const currentModule = modules.some(({ id }) => id === requested) ? requested : 'home';
  const sector = currentModule.startsWith('sector:') ? navigation.sectors.find(({ id }) => id === currentModule.slice(7)) : undefined;
  const canOpenAdministration = hasAdministrationCapability(permissions, 'enter');
  const selectModule = (module: ModuleId) => navigate(module === 'home' ? '/app' : `/app/${encodeURIComponent(module)}`);
  const handleLogout = async () => { if (isLoggingOut) return; setLogoutError(''); setIsLoggingOut(true); try { await logout(); navigate('/login', { replace: true }); } catch { setLogoutError('No se pudo cerrar la sesión. Verificá la conexión e intentá nuevamente.'); setIsLoggingOut(false); } };
  const renderModule = () => {
    if (currentModule === 'home') return <HomeModule onOpenModule={selectModule} />;
    if (currentModule === 'economy') return <EconomyModule />;
    if (currentModule === 'crm') return <CrmModule />;
    if (currentModule === 'administration') return canOpenAdministration ? <AdministrationModule /> : <section className="section-panel" role="alert"><h2>No tenés acceso a Administración</h2></section>;
    if (currentModule === 'dataMigration') return <DataMigrationModule />;
    return <PlaceholderModule title={sector?.name ?? 'Sector'} description="Sector configurado para este club desde el catálogo persistido." futureItems={['Actividades.', 'Inscriptos.', 'Movimientos.', 'Liquidaciones.']} />;
  };
  return <OnboardingGate><div className="container app-shell"><header className="app-header"><img src="/logo/miClub - Logo trans.png" alt="miClub" className="club-logo" /><div><h1>miClub Gestión</h1><p>App operativa y de Gestión para tu club</p></div><div className="app-header__actions"><button className="ghost-btn theme-toggle" type="button" onClick={toggleTheme} aria-pressed={theme === 'light'}>{theme === 'dark' ? '☀️ Modo claro' : '🌙 Modo oscuro'}</button><button className="ghost-btn logout-btn" type="button" onClick={() => void handleLogout()} disabled={isLoggingOut}>{isLoggingOut ? 'Cerrando sesión…' : `Cerrar sesión${username ? ` · ${username}` : ''}`}</button></div></header>{logoutError && <p className="login-error" role="alert">{logoutError}</p>}<ModuleNav modules={modules} currentModule={currentModule} onSelect={selectModule} /><div key={tenantModuleKey(clubId, currentModule)}>{renderModule()}</div></div></OnboardingGate>;
}

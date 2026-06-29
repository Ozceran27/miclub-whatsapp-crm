import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import CrmModule from './modules/CrmModule';
import DataMigrationModule from './modules/DataMigrationModule';
import HomeModule from './modules/HomeModule';
import ModuleNav from './modules/ModuleNav';
import PlaceholderModule from './modules/PlaceholderModule';
import LoginScreen from './LoginScreen';
import { apiUrl } from './api';
const MODULES = [
    { id: 'home', label: 'INICIO' },
    { id: 'economy', label: 'ECONOMÍA CLUB' },
    { id: 'fitness', label: 'ESPACIO FITNESS' },
    { id: 'salon', label: 'SALÓN' },
    { id: 'aula', label: 'AULA' },
    { id: 'local1', label: 'LOCAL 1' },
    { id: 'cantina', label: 'CANTINA' },
    { id: 'crm', label: 'CRM' },
    { id: 'dataMigration', label: 'MIGRACIÓN' }
];
const PLACEHOLDERS = {
    economy: {
        title: 'Economía Club',
        description: 'Tablero financiero general para consolidar la salud económica y los movimientos por sector del club.',
        futureItems: ['Ingresos totales.', 'Egresos totales.', 'Utilidad.', 'Movimientos por sector.', 'Evolución mensual.', 'Estado general del club.']
    },
    fitness: {
        title: 'Espacio Fitness',
        description: 'Gestión operativa del espacio de entrenamiento, cuotas, pagos y actividades vinculadas a Fitness.',
        futureItems: ['Inscriptos.', 'Deudores.', 'Ingresos por cuotas.', 'Últimos pagos.', 'Actividades.', 'Instructores.']
    },
    salon: {
        title: 'Salón',
        description: 'Seguimiento de actividades, cuotas y posibles eventos o alquileres del salón.',
        futureItems: ['Actividades.', 'Inscriptos.', 'Cuotas.', 'Eventos o alquileres futuros.']
    },
    aula: {
        title: 'Aula',
        description: 'Base para administrar talleres, cursos, inscriptos e ingresos asociados al aula.',
        futureItems: ['Talleres.', 'Cursos.', 'Inscriptos.', 'Ingresos.']
    },
    local1: {
        title: 'Local 1',
        description: 'Control de movimientos, ingresos, comisiones y saldos a liquidar del Local 1.',
        futureItems: ['Movimientos.', 'Ingresos.', 'Saldo a liquidar.', 'Comisiones.']
    },
    cantina: {
        title: 'Cantina',
        description: 'Espacio preparado para ventas, liquidaciones, saldos y movimientos de Cantina.',
        futureItems: ['Ventas.', 'Liquidación.', 'Saldos.', 'Movimientos.']
    }
};
export default function App() {
    const [currentModule, setCurrentModule] = useState('home');
    const [isAuthChecking, setIsAuthChecking] = useState(true);
    const [authEnabled, setAuthEnabled] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState(null);
    useEffect(() => {
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (input, init = {}) => {
            const response = await originalFetch(input, { credentials: 'include', ...init });
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            if (response.status === 401 && !url.includes('/auth/')) {
                setIsAuthenticated(false);
                setAuthEnabled(true);
            }
            return response;
        };
        return () => {
            window.fetch = originalFetch;
        };
    }, []);
    useEffect(() => {
        const checkSession = async () => {
            try {
                const response = await fetch(apiUrl('/auth/me'), { credentials: 'include' });
                const payload = await response.json();
                setAuthEnabled(Boolean(payload.authEnabled));
                setIsAuthenticated(payload.authenticated);
                setUsername(payload.username ?? null);
            }
            catch {
                setAuthEnabled(false);
                setIsAuthenticated(true);
            }
            finally {
                setIsAuthChecking(false);
            }
        };
        void checkSession();
    }, []);
    const handleLogout = async () => {
        await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
        setIsAuthenticated(false);
        setUsername(null);
        setCurrentModule('home');
    };
    const handleAuthenticated = (loggedUsername) => {
        setIsAuthenticated(true);
        setUsername(loggedUsername);
    };
    const renderModule = () => {
        if (currentModule === 'home')
            return _jsx(HomeModule, { onOpenModule: setCurrentModule });
        if (currentModule === 'crm')
            return _jsx(CrmModule, {});
        if (currentModule === 'dataMigration')
            return _jsx(DataMigrationModule, {});
        const placeholder = PLACEHOLDERS[currentModule];
        return _jsx(PlaceholderModule, { ...placeholder });
    };
    if (isAuthChecking) {
        return _jsx("div", { className: "auth-loading", children: "Cargando acceso seguro\u2026" });
    }
    if (authEnabled && !isAuthenticated) {
        return _jsx(LoginScreen, { onAuthenticated: handleAuthenticated });
    }
    return (_jsxs("div", { className: "container app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsx("img", { src: "/logo/miClub - Logo trans.png", alt: "miClub", className: "club-logo" }), _jsxs("div", { children: [_jsx("h1", { children: "miClub Gesti\u00F3n" }), _jsx("p", { children: "Panel operativo y CRM del club" })] }), authEnabled && (_jsxs("button", { className: "ghost-btn logout-btn", type: "button", onClick: handleLogout, children: ["Cerrar sesi\u00F3n", username ? ` · ${username}` : ''] }))] }), _jsx(ModuleNav, { modules: MODULES, currentModule: currentModule, onSelect: setCurrentModule }), renderModule()] }));
}

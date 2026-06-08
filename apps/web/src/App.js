import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import CrmModule from './modules/CrmModule';
import HomeModule from './modules/HomeModule';
import ModuleNav from './modules/ModuleNav';
import PlaceholderModule from './modules/PlaceholderModule';
const MODULES = [
    { id: 'home', label: 'INICIO' },
    { id: 'economy', label: 'ECONOMÍA CLUB' },
    { id: 'fitness', label: 'ESPACIO FITNESS' },
    { id: 'salon', label: 'SALÓN' },
    { id: 'aula', label: 'AULA' },
    { id: 'local1', label: 'LOCAL 1' },
    { id: 'cantina', label: 'CANTINA' },
    { id: 'crm', label: 'CRM' }
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
    const renderModule = () => {
        if (currentModule === 'home')
            return _jsx(HomeModule, { onOpenModule: setCurrentModule });
        if (currentModule === 'crm')
            return _jsx(CrmModule, {});
        const placeholder = PLACEHOLDERS[currentModule];
        return _jsx(PlaceholderModule, { ...placeholder });
    };
    return (_jsxs("div", { className: "container app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsx("img", { src: "/logo/miClub - Logo trans.png", alt: "miClub", className: "club-logo" }), _jsxs("div", { children: [_jsx("h1", { children: "miClub Gesti\u00F3n" }), _jsx("p", { children: "Panel operativo y CRM del club" })] })] }), _jsx(ModuleNav, { modules: MODULES, currentModule: currentModule, onSelect: setCurrentModule }), renderModule()] }));
}

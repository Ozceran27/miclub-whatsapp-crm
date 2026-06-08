import { jsx as _jsx } from "react/jsx-runtime";
export default function ModuleNav({ modules, currentModule, onSelect }) {
    return (_jsx("nav", { className: "module-nav", "aria-label": "Navegaci\u00F3n principal por m\u00F3dulos", children: modules.map((module) => {
            const isActive = module.id === currentModule;
            return (_jsx("button", { type: "button", className: `module-nav__item${isActive ? ' module-nav__item--active' : ''}`, "aria-current": isActive ? 'page' : undefined, onClick: () => onSelect(module.id), children: module.label }, module.id));
        }) }));
}

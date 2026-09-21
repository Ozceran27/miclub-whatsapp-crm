export type CoreModuleId = 'home' | 'economy' | 'crm' | 'administration' | 'dataMigration';
export type ModuleId = CoreModuleId | `sector:${string}`;

import { useEffect, useRef, useState } from 'react';

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
};

type ModuleNavProps = {
  modules: ModuleDefinition[];
  sectors: ModuleDefinition[];
  currentModule: ModuleId;
  onSelect: (moduleId: ModuleId) => void;
};

export default function ModuleNav({ modules, sectors, currentModule, onSelect }: ModuleNavProps) {
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const sectorsRef = useRef<HTMLDivElement>(null);
  const sectorActive = currentModule.startsWith('sector:');

  useEffect(() => {
    if (!sectorsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!sectorsRef.current?.contains(event.target as Node)) setSectorsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSectorsOpen(false); sectorsRef.current?.querySelector<HTMLButtonElement>('.module-nav__sectors-trigger')?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [sectorsOpen]);

  const item = (module: ModuleDefinition) => {
    const isActive = module.id === currentModule;
    return <button key={module.id} type="button" role={module.id.startsWith('sector:') ? 'menuitem' : undefined}
      className={`module-nav__item${isActive ? ' module-nav__item--active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      onClick={() => { onSelect(module.id); setSectorsOpen(false); }}>
      {module.label}
    </button>;
  };

  return (
    <nav className="module-nav" aria-label="Navegación principal por módulos">
      {modules.map((module) => <span className="module-nav__slot" key={module.id}>{item(module)}{module.id === 'economy' && sectors.length > 0 && <div className="module-nav__sectors" ref={sectorsRef}>
        <button type="button" className={`module-nav__item module-nav__sectors-trigger${sectorActive ? ' module-nav__item--active' : ''}`}
          aria-expanded={sectorsOpen} aria-haspopup="menu" onClick={() => setSectorsOpen(value => !value)}>
          SECTORES <span aria-hidden="true">{sectorsOpen ? '▴' : '▾'}</span>
        </button>
        {sectorsOpen && <div className="module-nav__sector-menu" role="menu" aria-label="Sectores del club">{sectors.map(item)}</div>}
      </div>}</span>)}
    </nav>
  );
}

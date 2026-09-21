export type CoreModuleId = 'home' | 'economy' | 'crm' | 'administration' | 'dataMigration';
export type ModuleId = CoreModuleId | `sector:${string}`;

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

export const calculateSectorMenuPosition = (rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width'>, viewport: { width: number; height: number }) => {
  const viewportPadding = 12;
  const width = Math.min(Math.max(220, rect.width), viewport.width - viewportPadding * 2);
  const left = Math.min(Math.max(viewportPadding, rect.left), viewport.width - width - viewportPadding);
  const spaceBelow = viewport.height - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.min(420, openAbove ? spaceAbove - 9 : spaceBelow - 9));
  const top = openAbove ? Math.max(viewportPadding, rect.top - maxHeight - 9) : rect.bottom + 9;
  return { left, top, width, maxHeight };
};

export default function ModuleNav({ modules, sectors, currentModule, onSelect }: ModuleNavProps) {
  const [sectorsOpen, setSectorsOpen] = useState(false);
  const sectorsRef = useRef<HTMLDivElement>(null);
  const sectorsMenuRef = useRef<HTMLDivElement>(null);
  const sectorsTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, width: 220, maxHeight: 420 });
  const sectorActive = currentModule.startsWith('sector:');

  const positionMenu = () => {
    const trigger = sectorsTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition(calculateSectorMenuPosition(rect, { width: window.innerWidth, height: window.innerHeight }));
  };

  useLayoutEffect(() => { if (sectorsOpen) positionMenu(); }, [sectorsOpen, sectors.length]);

  useEffect(() => {
    if (!sectorsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sectorsRef.current?.contains(target) && !sectorsMenuRef.current?.contains(target)) setSectorsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSectorsOpen(false); sectorsRef.current?.querySelector<HTMLButtonElement>('.module-nav__sectors-trigger')?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); window.removeEventListener('resize', positionMenu); window.removeEventListener('scroll', positionMenu, true); };
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
        <button ref={sectorsTriggerRef} type="button" className={`module-nav__item module-nav__sectors-trigger${sectorActive ? ' module-nav__item--active' : ''}`}
          aria-expanded={sectorsOpen} aria-haspopup="menu" onClick={() => setSectorsOpen(value => !value)}>
          SECTORES <span aria-hidden="true">{sectorsOpen ? '▴' : '▾'}</span>
        </button>
        {sectorsOpen && createPortal(<div ref={sectorsMenuRef} className="module-nav__sector-menu" role="menu" aria-label="Sectores del club"
          style={{ left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, maxHeight: menuPosition.maxHeight }}>{sectors.map(item)}</div>, document.body)}
      </div>}</span>)}
    </nav>
  );
}

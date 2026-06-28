export type ModuleId = 'home' | 'economy' | 'fitness' | 'salon' | 'aula' | 'local1' | 'cantina' | 'crm' | 'dataMigration';

export type ModuleDefinition = {
  id: ModuleId;
  label: string;
};

type ModuleNavProps = {
  modules: ModuleDefinition[];
  currentModule: ModuleId;
  onSelect: (moduleId: ModuleId) => void;
};

export default function ModuleNav({ modules, currentModule, onSelect }: ModuleNavProps) {
  return (
    <nav className="module-nav" aria-label="Navegación principal por módulos">
      {modules.map((module) => {
        const isActive = module.id === currentModule;

        return (
          <button
            key={module.id}
            type="button"
            className={`module-nav__item${isActive ? ' module-nav__item--active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(module.id)}
          >
            {module.label}
          </button>
        );
      })}
    </nav>
  );
}

import type { CoreModuleId, ModuleDefinition } from '../modules/ModuleNav';
import type { BackendNavigation } from '../services/api/navigationApi';

export const CORE_ORDER: readonly CoreModuleId[] = ['home', 'administration', 'economy', 'crm', 'dataMigration'];

const SYSTEM_SECTOR_CODES = new Set(['administracion', 'tesoreria']);

export const buildSectorModules = (sectors: BackendNavigation['sectors']): ModuleDefinition[] => sectors
  .filter(({ code }) => !code || !SYSTEM_SECTOR_CODES.has(code.trim().toLocaleLowerCase('es-AR')))
  .map((sector) => ({ id: `sector:${sector.id}` as const, label: sector.name.toLocaleUpperCase('es-AR') }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es-AR'));

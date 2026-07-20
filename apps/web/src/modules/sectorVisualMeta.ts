export type SectorVisualMeta = {
  icon: string;
  accent: 'fitness' | 'salon' | 'aula' | 'local1' | 'cantina' | 'crm' | 'default';
};

const normalizeSectorName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');

export const SECTOR_VISUAL_META: Record<string, SectorVisualMeta> = {
  'espacio fitness': { icon: '🏋️', accent: 'fitness' },
  fitness: { icon: '🏋️', accent: 'fitness' },
  'local 1': { icon: '🏪', accent: 'local1' },
  local1: { icon: '🏪', accent: 'local1' },
  salon: { icon: '🎭', accent: 'salon' },
  aula: { icon: '🎓', accent: 'aula' },
  cantina: { icon: '☕', accent: 'cantina' },
  'local 2': { icon: '🏬', accent: 'default' },
  local2: { icon: '🏬', accent: 'default' },
  crm: { icon: '💬', accent: 'crm' },
  otros: { icon: '📁', accent: 'default' },
  otro: { icon: '📁', accent: 'default' },
  'sin sector': { icon: '⚪', accent: 'default' },
  sinsector: { icon: '⚪', accent: 'default' },
  sin_sector: { icon: '⚪', accent: 'default' }
};

export const DEFAULT_SECTOR_VISUAL_META: SectorVisualMeta = { icon: '📁', accent: 'default' };

export const getSectorVisualMeta = (sectorName: string): SectorVisualMeta => SECTOR_VISUAL_META[normalizeSectorName(sectorName)] ?? DEFAULT_SECTOR_VISUAL_META;

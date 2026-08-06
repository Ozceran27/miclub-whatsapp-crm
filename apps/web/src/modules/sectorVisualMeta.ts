export type SectorVisualMeta = {
  icon: string;
  accent: 'default';
  color?: string;
};

export const DEFAULT_SECTOR_VISUAL_META: SectorVisualMeta = { icon: '📁', accent: 'default' };

/** Presentation is driven only by persisted attributes; names are never interpreted. */
export const getSectorVisualMeta = (sector?: { icon?: string | null; color?: string | null }): SectorVisualMeta => ({
  icon: sector?.icon?.trim() || DEFAULT_SECTOR_VISUAL_META.icon,
  accent: 'default',
  ...(sector?.color ? { color: sector.color } : {}),
});

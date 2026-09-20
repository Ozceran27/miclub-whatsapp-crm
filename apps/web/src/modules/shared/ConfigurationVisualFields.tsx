import {
  ACTIVITY_VISUAL_CATALOG,
  SECTOR_COLOR_PALETTE,
  SECTOR_ICON_CATALOG,
} from '@miclub/shared';

export function ConfigurationColorPicker({ value, onChange, label = 'Color' }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <fieldset className="draft-color-control"><legend>{label}</legend><div className="draft-palette" role="group" aria-label="Colores predefinidos">
    {SECTOR_COLOR_PALETTE.map(color => <label key={color.hex} style={{ backgroundColor: color.hex }} title={`${color.name} (${color.hex})`}>
      <input type="radio" name={`${label}-palette`} value={color.hex} checked={value.toUpperCase() === color.hex} onChange={() => onChange(color.hex)} />
      <span className="sr-only">{color.name}, {color.hex}</span>
    </label>)}
  </div><label className="draft-color-control__button">Elegir color personalizado<input aria-label="Abrir selector de color personalizado" type="color" value={value} onChange={event => onChange(event.target.value.toUpperCase())} /></label></fieldset>;
}

export function SectorIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset><legend>Icono del sector</legend><div className="draft-icon-grid draft-icon-grid--catalog" aria-label="Catálogo de iconos">
    {SECTOR_ICON_CATALOG.map(icon => <label key={icon.key} title={icon.name} aria-label={icon.name}>
      <input type="radio" name="sectorIconKey" value={icon.key} checked={value === icon.key} onChange={() => onChange(icon.key)} />
      <span aria-hidden="true">{icon.glyph}</span><span className="sr-only">{icon.name}</span>
    </label>)}
  </div></fieldset>;
}

export function ActivityIconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset><legend>Icono de la actividad</legend><div className="draft-icon-grid draft-icon-grid--catalog" aria-label="Catálogo de iconos">
    {ACTIVITY_VISUAL_CATALOG.map(item => <label key={item.key} title={`${item.name} · ${item.category}`} aria-label={`${item.name} · ${item.category}`}>
      <input type="radio" name="activityIconKey" value={item.key} checked={value === item.key} onChange={() => onChange(item.key)} />
      <span aria-hidden="true">{item.glyph}</span><span className="sr-only">{item.name} · {item.category}</span>
    </label>)}
  </div></fieldset>;
}

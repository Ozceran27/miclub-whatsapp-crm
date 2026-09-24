import { type AdministrationSectorDto } from '@miclub/shared';
import { useState } from 'react';
import type { SectorManagerCandidate } from '../../services/api/administrationApi';
import { ConfigurationColorPicker, SectorIconPicker } from '../shared/ConfigurationVisualFields';
import { SectorCapacityFields } from '../shared/SectorCapacityFields';
import { getSectorVisualMeta } from '../sectorVisualMeta';

type Props = {
  sector?: AdministrationSectorDto;
  managers?: SectorManagerCandidate[];
  managersLoading?: boolean;
  managersError?: string | null;
  iconKey: string;
  color: string;
  capacityMode: 'ENROLLMENTS' | 'INCOME';
  configuredCapacity: number | null;
  onIconChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onCapacityModeChange: (value: 'ENROLLMENTS' | 'INCOME') => void;
  onCapacityChange: (value: number | null) => void;
};

export function SectorConfigurationFields({ sector, managers = [], managersLoading = false, managersError = null, iconKey, color, capacityMode, configuredCapacity, onIconChange, onColorChange, onCapacityModeChange, onCapacityChange }: Props) {
  const [managerPersonId, setManagerPersonId] = useState(sector?.managerPersonId ?? '');
  const currentManagerMissing = sector?.managerPersonId && !managers.some(worker => worker.personId === sector.managerPersonId);
  return <>
    <fieldset><legend>Identidad del sector</legend><div className="draft-form__grid">
      <label>Nombre<input name="name" defaultValue={sector?.name ?? ''} disabled={sector?.isSystem} required /></label>
      <label>Responsable<select name="managerPersonId" value={managerPersonId} onChange={event => setManagerPersonId(event.target.value)} disabled={managersLoading || Boolean(managersError)}><option value="">Sin asignar</option>{currentManagerMissing && <option value={sector?.managerPersonId ?? ''}>{sector?.managerName || 'Responsable actual'} (actual)</option>}{managers.map(manager => <option key={manager.personId} value={manager.personId}>{manager.displayName}</option>)}</select>{managersLoading && <small role="status">Cargando responsables…</small>}{managersError && <small role="alert">{managersError}</small>}</label>
    </div><label>Descripción<textarea name="description" rows={3} defaultValue={sector?.description ?? ''} /></label></fieldset>
    <fieldset><legend>Apariencia</legend>{sector?.isSystem ? <div className="sector-editor__locked-icon"><span aria-hidden="true">{getSectorVisualMeta(sector).icon}</span><div><strong>Ícono del sistema</strong><small>Este ícono identifica una función estructural del club.</small></div></div> : <SectorIconPicker value={iconKey} onChange={onIconChange} />}<ConfigurationColorPicker value={color} onChange={onColorChange} label="Color del sector" /></fieldset>
    <SectorCapacityFields mode={capacityMode} capacity={configuredCapacity} onModeChange={onCapacityModeChange} onCapacityChange={onCapacityChange} />
    {!sector && <label>Estado<select name="status" defaultValue="active"><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="under_repair">En reparación</option></select></label>}
  </>;
}

type Props={mode:'INCOME'|'ENROLLMENTS';capacity:number|null;onModeChange:(mode:'INCOME'|'ENROLLMENTS')=>void;onCapacityChange:(capacity:number|null)=>void};
export function SectorCapacityFields({mode,capacity,onModeChange,onCapacityChange}:Props){
  return <fieldset className="sector-capacity-fields"><legend>Modo de capacidad</legend>
    <div className="sector-capacity-fields__choices" role="radiogroup" aria-label="Modo de capacidad">
      <label className="sector-capacity-fields__choice" data-selected={mode==='INCOME'}><input type="radio" name="capacityMode" checked={mode==='INCOME'} onChange={()=>onModeChange('INCOME')}/><span><strong>Ingresos</strong><small>Se mide contra el récord mensual de ingresos del sector.</small></span></label>
      <label className="sector-capacity-fields__choice" data-selected={mode==='ENROLLMENTS'}><input type="radio" name="capacityMode" checked={mode==='ENROLLMENTS'} onChange={()=>onModeChange('ENROLLMENTS')}/><span><strong>Espacio disponible</strong><small>Se mide por inscriptos frente a una capacidad máxima.</small></span></label>
    </div>
    {mode==='ENROLLMENTS'&&<label className="sector-capacity-fields__limit">Capacidad máxima<input type="number" min="1" step="1" required value={capacity??''} onChange={event=>onCapacityChange(event.currentTarget.value===''?null:Number(event.currentTarget.value))}/><small>Ingresá la cantidad de personas que admite el sector.</small></label>}
  </fieldset>;
}

import type { CrmCatalogItem, DebtFilters } from '../../services/api/crmApi';

type Props={filter:DebtFilters;change:(patch:Partial<DebtFilters>)=>void;catalog:CrmCatalogItem[]};
export const CrmFilters=({filter,change,catalog}:Props)=>{
  const sectors=Array.from(new Map(catalog.map(row=>[row.sectorId,{id:row.sectorId,name:row.sectorName}])).values());
  const activities=catalog.filter(row=>!filter.sectorId||row.sectorId===filter.sectorId);
  return <section className="filters" aria-label="Filtros CRM">
    <select aria-label="Vista de deuda" value={filter.kind} onChange={event=>change({kind:event.target.value as DebtFilters['kind']})}>
      <option value="overdue">Cuotas vencidas</option><option value="review">Revisar sin cuota</option><option value="all">Todas las situaciones</option>
    </select>
    <input aria-label="Buscar inscripto" placeholder="Buscar por nombre o apellido" value={filter.query} onChange={event=>change({query:event.target.value})}/>
    <select aria-label="Sector" value={filter.sectorId} onChange={event=>change({sectorId:event.target.value,activityId:''})}>
      <option value="">Todos los sectores</option>{sectors.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
    <select aria-label="Actividad" value={filter.activityId} onChange={event=>change({activityId:event.target.value})}>
      <option value="">Todas las actividades</option>{activities.map(a=><option key={a.activityId} value={a.activityId}>{a.activityName}</option>)}
    </select>
  </section>;
};

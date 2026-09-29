import type { ReactNode } from 'react';

export type CrmSort = { by: string; direction: 'asc'|'desc' } | null;
export const nextCrmSort=(current:CrmSort,by:string):CrmSort=>({by,direction:current?.by===by&&current.direction==='asc'?'desc':'asc'});

export function SortableHeader({label,field,sort,onSort}:{label:ReactNode;field:string;sort:CrmSort;onSort:(field:string)=>void}){
  const active=sort?.by===field;
  return <th scope="col" aria-sort={active?(sort.direction==='asc'?'ascending':'descending'):'none'}>
    <button type="button" className="crm-sort-button" onClick={()=>onSort(field)}>
      {label}<span aria-hidden="true">{active?(sort.direction==='asc'?'↑':'↓'):'↕'}</span>
    </button>
  </th>;
}

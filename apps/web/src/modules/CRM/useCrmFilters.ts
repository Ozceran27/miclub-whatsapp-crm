import { useState } from 'react';
import type { DebtFilters } from '../../services/api/crmApi';

export const useCrmFilters=()=>{
  const [filter,setFilter]=useState<DebtFilters>({kind:'overdue',page:1,query:'',sectorId:'',activityId:''});
  const [selected,setSelected]=useState<string[]>([]);
  const change=(patch:Partial<DebtFilters>)=>{setFilter(current=>({...current,...patch,page:patch.page ?? 1}));setSelected([]);};
  return {filter,change,selected,setSelected,clearSelection:()=>setSelected([])};
};

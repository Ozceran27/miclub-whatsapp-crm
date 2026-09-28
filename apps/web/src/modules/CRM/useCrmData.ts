import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrmDebtPage, CrmDebtSummary, MessageTemplate, PreparedMessage } from '@miclub/shared';
import { crmApi, type CrmCatalogItem, type DebtFilters } from '../../services/api/crmApi';

const emptyPage:CrmDebtPage={items:[],page:1,pageSize:20,total:0};
export const useCrmData=(filter:DebtFilters)=>{
  const [debts,setDebts]=useState<CrmDebtPage>(emptyPage);
  const [summary,setSummary]=useState<CrmDebtSummary|null>(null);
  const [catalog,setCatalog]=useState<CrmCatalogItem[]>([]);
  const [templates,setTemplates]=useState<MessageTemplate[]>([]);
  const [prepared,setPrepared]=useState<PreparedMessage[]>([]);
  const [preparedPage,setPreparedPage]=useState(1);
  const [preparedTotal,setPreparedTotal]=useState(0);
  const [history,setHistory]=useState<PreparedMessage[]>([]);
  const [historyPage,setHistoryPage]=useState(1);
  const [historyMeta,setHistoryMeta]=useState({pageSize:20,total:0,totalPages:0});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const generation=useRef(0);
  const loadDebts=useCallback(async()=>{
    const current=++generation.current;
    setLoading(true);
    try {const result=await crmApi.debts(filter);if(current===generation.current){setDebts(result);setError(null);}}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'No se pudo leer la deuda.');}
    finally{if(current===generation.current)setLoading(false);}
  },[filter]);
  const loadHistory=useCallback(async(page=1)=>{
    const result=await crmApi.history(page);
    setHistory(result.items);setHistoryPage(result.page);
    setHistoryMeta({pageSize:result.pageSize,total:result.total,totalPages:result.totalPages});
  },[]);
  const loadPrepared=useCallback(async(page=1)=>{
    const result=await crmApi.prepared(page);
    setPrepared(result.items);setPreparedPage(result.page);setPreparedTotal(result.total);
  },[]);
  const refresh=useCallback(async()=>{
    try {const [sum,cat,t]=await Promise.all([crmApi.debtSummary(),crmApi.catalog(),crmApi.templates()]);
      setSummary(sum);setCatalog(cat);setTemplates(t);
      await Promise.all([loadDebts(),loadPrepared(preparedPage),loadHistory(historyPage)]);
    }catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar el CRM.');}
  },[loadDebts,loadPrepared,loadHistory,preparedPage,historyPage]);
  useEffect(()=>{void Promise.resolve().then(loadDebts);return()=>{generation.current+=1;};},[loadDebts]);
  useEffect(()=>{void Promise.all([crmApi.debtSummary(),crmApi.catalog(),crmApi.templates(),crmApi.prepared(),crmApi.history()])
    .then(([sum,cat,t,p,h])=>{setSummary(sum);setCatalog(cat);setTemplates(t);setPrepared(p.items);setPreparedTotal(p.total);setHistory(h.items);setHistoryMeta({pageSize:h.pageSize,total:h.total,totalPages:h.totalPages});})
    .catch(e=>setError(e instanceof Error?e.message:'No se pudo cargar el CRM.'));},[]);
  return {debts,summary,catalog,templates,setTemplates,prepared,preparedPage,preparedTotal,history,historyPage,historyMeta,
    loading,error,setError,loadDebts,loadHistory,loadPrepared,refresh};
};

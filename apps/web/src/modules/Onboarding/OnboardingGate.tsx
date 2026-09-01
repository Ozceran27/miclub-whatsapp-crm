import { CLUB_CAPABILITIES, ONBOARDING_DRAFT_CONTRACT_VERSION, PROVISIONED_ONBOARDING_SECTORS, hasClubCapability, type OnboardingDestination, type OnboardingDraft, type OnboardingState, type OnboardingStep, type OnboardingStepOutcome } from '@miclub/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '../../router';
import { invalidateTenantQueries } from '../../serverState/invalidation';
import { useSession } from '../../session';
import { completeOnboarding, getOnboarding } from '../../services/api/onboardingApi';
import { getPreviousStep, OnboardingDialog } from './OnboardingDialog';
import { loadHomeDashboardResources } from '../Home/homeDashboardApi';
import { getNavigation } from '../../services/api/navigationApi';

const completionStorageKey=(clubId:string)=>`miclub:onboarding-completed:${clubId}`;

export const createInitialOnboardingDraft = (): OnboardingDraft => ({
  contractVersion: ONBOARDING_DRAFT_CONTRACT_VERSION,
  idempotencyKey: crypto.randomUUID(), openingBalances: { currency: 'ARS', cash: 0, bank: 0, usdCash: 0 },
  selectedPlanCode: 'FREE',
  sectors: PROVISIONED_ONBOARDING_SECTORS.map(sector=>({...sector,color:'#2563EB',status:'active',capacityMode:'INCOME' as const,configuredCapacity:null})), workers: [], activities: [],
});

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { status, clubId, permissions } = useSession(); const { navigate } = useRouter();
  const [state, setState] = useState<OnboardingState>(); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [completionConfirmed,setCompletionConfirmed]=useState(false);
  const [destination,setDestination]=useState<OnboardingDestination>('DASHBOARD');
  // Each mount creates a fresh visual session. `state.currentStep` and the
  // milestone arrays are legacy API fields, never restoration inputs.
  const [visibleStep,setVisibleStep]=useState<OnboardingStep>(1); const [direction,setDirection]=useState<'forward'|'backward'>('forward');
  const [draft,setDraft]=useState<OnboardingDraft>(createInitialOnboardingDraft);
  const canRead = permissions.includes('onboarding.read');
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(''); try { const loaded=await getOnboarding(signal);const saved=clubId?sessionStorage.getItem(completionStorageKey(clubId)):null;if(loaded.status==='COMPLETED'&&saved){setDestination(saved==='MIGRATION'?'MIGRATION':'DASHBOARD');setCompletionConfirmed(true);setState({...loaded,shouldShow:true});}else setState(loaded); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado.'); } finally { if (!signal?.aborted) setLoading(false); } }, [clubId]);
  useEffect(() => { if (status !== 'authenticated' || !clubId || !canRead) return; const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [canRead, clubId, load, status]);
  useEffect(() => { if (!state?.shouldShow) return; setVisibleStep(1); setDirection('forward'); }, [clubId,state?.shouldShow]);
  const updateDraft=<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>setDraft(current=>({...current,[key]:value}));
  const complete = async () => { if(loading)return; setLoading(true); setError(''); try { const result = await completeOnboarding(draft);const navigation=await getNavigation();const effectiveDestination:OnboardingDestination=permissions.includes('imports.run')&&hasClubCapability(navigation.capabilities,CLUB_CAPABILITIES.DATA_MIGRATION)?'MIGRATION':'DASHBOARD';setDestination(effectiveDestination);if(clubId)sessionStorage.setItem(completionStorageKey(clubId),effectiveDestination);setState({...result.state,status:'COMPLETED',shouldShow:true,migrationAvailable:effectiveDestination==='MIGRATION'});setCompletionConfirmed(true);invalidateTenantQueries(clubId);await loadHomeDashboardResources(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar el onboarding o verificar sus capacidades. Reintentá para recuperar el resultado.'); } finally { setLoading(false); } };
  const continueToDestination=()=>{if(clubId)sessionStorage.removeItem(completionStorageKey(clubId));setState(current=>current?{...current,shouldShow:false}:current);navigate(destination==='MIGRATION'?'/app/migration':'/app',{replace:true});};
  if (canRead && !state && loading) return <div className="onboarding-gate-status" role="status">Preparando la configuración de tu club…</div>;
  if (canRead && !state && error) return <div className="onboarding-gate-status" role="alert"><p>{error}</p><button className="primary-btn" onClick={() => void load()}>Reintentar</button></div>;
  const onNext=(outcome:OnboardingStepOutcome='COMPLETED')=>{if(outcome==='SKIPPED')setDraft(current=>{
    if(visibleStep===3)return {...current,sectors:current.sectors.filter(sector=>sector.isSystem)};
    if(visibleStep===4)return {...current,workers:[]};
    if(visibleStep===5)return {...current,activities:[]};
    return current;
  });setDirection('forward');setVisibleStep(current=>Math.min(7,current+1) as OnboardingStep);};
  const onBack=()=>{setDirection('backward');setVisibleStep(getPreviousStep);};
  return <>{children}{state?.shouldShow && <OnboardingDialog step={visibleStep} direction={direction} draft={draft} updateDraft={updateDraft} migrationAvailable={state.migrationAvailable&&permissions.includes('imports.run')} pending={loading} success={completionConfirmed} destination={destination} error={error} onNext={onNext} onBack={onBack} onComplete={() => void complete()} onContinue={continueToDestination} />}</>;
}

import { PROVISIONED_ONBOARDING_SECTORS, type OnboardingDraft, type OnboardingState, type OnboardingStep, type OnboardingStepOutcome } from '@miclub/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '../../router';
import { invalidateTenantQueries } from '../../serverState/invalidation';
import { useSession } from '../../session';
import { completeOnboarding, getOnboarding } from '../../services/api/onboardingApi';
import { getPreviousStep, OnboardingDialog } from './OnboardingDialog';
import { loadHomeDashboardResources } from '../Home/homeDashboardApi';

export const createInitialOnboardingDraft = (): OnboardingDraft => ({
  idempotencyKey: crypto.randomUUID(), openingBalances: { currency: 'ARS', cash: 0, bank: 0, usdCash: 0 },
  sectors: PROVISIONED_ONBOARDING_SECTORS.map(sector=>({...sector,color:'#2563EB',status:'active'})), workers: [], activities: [], pendingImport: null,
});

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { status, clubId, permissions } = useSession(); const { navigate } = useRouter();
  const [state, setState] = useState<OnboardingState>(); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  // Each mount creates a fresh visual session. `state.currentStep` and the
  // milestone arrays are legacy API fields, never restoration inputs.
  const [visibleStep,setVisibleStep]=useState<OnboardingStep>(1); const [direction,setDirection]=useState<'forward'|'backward'>('forward');
  const [draft,setDraft]=useState<OnboardingDraft>(createInitialOnboardingDraft);
  const canRead = permissions.includes('onboarding.read');
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(''); try { setState(await getOnboarding(signal)); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado.'); } finally { if (!signal?.aborted) setLoading(false); } }, []);
  useEffect(() => { if (status !== 'authenticated' || !clubId || !canRead) return; const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [canRead, clubId, load, status]);
  useEffect(() => { if (!state?.shouldShow) return; setVisibleStep(1); setDirection('forward'); }, [clubId,state?.shouldShow]);
  const updateDraft=<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>setDraft(current=>({...current,[key]:value}));
  const complete = async () => { setLoading(true); setError(''); try { const result = await completeOnboarding(draft); setState({...result.state,status:'COMPLETED',shouldShow:false}); invalidateTenantQueries(clubId); await loadHomeDashboardResources(); navigate('/app', { replace: true }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar el onboarding.'); } finally { setLoading(false); } };
  if (canRead && !state && loading) return <div className="onboarding-gate-status" role="status">Preparando la configuración de tu club…</div>;
  if (canRead && !state && error) return <div className="onboarding-gate-status" role="alert"><p>{error}</p><button className="primary-btn" onClick={() => void load()}>Reintentar</button></div>;
  const onNext=(outcome:OnboardingStepOutcome='COMPLETED')=>{if(outcome==='SKIPPED')setDraft(current=>{
    if(visibleStep===3)return {...current,sectors:current.sectors.filter(sector=>sector.isSystem)};
    if(visibleStep===4)return {...current,workers:[]};
    if(visibleStep===5)return {...current,activities:[]};
    if(visibleStep===6)return {...current,pendingImport:null};
    return current;
  });setDirection('forward');setVisibleStep(current=>Math.min(7,current+1) as OnboardingStep);};
  const onBack=()=>{setDirection('backward');setVisibleStep(getPreviousStep);};
  return <>{children}{state?.shouldShow && <OnboardingDialog step={visibleStep} direction={direction} draft={draft} updateDraft={updateDraft} migrationAvailable={state.migrationAvailable&&permissions.includes('imports.run')} pending={loading} error={error} onNext={onNext} onBack={onBack} onComplete={() => void complete()} />}</>;
}

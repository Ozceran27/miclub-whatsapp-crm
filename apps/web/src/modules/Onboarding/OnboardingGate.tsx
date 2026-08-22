import type { OnboardingDraft, OnboardingState } from '@miclub/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '../../router';
import { invalidateTenantQueries } from '../../serverState/invalidation';
import { useSession } from '../../session';
import { completeOnboarding, getOnboarding } from '../../services/api/onboardingApi';
import { OnboardingDialog } from './OnboardingDialog';

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { status, clubId, permissions } = useSession(); const { navigate } = useRouter();
  const [state, setState] = useState<OnboardingState>(); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [draft,setDraft]=useState<OnboardingDraft>(()=>({idempotencyKey:crypto.randomUUID(),openingBalances:{currency:'ARS',cash:0,bank:0,usdCash:0},sectors:[],workers:[],activities:[],pendingImport:null}));
  const canRead = permissions.includes('onboarding.read');
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(''); try { setState(await getOnboarding(signal)); } catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado.'); } finally { if (!signal?.aborted) setLoading(false); } }, []);
  useEffect(() => { if (status !== 'authenticated' || !clubId || !canRead) return; const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [canRead, clubId, load, status]);
  const updateDraft=<K extends keyof OnboardingDraft>(key:K,value:OnboardingDraft[K])=>setDraft(current=>({...current,[key]:value}));
  const complete = async () => { setLoading(true); setError(''); try { const result = await completeOnboarding(draft); setState(result.state); invalidateTenantQueries(clubId); navigate('/app', { replace: true }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar el onboarding.'); } finally { setLoading(false); } };
  if (canRead && !state && loading) return <div className="onboarding-gate-status" role="status">Preparando la configuración de tu club…</div>;
  if (canRead && !state && error) return <div className="onboarding-gate-status" role="alert"><p>{error}</p><button className="primary-btn" onClick={() => void load()}>Reintentar</button></div>;
  return <>{children}{state?.shouldShow && <OnboardingDialog draft={draft} updateDraft={updateDraft} migrationAvailable={state.migrationAvailable&&permissions.includes('imports.run')} pending={loading} error={error} onComplete={() => void complete()} />}</>;
}

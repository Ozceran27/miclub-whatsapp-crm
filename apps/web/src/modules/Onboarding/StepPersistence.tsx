import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type StepPersistence = { save: () => Promise<void>; canContinue: boolean; valid?: boolean; saved?: boolean; batchId?: string | null };
type Registrar = (value: StepPersistence | null) => void;
const Context = createContext<Registrar | null>(null);

export function StepPersistenceProvider({ register, children }: { register: Registrar; children: ReactNode }) {
  return <Context.Provider value={register}>{children}</Context.Provider>;
}

export function useStepPersistence(value: StepPersistence) {
  const register = useContext(Context);
  useEffect(() => { register?.(value); return () => register?.(null); }, [register, value]);
}

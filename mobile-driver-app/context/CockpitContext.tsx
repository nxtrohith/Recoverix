import React, { createContext, useContext } from 'react';
import { useDriverCockpit } from '../hooks/useDriverCockpit';

type CockpitApi = ReturnType<typeof useDriverCockpit>;

const CockpitContext = createContext<CockpitApi | null>(null);

export function CockpitProvider({ children }: { children: React.ReactNode }) {
  const value = useDriverCockpit();
  return <CockpitContext.Provider value={value}>{children}</CockpitContext.Provider>;
}

export function useCockpit(): CockpitApi {
  const ctx = useContext(CockpitContext);
  if (!ctx) {
    throw new Error('useCockpit must be used within CockpitProvider');
  }
  return ctx;
}

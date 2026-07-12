'use client'

import { createContext, useContext } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useSync } from '@/hooks/use-sync'

// Cloud sync must run on EVERY route — it used to live inside UserButton, so any
// page without the header button (e.g. /plan/revise) silently never synced.
// Mounted once in Providers; consumers read status via useSyncStatus().

type SyncContextValue = {
  status: ReturnType<typeof useSync>['status']
  sync: ReturnType<typeof useSync>['sync']
}

const SyncContext = createContext<SyncContextValue>({
  status: 'idle',
  sync: async () => {},
})

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const { status, sync } = useSync(auth.user)
  return <SyncContext.Provider value={{ status, sync }}>{children}</SyncContext.Provider>
}

export function useSyncStatus() {
  return useContext(SyncContext)
}

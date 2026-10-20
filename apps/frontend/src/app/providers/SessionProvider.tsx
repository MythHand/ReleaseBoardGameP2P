import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react'
import type { UseLobby } from '~/network/useLobby'
import type { SessionStore } from './sessionStore'

const SessionContext = createContext<SessionStore | null>(null)

export function SessionProvider({ store, children }: { store: SessionStore; children: ReactNode }) {
  const Runtime = useSyncExternalStore(store.subscribe, store.getRuntime, store.getRuntime)
  return (
    <SessionContext.Provider value={store}>
      {Runtime && <Runtime publish={store.publish} />}
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionStore(): SessionStore {
  const store = useContext(SessionContext)
  if (!store) throw new Error('useSession must be used within <SessionProvider>')
  return store
}

export function useSessionStatus() {
  const store = useSessionStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useSession(): UseLobby {
  const snapshot = useSessionStatus()
  if (snapshot.status !== 'ready') throw new Error('Session runtime is not ready')
  return snapshot.value
}

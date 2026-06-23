import { createContext, type ReactNode, useContext } from 'react'
import { type UseLobby, useLobby } from '~/network'

const SessionContext = createContext<UseLobby | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  // useLobby holds the PeerJS transport in a ref. SessionProvider lives in the
  // _app root layout, which stays mounted across route changes, and refs persist
  // across re-renders — so the DataChannel survives lobby→board navigation.
  const lobby = useLobby()
  return <SessionContext.Provider value={lobby}>{children}</SessionContext.Provider>
}

export function useSession(): UseLobby {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>')
  return ctx
}

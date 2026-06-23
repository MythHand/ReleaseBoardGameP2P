import { createContext, memo, type ReactNode, useContext, useRef } from 'react'
import { type UseLobby, useLobby } from '~/network'

const SessionContext = createContext<UseLobby | null>(null)

// StableLobbyBridge is intentionally never re-rendered after mount.
// useLobby holds the PeerJS transport in a ref; re-invoking it would create a
// second transport instance and drop the existing DataChannel. The bridge
// receives children through a mutable ref so the latest subtree is always
// available without triggering a re-render of this component.
const StableLobbyBridge = memo(
  function StableLobbyBridge({ childrenRef }: { childrenRef: React.MutableRefObject<ReactNode> }) {
    const lobby = useLobby()
    return <SessionContext.Provider value={lobby}>{childrenRef.current}</SessionContext.Provider>
  },
  // Always bail out — lobby transport is stable via internal refs.
  () => true,
)

export function SessionProvider({ children }: { children: ReactNode }) {
  const childrenRef = useRef<ReactNode>(children)
  childrenRef.current = children
  return <StableLobbyBridge childrenRef={childrenRef} />
}

export function useSession(): UseLobby {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>')
  return ctx
}

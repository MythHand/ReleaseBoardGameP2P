import type { Choice, Event, PlayerView, Target } from '@release/engine'
import { useEffect, useRef, useState } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import type { Intent } from '~/network'

export interface Game {
  // Null before the first projection arrives, and for a spectator, who holds no
  // seat to be projected to.
  view: PlayerView | null
  events: Event[]
  play(card: string, target?: Target, combo?: string): void
  draw(pile?: number): void
  push(): void
  attack(card: string, combo?: string): void
  pass(): void
  unpass(): void
  resolve(choice: Choice): void
}

// The page's whole relationship with the game. It holds a `GameLink` and a
// projection and nothing else, so it cannot tell a local keeper from a remote
// one — which is what keeps solo play and networked play on one code path.
export function useGame(): Game {
  const session = useSession()
  const link = session.gameLink
  const sync = session.gameSync
  const gameId = session.gameId

  // The move history is this peer's own running record rather than part of
  // GameState: each seat accumulates only the events it was entitled to see.
  const [events, setEvents] = useState<Event[]>([])
  const seenGame = useRef<string | null>(null)
  const seenSync = useRef<typeof sync>(null)

  useEffect(() => {
    // A new game must not inherit the last one's feed.
    if (seenGame.current !== gameId) {
      seenGame.current = gameId
      seenSync.current = null
      setEvents([])
    }
  }, [gameId])

  useEffect(() => {
    if (!sync || sync === seenSync.current) return
    seenSync.current = sync
    if (sync.events.length > 0) setEvents((prev) => [...prev, ...sync.events])
  }, [sync])

  // An intent carries neither player nor clock — the referee stamps both from
  // the connection it arrived on, so a peer cannot act for another seat.
  const submit = (intent: Intent) => link?.submit(intent)

  return {
    view: sync?.view ?? null,
    events,
    play: (card, target, combo) => submit({ type: 'PLAY', card, target, combo }),
    draw: (pile) => submit({ type: 'DRAW', pile }),
    push: () => submit({ type: 'PUSH' }),
    attack: (card, combo) => submit({ type: 'ATTACK', card, combo }),
    pass: () => submit({ type: 'PASS' }),
    unpass: () => submit({ type: 'UNPASS' }),
    resolve: (choice) => submit({ type: 'RESOLVE', choice }),
  }
}

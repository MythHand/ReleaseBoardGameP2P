import type { GameState } from '@release/engine'
import type { PresentationRuntime } from './presentationGate'
import type { Session } from './referee'

// The table a keeper picks back up after it was off the signaling broker.
//
// While the host is off the broker the keeper stops ticking and stops taking
// intents (KeeperHandle.suspend), but its clock does not stop: every deadline
// in the session is an absolute keeper-epoch time, so on resume the whole span
// would read as spent and every timed choice would expire at once — on guests
// whose outage it never was. Shifting each live deadline by the pause puts
// every clock back exactly where it stood when the keeper froze.
//
// An undefined deadline stays undefined: a clock nobody started is not one
// that can run out, and stamping it here would start it.
//
// Absences are restamped to `now` by the same rule `restoreSeats` applies after
// a reload: a seat that went empty during the outage (its channel closed with
// the host's network) or before it did not spend the pause as grace. A bot is
// left untouched — it has no absence — and no peer id is cleared here: the
// channels that survived the drop are still live.
export function resumeSession(session: Session, pausedAt: number, now: number): Session {
  const by = now - pausedAt
  const seats = session.seats.map((seat) =>
    seat.bot || seat.peerId !== null ? seat : { ...seat, absentSince: now },
  )
  if (by <= 0) return { ...session, seats }
  return {
    ...session,
    seats,
    state: shiftState(session.state, by),
    presentation: session.presentation && shiftPresentation(session.presentation, by),
  }
}

// Only the two fields every timed span carries; anything else on the object is
// carried as it was.
function shiftSpan<T extends { openedAt?: number; deadline?: number }>(span: T, by: number): T {
  const next = { ...span }
  if (typeof span.openedAt === 'number') next.openedAt = span.openedAt + by
  if (typeof span.deadline === 'number') next.deadline = span.deadline + by
  return next
}

function shiftState(state: GameState, by: number): GameState {
  const pending = state.pending
  return {
    ...state,
    turn: shiftSpan(state.turn, by),
    window: state.window && shiftSpan(state.window, by),
    // The timed pendings (defend, stealCard, requestCard, giveCard) carry the
    // span; the untimed ones carry neither field and come back unchanged.
    pending:
      pending && ('deadline' in pending || 'openedAt' in pending)
        ? shiftSpan(pending as typeof pending & { openedAt?: number; deadline?: number }, by)
        : pending,
  }
}

// The presentation gate holds progress on absolute keeper times too: the bot
// pacing (`botNotBefore`) and the cap on a board that never reports.
function shiftPresentation(runtime: PresentationRuntime, by: number): PresentationRuntime {
  return {
    ...runtime,
    botNotBefore: runtime.botNotBefore + by,
    wait: runtime.wait && {
      ...runtime.wait,
      issuedAt: runtime.wait.issuedAt + by,
      deadline: runtime.wait.deadline + by,
    },
  }
}

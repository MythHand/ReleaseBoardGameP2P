import type { Action } from '../actions'
import { RELEASE_ATTACKS } from '../cards'
import type { Reduction } from '../engine'
import type { CardUid, GameState, PlayerId, ReactionWindow } from '../state'
import { checkWin, createLog, type Log, reject } from './core'

// understanding.md §7: the first reaction gets 15s; every later round in the same
// exchange gets 10s.
export const WINDOW_FIRST_MS = 15_000
export const WINDOW_NEXT_MS = 10_000

// Everyone who may throw an attack: living players other than the release owner.
export function respondersFor(state: GameState, owner: PlayerId): PlayerId[] {
  return state.seating.filter((id) => id !== owner && !state.eliminated.includes(id))
}

// Which of a viewer's cards may be thrown into the open window. DDoS is excluded:
// it does not destroy a bare release and resolves on its own path.
export function canAttackWith(state: GameState, viewer: PlayerId): CardUid[] {
  const w = state.window
  if (!w || state.pending) return []
  if (viewer === w.target.player) return []
  if (state.eliminated.includes(viewer)) return []
  const me = state.players[viewer]
  // A locked or frozen card is unplayable everywhere, not only from hand. The
  // window is the one route to ATTACK, so skipping the check here would leave
  // Rollback's lock enforced for PLAY and bypassed by the very re-throw it
  // exists to stop.
  return me.hand
    .filter((c) => RELEASE_ATTACKS.has(c.id))
    .filter((c) => !me.frozen.includes(c.uid) && !me.replayLocked.includes(c.uid))
    .map((c) => c.uid)
}

export function openWindow(
  state: GameState,
  log: Log,
  target: ReactionWindow['target'],
  round: number,
  at: number,
): GameState {
  // With nobody able to answer there is no window to open.
  if (respondersFor(state, target.player).length === 0) return { ...state, eventSeq: log.seq }
  const deadline = at + (round === 1 ? WINDOW_FIRST_MS : WINDOW_NEXT_MS)
  log.add({ type: 'windowOpened', player: target.player, slot: target.slot, round, deadline })
  return {
    ...state,
    window: { target, round, openedAt: at, deadline, passed: [] },
    eventSeq: log.seq,
  }
}

// Where a contested release is finally settled, so where the win is decided.
// Every close funnels through here — expiry, the last responder passing, and an
// attack resolving — which is what makes this the one place that has to ask.
// A release still standing when its window shuts has repelled everything thrown
// at it, and that is exactly the rules' condition for the third one to win.
export function closeWindow(state: GameState, log: Log): GameState {
  const w = state.window
  if (!w) return { ...state, eventSeq: log.seq }
  log.add({ type: 'windowClosed', player: w.target.player, slot: w.target.slot })
  return checkWin({ ...state, window: null, eventSeq: log.seq }, log)
}

// Close the standing window WITHOUT settling the win, because another window is
// opening in its place for a release that has only just arrived.
//
// `closeWindow` is deliberately the one place a win is decided — a release still
// standing when its window shuts has repelled everything thrown at it. A stolen
// release has repelled nothing yet: `resolution.md` §1 gives attack time to every
// fresh release in a zone "как бы она туда ни попала", so the steal hands the
// window over rather than ending the exchange. The win is then settled by the
// close of the window opened here, exactly as it is for a played release (#67).
//
// One window exists at a time (`state.window` is a single slot), so the close and
// the open are one step rather than two overlapping ones — §1's "пока это время
// идёт, в игре не происходит ничего другого" leaves no room for two.
export function handOverWindow(
  state: GameState,
  log: Log,
  target: ReactionWindow['target'],
  at: number,
): GameState {
  const w = state.window
  if (w) log.add({ type: 'windowClosed', player: w.target.player, slot: w.target.slot })
  const opened = openWindow({ ...state, window: null }, log, target, 1, at)
  // `openWindow` declines when nobody is alive to respond. Nothing will ever
  // close a window that never opened, so the win is settled now rather than
  // leaving the game hanging — the same fallback `placeRelease` carries.
  if (!opened.window) return checkWin(opened, log)
  return opened
}

export function onPass(state: GameState, action: Action & { type: 'PASS' }): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  if (state.pending) return reject(state, action, 'a decision is pending')
  if (!respondersFor(state, w.target.player).includes(action.player)) {
    return reject(state, action, 'you cannot respond to this window')
  }
  if (w.passed.includes(action.player)) return reject(state, action, 'you already passed')

  const log = createLog(state.eventSeq)
  log.add({ type: 'passed', player: action.player })
  const passed = [...w.passed, action.player]
  const next: GameState = { ...state, window: { ...w, passed }, eventSeq: log.seq }
  // A pass is only "close early if everyone agrees" — the window ends when the
  // last responder concurs, or when the clock runs out.
  if (passed.length === respondersFor(state, w.target.player).length) {
    return { state: closeWindow(next, log), events: log.events }
  }
  return { state: next, events: log.events }
}

export function onUnpass(state: GameState, action: Action & { type: 'UNPASS' }): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  if (!w.passed.includes(action.player)) return reject(state, action, 'you have not passed')

  const log = createLog(state.eventSeq)
  log.add({ type: 'unpassed', player: action.player })
  return {
    state: {
      ...state,
      window: { ...w, passed: w.passed.filter((id) => id !== action.player) },
      eventSeq: log.seq,
    },
    events: log.events,
  }
}

export function onWindowExpired(
  state: GameState,
  action: Action & { type: 'WINDOW_EXPIRED' },
): Reduction {
  const w = state.window
  if (!w) return reject(state, action, 'no reaction window is open')
  // An attack thrown into this very window can leave a defend pending on it —
  // the window stays open underneath while that plays out (release-scope
  // onDefend reopens it a round later). Expiring the window out from under an
  // undecided defend would close the one thing that pending needs back, and
  // strand it there permanently, so the exchange decides the window's fate
  // first; expiry gets its turn again once the defend resolves, same clock,
  // same deadline. Narrow to `defend` and only `defend`: it always carries its
  // own deadline and is the one pending kind with any bearing on this window
  // at all — a `handLimit` or any other kind sharing the moment has no stake
  // in it and nothing else would ever close the window on its behalf.
  if (state.pending?.kind === 'defend') return reject(state, action, 'a defence is pending')
  // The deadline is authoritative, not the caller's say-so: an early expiry would
  // let one peer cut everyone else's reaction time short.
  if (action.at < w.deadline) return reject(state, action, 'the window has not expired')

  const log = createLog(state.eventSeq)
  return { state: closeWindow(state, log), events: log.events }
}

import type { Action } from './actions'
import type { CardId, NeutralizeMethod, PlayerId, ReleaseSlot } from './state'

export interface EventBase {
  id: number
  // The causing event's id, so the history tree needs no inference. What is
  // linked today, and nothing beyond it: an answer to an attack (`defended`,
  // `tookHit`) names the `attacked` it answered; what a DDoS did
  // (`monitoringDestroyed`, `releaseReturned`) names the `attacked` that did it,
  // since nothing answers a DDoS and its target is the thrower's choice; and a
  // `discarded` names what spent the card — `eliminated`, `revealed`,
  // `neutralized`, `aiRevealed`, `tookHit`, `defended`, `attacked` (a spent
  // DDoS), `monitoringDestroyed` or `releaseReturned`.
  //
  // Absent everywhere else, which is a statement about the emitters, not about
  // what could be linked. This comment once described an intent instead — that
  // an attack also names the release it targeted — and was read as behaviour
  // and built on for a whole task before anyone checked (#138). Add a link here
  // only after the emitter emits it.
  parent?: number
  // The audience, declared by the engine because only the rules know what is
  // secret. Absent means public. The future sync layer filters on this field.
  visibleTo?: PlayerId[]
}

export type Event = EventBase &
  // `open` names the cards dealt face up — by the rules the Debugger is dealt
  // openly, so it is public information, and the projection would otherwise
  // drop it. Absent or empty means the whole hand travelled closed (a deck
  // under-supplied with Debuggers deals some players five random cards; see
  // fake/setup.ts).
  (
    | { type: 'dealt'; player: PlayerId; count: number; open?: CardId[] }
    | { type: 'drawn'; player: PlayerId; card?: CardId; pile: number; deckSize: number }
    | { type: 'released'; player: PlayerId; slot: ReleaseSlot; card: CardId; codeReview?: CardId }
    | { type: 'operationPlayed'; player: PlayerId; card: CardId; sudo: boolean }
    | { type: 'placed'; player: PlayerId; card: CardId }
    | { type: 'discarded'; player: PlayerId; card: CardId; reason: DiscardReason }
    | { type: 'windowOpened'; player: PlayerId; slot: ReleaseSlot; round: number; deadline: number }
    | { type: 'windowClosed'; player: PlayerId; slot: ReleaseSlot }
    | { type: 'passed'; player: PlayerId }
    | { type: 'attacked'; attacker: PlayerId; card: CardId; sudo: boolean; target: PlayerId }
    | { type: 'defended'; player: PlayerId; card: CardId; effect: DefenceEffect }
    | { type: 'tookHit'; player: PlayerId }
    | { type: 'releaseDestroyed'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseStolen'; from: PlayerId; to: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'releaseReturned'; player: PlayerId; slot: ReleaseSlot; card: CardId }
    | { type: 'monitoringDestroyed'; player: PlayerId; card: CardId }
    | {
        type: 'handTransfer'
        from: PlayerId
        to: PlayerId
        card?: CardId
        publicCard?: true
        index?: number
      }
    | { type: 'requested'; attacker: PlayerId; target: PlayerId; card: CardId; hit: boolean }
    | { type: 'revealed'; player: PlayerId; card: CardId }
    | { type: 'aiRevealed'; player: PlayerId; aiCard: CardId; eventCard: CardId }
    | { type: 'neutralized'; player: PlayerId; method: NeutralizeMethod }
    | { type: 'eliminated'; player: PlayerId }
    | { type: 'turnStarted'; player: PlayerId; index: number }
    | { type: 'turnEnded'; player: PlayerId }
    | { type: 'gameOver'; winner: PlayerId; condition: 'release' | 'lastStanding' }
    | { type: 'rejected'; action: Action; reason: string }
    | { type: 'takenFromDiscard'; player: PlayerId; card: CardId; to: 'hand' | 'deck' }
    // System Upgrade: a seat's answer, landing face up at the centre. Public,
    // because the rules put it there face up — and because the board animates
    // each arrival as it happens rather than the whole roster at the end.
    | { type: 'upgradeThrown'; player: PlayerId; card: CardId }
    // Sudo System Upgrade: the actor takes one of the open cards at the centre.
    | { type: 'upgradeTaken'; player: PlayerId; card: CardId }
    // Belongs to no player: the table recycles its own discard, and the count
    // is the only detail worth showing — the cards themselves were public on
    // the way in and are secret again on the way out.
    | { type: 'deckReshuffled'; cards: number }
    // Git Branch, Git Merge, or a pile running out. Carries the resulting pile
    // sizes because that is the whole visible effect — the cards themselves are
    // face down before and after.
    | { type: 'pilesChanged'; piles: number[] }
  )

export type DiscardReason =
  | 'releaseCost'
  | 'handLimit'
  | 'attackSpent'
  | 'defenceSpent'
  | 'destroyed'
  | 'neutralized'
  | 'trigger'
  | 'effect'

export type DefenceEffect = 'cancel' | 'return' | 'reflect' | 'take'

export type EventType = Event['type']

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(value: UnknownRecord, key: string): boolean {
  return typeof value[key] === 'string' && value[key].length > 0
}

function hasOptionalString(value: UnknownRecord, key: string): boolean {
  return value[key] === undefined || hasString(value, key)
}

function hasFiniteNumber(value: UnknownRecord, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key])
}

function hasNonNegativeInteger(value: UnknownRecord, key: string): boolean {
  return Number.isSafeInteger(value[key]) && (value[key] as number) >= 0
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0) &&
    new Set(value).size === value.length
  )
}

function hasOptionalStringArray(value: UnknownRecord, key: string): boolean {
  return value[key] === undefined || isStringArray(value[key])
}

const BASE_EVENT_KEYS = ['id', 'type', 'parent', 'visibleTo'] as const

const EVENT_PAYLOAD_KEYS: Record<EventType, readonly string[]> = {
  dealt: ['player', 'count', 'open'],
  drawn: ['player', 'card', 'pile', 'deckSize'],
  released: ['player', 'slot', 'card', 'codeReview'],
  placed: ['player', 'card'],
  operationPlayed: ['player', 'card', 'sudo'],
  discarded: ['player', 'card', 'reason'],
  windowOpened: ['player', 'slot', 'round', 'deadline'],
  windowClosed: ['player', 'slot'],
  passed: ['player'],
  attacked: ['attacker', 'card', 'sudo', 'target'],
  defended: ['player', 'card', 'effect'],
  tookHit: ['player'],
  releaseDestroyed: ['player', 'slot', 'card'],
  releaseStolen: ['from', 'to', 'slot', 'card'],
  releaseReturned: ['player', 'slot', 'card'],
  monitoringDestroyed: ['player', 'card'],
  handTransfer: ['from', 'to', 'card', 'publicCard', 'index'],
  requested: ['attacker', 'target', 'card', 'hit'],
  revealed: ['player', 'card'],
  aiRevealed: ['player', 'aiCard', 'eventCard'],
  neutralized: ['player', 'method'],
  eliminated: ['player'],
  turnStarted: ['player', 'index'],
  turnEnded: ['player'],
  gameOver: ['winner', 'condition'],
  rejected: ['action', 'reason'],
  takenFromDiscard: ['player', 'card', 'to'],
  upgradeThrown: ['player', 'card'],
  upgradeTaken: ['player', 'card'],
  deckReshuffled: ['cards'],
  pilesChanged: ['piles'],
}

function hasOnlyEventKeys(event: UnknownRecord): boolean {
  if (!isOneOf(event.type, Object.keys(EVENT_PAYLOAD_KEYS) as EventType[])) return false
  const allowed = new Set<string>([...BASE_EVENT_KEYS, ...EVENT_PAYLOAD_KEYS[event.type]])
  return Object.keys(event).every((key) => allowed.has(key))
}

function hasExactAudience(value: unknown, expected: string[]): boolean {
  return (
    isStringArray(value) &&
    value.length === expected.length &&
    expected.every((id) => value.includes(id))
  )
}

function hasCanonicalAudience(event: UnknownRecord): boolean {
  if (event.type === 'handTransfer') {
    // New transfers are public choreography; redactFor removes blind faces.
    // Legacy private transfers retain their exact original audience.
    if (event.visibleTo === undefined) return true
    return (
      hasString(event, 'card') &&
      hasExactAudience(event.visibleTo, [event.from as string, event.to as string])
    )
  }
  if (event.type === 'takenFromDiscard' && event.to === 'deck') {
    return hasExactAudience(event.visibleTo, [event.player as string])
  }
  return event.visibleTo === undefined
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T)
}

function hasEventShape(event: UnknownRecord): boolean {
  switch (event.type) {
    case 'dealt':
      return (
        hasString(event, 'player') &&
        hasNonNegativeInteger(event, 'count') &&
        hasOptionalStringArray(event, 'open')
      )
    case 'drawn':
      return (
        hasString(event, 'player') &&
        hasOptionalString(event, 'card') &&
        hasNonNegativeInteger(event, 'pile') &&
        hasNonNegativeInteger(event, 'deckSize')
      )
    case 'released':
      return (
        hasString(event, 'player') &&
        isOneOf(event.slot, ['frontend', 'backend', 'database']) &&
        hasString(event, 'card') &&
        hasOptionalString(event, 'codeReview')
      )
    case 'placed':
    case 'monitoringDestroyed':
    case 'revealed':
    case 'upgradeThrown':
    case 'upgradeTaken':
      return hasString(event, 'player') && hasString(event, 'card')
    case 'operationPlayed':
      return (
        hasString(event, 'player') && hasString(event, 'card') && typeof event.sudo === 'boolean'
      )
    case 'discarded':
      return (
        hasString(event, 'player') &&
        hasString(event, 'card') &&
        isOneOf(event.reason, [
          'releaseCost',
          'handLimit',
          'attackSpent',
          'defenceSpent',
          'destroyed',
          'neutralized',
          'trigger',
          'effect',
        ])
      )
    case 'windowOpened':
      return (
        hasString(event, 'player') &&
        isOneOf(event.slot, ['frontend', 'backend', 'database']) &&
        hasNonNegativeInteger(event, 'round') &&
        hasFiniteNumber(event, 'deadline')
      )
    case 'windowClosed':
      return hasString(event, 'player') && isOneOf(event.slot, ['frontend', 'backend', 'database'])
    case 'passed':
    case 'tookHit':
    case 'eliminated':
    case 'turnEnded':
      return hasString(event, 'player')
    case 'attacked':
      return (
        hasString(event, 'attacker') &&
        hasString(event, 'card') &&
        typeof event.sudo === 'boolean' &&
        hasString(event, 'target')
      )
    case 'defended':
      return (
        hasString(event, 'player') &&
        hasString(event, 'card') &&
        isOneOf(event.effect, ['cancel', 'return', 'reflect', 'take'])
      )
    case 'releaseDestroyed':
    case 'releaseReturned':
      return (
        hasString(event, 'player') &&
        isOneOf(event.slot, ['frontend', 'backend', 'database']) &&
        hasString(event, 'card')
      )
    case 'releaseStolen':
      return (
        hasString(event, 'from') &&
        hasString(event, 'to') &&
        isOneOf(event.slot, ['frontend', 'backend', 'database']) &&
        hasString(event, 'card')
      )
    case 'handTransfer':
      return (
        hasString(event, 'from') &&
        hasString(event, 'to') &&
        hasOptionalString(event, 'card') &&
        (event.publicCard === undefined ||
          (event.publicCard === true && hasString(event, 'card'))) &&
        (event.index === undefined || hasNonNegativeInteger(event, 'index'))
      )
    case 'requested':
      return (
        hasString(event, 'attacker') &&
        hasString(event, 'target') &&
        hasString(event, 'card') &&
        typeof event.hit === 'boolean'
      )
    case 'aiRevealed':
      return (
        hasString(event, 'player') && hasString(event, 'aiCard') && hasString(event, 'eventCard')
      )
    case 'neutralized':
      return (
        hasString(event, 'player') && isOneOf(event.method, ['debugger', 'monitoring', 'sacrifice'])
      )
    case 'turnStarted':
      return hasString(event, 'player') && hasNonNegativeInteger(event, 'index')
    case 'gameOver':
      return hasString(event, 'winner') && isOneOf(event.condition, ['release', 'lastStanding'])
    case 'rejected':
      return (
        isRecord(event.action) &&
        isOneOf(event.action.type, [
          'DRAW',
          'PLAY',
          'PUSH',
          'ATTACK',
          'PASS',
          'WINDOW_EXPIRED',
          'CLOCK_STARTED',
          'RESOLVE',
        ]) &&
        hasFiniteNumber(event.action, 'at') &&
        hasString(event, 'reason')
      )
    case 'takenFromDiscard':
      return (
        hasString(event, 'player') &&
        hasString(event, 'card') &&
        isOneOf(event.to, ['hand', 'deck'])
      )
    case 'deckReshuffled':
      return hasNonNegativeInteger(event, 'cards')
    case 'pilesChanged':
      return (
        Array.isArray(event.piles) &&
        event.piles.every((pile) => Number.isSafeInteger(pile) && pile >= 0)
      )
    default:
      return false
  }
}

export function parseEventLog(value: unknown): Event[] | null {
  if (!Array.isArray(value)) return null
  const events: Event[] = []
  let previousId = 0
  for (const entry of value) {
    if (!isRecord(entry)) return null
    if (!Number.isSafeInteger(entry.id) || (entry.id as number) <= previousId) return null
    if (
      entry.parent !== undefined &&
      (!Number.isSafeInteger(entry.parent) ||
        (entry.parent as number) <= 0 ||
        (entry.parent as number) >= (entry.id as number))
    ) {
      return null
    }
    if (
      !hasOptionalStringArray(entry, 'visibleTo') ||
      !hasEventShape(entry) ||
      !hasOnlyEventKeys(entry) ||
      !hasCanonicalAudience(entry)
    ) {
      return null
    }
    previousId = entry.id as number
    events.push({
      ...entry,
      ...(Array.isArray(entry.visibleTo) && { visibleTo: [...entry.visibleTo] }),
    } as Event)
  }
  return events
}

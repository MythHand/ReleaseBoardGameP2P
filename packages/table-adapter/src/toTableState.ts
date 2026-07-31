import type { Event, PlayerView, ReleaseView } from '@release/engine'
import type { HistoryEntry, TableState } from '@release/ui'
import { type CardData, COVERS, cardById } from '@release/ui'

// One label per member of the engine's Event union — the adapter maps event
// types to translated text, replacing the mock's free-form `kind` literals.
// Task 15 adds the matching keys under `moveHistory` in both catalogs.
export type HistoryLabels = Record<Event['type'], string>

// `assetUrl` throws on a key the catalogue does not recognise, so a card id
// the catalogue does not know cannot resolve through it — `toTableState` must
// stay total. This placeholder never calls `assetUrl` with an unknown key: its
// `art` is the already-resolved base cover, a real asset that always exists.
const PLACEHOLDER_CARD: CardData = {
  id: 'unknown',
  name: '?',
  category: 'attack',
  deck: 'base',
  art: COVERS.base,
  tags: [],
  qty: 0,
}

const cardOrPlaceholder = (id: string): CardData => cardById(id) ?? PLACEHOLDER_CARD

// ReleaseView's slots carry uid + card id (+ codeReview); the kit's release
// zone renders full Card objects and has no slot for either uid or a combo'd
// Code Review — both are dropped here, not hidden by the kit.
function toReleaseSlots(release: ReleaseView) {
  return {
    frontend: release.frontend ? cardOrPlaceholder(release.frontend.card) : undefined,
    backend: release.backend ? cardOrPlaceholder(release.backend.card) : undefined,
    database: release.database ? cardOrPlaceholder(release.database.card) : undefined,
    monitoring: release.monitoring ? cardOrPlaceholder(release.monitoring.card) : undefined,
  }
}

// Who the event happened to/because of. Most variants carry `player`; the few
// that don't name their primary actor explicitly.
function actorOf(e: Event): string | undefined {
  switch (e.type) {
    case 'attacked':
    case 'requested':
      return e.attacker
    case 'releaseStolen':
    case 'handTransfer':
      return e.from
    case 'gameOver':
      return e.winner
    case 'rejected':
      return 'player' in e.action ? e.action.player : undefined
    default:
      return e.player
  }
}

// The primary card an event is about, resolved to its display name — never
// the raw id, so an unknown card can't leak an internal string into the UI.
function cardTextOf(e: Event): string | undefined {
  switch (e.type) {
    case 'released':
    case 'placed':
    case 'discarded':
    case 'attacked':
    case 'defended':
    case 'releaseDestroyed':
    case 'releaseStolen':
    case 'releaseReturned':
    case 'monitoringDestroyed':
    case 'requested':
    case 'revealed':
      return cardOrPlaceholder(e.card).name
    case 'drawn':
    case 'handTransfer':
      return e.card ? cardOrPlaceholder(e.card).name : undefined
    case 'aiRevealed':
      return cardOrPlaceholder(e.aiCard).name
    default:
      return undefined
  }
}

function toHistoryEntry(e: Event, labels: HistoryLabels): HistoryEntry {
  return {
    id: e.id,
    who: actorOf(e) ?? '',
    kind: labels[e.type],
    card: cardTextOf(e),
    parent: e.parent,
  }
}

// The projection becomes a table: PlayerView + the event log + translated
// labels -> everything the kit's Table needs to render. Pure — no React, no
// clock, no randomness. Total — an unknown card id renders a placeholder
// rather than throwing (`assetUrl` throws; `cardById` does not, and this
// function never calls `assetUrl` directly).
export function toTableState(view: PlayerView, log: Event[], labels: HistoryLabels): TableState {
  const visible = log.filter((e) => !e.visibleTo || e.visibleTo.includes(view.self.id))
  const history = visible.map((e) => toHistoryEntry(e, labels)).reverse()

  return {
    you: {
      name: view.self.name,
      hand: view.self.hand.map((c) => ({ uid: c.uid, card: cardOrPlaceholder(c.id) })),
      release: toReleaseSlots(view.self.release),
    },
    opponents: view.opponents.map((o) => ({
      id: o.id,
      name: o.name,
      handCount: o.handCount,
      release: toReleaseSlots(o.release),
      eliminated: o.eliminated,
    })),
    decks: {
      // The kit renders one deck; split piles are #61's problem.
      main: view.decks.piles.reduce((a, b) => a + b, 0),
      events: view.decks.events,
      discard: view.decks.discardTop ? cardOrPlaceholder(view.decks.discardTop) : undefined,
      discardCount: view.decks.discardCount,
    },
    turn: view.turn.player,
    hasDrawn: view.turn.hasDrawn,
    selfId: view.self.id,
    history,
    setup: view.setup,
    playable: view.self.playable,
    frozen: view.self.frozen,
    // Structural passthrough — licensed by the Exact<> assertions in
    // contract.test-d.ts. Both carry openedAt alongside deadline already.
    pending: view.pending,
    window: view.window,
    // comboOptions has no source in PlayerView yet — the engine's projection
    // does not compute pairing legality, so this stays unset rather than
    // guessed. participants/spectators are room facts and are never produced
    // here (Decision 7 / the constraint on this task).
  }
}

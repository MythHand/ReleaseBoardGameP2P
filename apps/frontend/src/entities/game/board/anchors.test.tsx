import { CARD_RATIO, CARD_W } from '@release/ui'
import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors } from './anchors'
import { useBoardAnchors } from './anchors'

// The registry's own behaviour, tested directly — a DOM query through the
// whole board (as boardAnchors.test.tsx does) can never see a ref, so those
// assertions cannot tell a wired anchor from an unwired one. This file drives
// `useBoardAnchors` through a probe and asserts on the registry object it
// hands back, the same object a real consumer (the deal intro, a future beat
// queue) would capture into its own ref.
//
// `hand` needs real DOM (handSlotAt walks it via querySelector), so the probe
// renders it for real; the other members take plain elements bound directly,
// exactly as `_Board.tsx`'s ref callbacks do.
function Probe({ onReady }: { onReady: (a: BoardAnchors) => void }) {
  const anchors = useBoardAnchors()
  onReady(anchors)
  return (
    <div ref={anchors.hand}>
      <div data-hand-slot />
      <div data-hand-slot />
      <div data-hand-slot />
    </div>
  )
}

function mount() {
  const seen: BoardAnchors[] = []
  const onReady = (a: BoardAnchors) => seen.push(a)
  const { container, rerender } = render(<Probe onReady={onReady} />)
  return { container, seen, rerender: () => rerender(<Probe onReady={onReady} />) }
}

it('handSlotAt(index) indexes the fan', () => {
  const { container, seen } = mount()
  const anchors = seen[0]
  const slots = container.querySelectorAll('[data-hand-slot]')
  expect(slots).toHaveLength(3)
  // identity, not just truthiness — an off-by-one would still find SOME node
  expect(anchors.handSlotAt(1)).toBe(slots[1])
  expect(anchors.handSlotAt(7)).toBeNull()
})

it('releaseSlot keys by owner AND slot — one player cannot see into another’s zone', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const a = document.createElement('div')
  const b = document.createElement('div')
  // Both players have a slot named `frontend`; a registry keyed on the slot
  // name alone would answer the wrong player's node here.
  anchors.bindReleaseSlot('p2', 'frontend', a)
  anchors.bindReleaseSlot('p3', 'frontend', b)
  expect(anchors.releaseSlot('p2', 'frontend')).toBe(a)
  expect(anchors.releaseSlot('p3', 'frontend')).toBe(b)
  // An unbound slot answers null, not undefined-shaped behaviour.
  expect(anchors.releaseSlot('p2', 'backend')).toBeNull()
})

it('seatOf releases its node when the ref callback unbinds', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const el = document.createElement('div')
  anchors.bindSeat('p2', el)
  expect(anchors.seatOf('p2')).toBe(el)
  // React calls a ref callback with null on unmount — the real lifecycle, not
  // a hypothetical one.
  anchors.bindSeat('p2', null)
  expect(anchors.seatOf('p2')).toBeNull()
})

it('seatBox trims a seat to a centred card box (I6)', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const el = document.createElement('div')
  // jsdom reports zero rects; a seat is far wider than a card, so stub one
  // that would visibly fail if seatBox aimed at the seat rect itself.
  el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 120 }) as DOMRect
  anchors.bindSeat('p2', el)
  const box = anchors.seatBox('p2')
  expect(box?.width).toBe(CARD_W)
  expect(box?.left).toBe(100 + (400 - CARD_W) / 2)
  // BOTH axes, and the height. Asserting only the horizontal half would pass a
  // seatBox that handed back the seat's own `top` — and a card aimed at that
  // lands on the seat's upper edge instead of its middle. The height matters for
  // the same reason: the box a flight scales to is a card, not a seat.
  expect(box?.height).toBe(CARD_W * CARD_RATIO)
  expect(box?.top).toBe(50 + (120 - CARD_W * CARD_RATIO) / 2)
  expect(anchors.seatBox('nobody')).toBeNull()
})

it('keeps one identity across renders', () => {
  const { seen, rerender } = mount()
  rerender()
  expect(seen).toHaveLength(2)
  // Consumers capture this object into a ref for a long-running async
  // sequence; a fresh object per render would arm those against a stale one.
  expect(Object.is(seen[0], seen[1])).toBe(true)
})

it('pileBox keys by index — a draw aims at the pile its event names', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const a = document.createElement('div')
  const b = document.createElement('div')
  anchors.bindPile(0, a)
  anchors.bindPile(1, b)
  expect(anchors.pileBox(0)).toBe(a)
  expect(anchors.pileBox(1)).toBe(b)
  // A pile that is not on the table answers null rather than falling back to
  // pile 0 — aiming a flight at the wrong deck is worse than not flying it.
  expect(anchors.pileBox(2)).toBeNull()
  // React calls a ref callback with null on unmount; a merged-away pile must
  // not linger in the registry.
  anchors.bindPile(1, null)
  expect(anchors.pileBox(1)).toBeNull()
})

// A CARD LET GO OF, OR SENT HOME, IS NO LONGER HELD — and the registry forgets
// it itself. A holder whose own release forgets nothing (System Upgrade's
// flight, a flight to a hand-limit cell) used to leave its entry behind, and
// the same card coming back was found there ahead of its next holder
// (ditayler, #266). A holder already holding its next card keeps it.
it('forgets a held card once it is let go of or sent home, and only that one', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const held = (uid: string) => ({
    uid,
    el: () => null,
    take: vi.fn(),
    release: vi.fn(),
    home: vi.fn(),
  })

  const flight = held('sudo#0')
  anchors.hold('upgrade-local', flight)
  anchors.heldCard('sudo#0')?.release()
  expect(flight.release).toHaveBeenCalledOnce()
  expect(anchors.heldCard('sudo#0')).toBeNull()

  const sent = held('sudo#0')
  anchors.hold('hl1', sent)
  anchors.heldCard('sudo#0')?.home()
  expect(sent.home).toHaveBeenCalledOnce()
  expect(anchors.heldCard('sudo#0')).toBeNull()

  // the holder let go of one card and already holds the next one
  const first = held('bug#0')
  anchors.hold('fan', first)
  const stale = anchors.heldCard('bug#0')
  const next = held('bug#1')
  anchors.hold('fan', next)
  stale?.release()
  expect(first.release).toHaveBeenCalledOnce()
  expect(anchors.heldCard('bug#1')?.uid).toBe('bug#1')
})

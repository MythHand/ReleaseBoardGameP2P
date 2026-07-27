import { type KeyboardEvent as ReactKeyboardEvent, useCallback } from 'react'

// Spatial (grid-aware) arrow-key focus navigation, layered ON TOP of Tab —
// Tab order is untouched; arrows just move focus to the geometrically nearest
// focusable element in the pressed direction. Because the target is picked from
// real element positions, crossing between columns falls out of the geometry:
// pressing → from a column's boundary element lands on the nearest element in
// the next column. Nothing here changes any value — focus only.

type Dir = 'up' | 'down' | 'left' | 'right'

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Off-axis distance is penalized so a move prefers elements aligned with the
// travel direction (keeps ↓ within a column, → within a row) before drifting.
const CROSS_PENALTY = 2

function isTextEntry(el: Element | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false
  return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(el.type)
}

// In a text field the horizontal arrows move the caret — but only until it hits
// the matching edge. At the far left ← releases focus, at the far right → does;
// in between (or with an active selection) the arrow stays with the caret.
function caretHoldsArrow(el: HTMLInputElement, dir: 'left' | 'right'): boolean {
  const { selectionStart, selectionEnd, value } = el
  // Caret position unknown (input type without a text selection API): keep it.
  if (selectionStart === null || selectionEnd === null) return true
  // A live selection collapses on the first arrow — let the field handle it.
  if (selectionStart !== selectionEnd) return true
  return dir === 'left' ? selectionStart !== 0 : selectionEnd !== value.length
}

function centerOf(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function nearestInDirection(
  current: HTMLElement,
  candidates: HTMLElement[],
  dir: Dir,
): HTMLElement | null {
  const a = centerOf(current)
  const horizontal = dir === 'left' || dir === 'right'
  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const el of candidates) {
    if (el === current) continue
    const b = centerOf(el)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const inDir =
      dir === 'right' ? dx > 1 : dir === 'left' ? dx < -1 : dir === 'down' ? dy > 1 : dy < -1
    if (!inDir) continue
    const primary = horizontal ? Math.abs(dx) : Math.abs(dy)
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx)
    // Stay within a ~45° cone of the travel direction: → must land on something
    // genuinely to the side (like the dice button), not an element that is mostly
    // below and only slightly to the right (the submit button under the field).
    if (cross > primary) continue
    const score = primary + cross * CROSS_PENALTY
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

// Returns an onKeyDown handler to spread on the container that owns the grid
// (e.g. the create modal). Fires only while focus is inside that container.
export function useSpatialNav() {
  return useCallback((e: ReactKeyboardEvent<HTMLElement>) => {
    const dir = KEY_DIR[e.key]
    if (!dir) return
    const active = document.activeElement as HTMLElement | null
    const container = e.currentTarget
    if (!active || !container.contains(active)) return
    // Horizontal arrows stay with the caret until it reaches the field's edge.
    if ((dir === 'left' || dir === 'right') && isTextEntry(active) && caretHoldsArrow(active, dir))
      return

    const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    )
    const target = nearestInDirection(active, candidates, dir)
    if (target) {
      e.preventDefault()
      target.focus()
    }
  }, [])
}

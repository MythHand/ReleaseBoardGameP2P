// WHAT IS ON THE SCREEN, frame by frame (#168). The board's own lines say what
// it means to draw; this says what the page actually shows — every card that is
// visible, and where it stands — read off the page itself on every painted
// frame while the stand records. Nothing in it knows a beat, a gesture or a
// case: a card drawn twice, or gone for one frame, shows here whatever drew it.

// A place on the page, named by what marks it: a test id, a known board place,
// or else the local name of its first CSS-module class (`_flyer_x1y2` → flyer).
function labelOf(el: Element): string | null {
  const d = (el as HTMLElement).dataset ?? {}
  if (d.testid) return d.testid
  if (d.handSlot !== undefined) return 'fan'
  if (d.boardCentre !== undefined) return 'centre'
  if (d.stageSlot !== undefined) return `row${d.stageSlot}`
  if (d.pendingPlay !== undefined) return 'pending'
  if (d.pileBox !== undefined) return 'pile'
  for (const c of el.classList) {
    const local = /^_([A-Za-z][A-Za-z0-9]*)_/.exec(c)?.[1]
    if (local) return local
  }
  return null
}

// where a card stands: the three nearest named places around it, nearest first
function whereOf(card: Element): string {
  const names: string[] = []
  for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
    const name = labelOf(el)
    if (name && names.at(-1) !== name) names.push(name)
    if (names.length === 3) break
  }
  return names.join('<') || 'page'
}

const shows = (el: Element) => {
  const check = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility
  // without it (a test's page, an older browser): the same question asked of
  // the computed style of the card and of everything around it
  if (!check) {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
    }
    return true
  }
  return check.call(el, {
    opacityProperty: true,
    visibilityProperty: true,
    checkOpacity: true,
    checkVisibilityCSS: true,
  })
}

// WHICH COPY OF THE CARD this is, where the page says: the fan's slot is named
// by the card's own uid, and a surface names its cells by it (`…-attack-bug#3`).
// Elsewhere the page knows only the card, and so does this.
function copyOf(card: Element, id: string): string | null {
  const own = new RegExp(`(${id.replace(/[^a-z0-9-]/gi, '')}#\\d+)$`)
  for (let el = card.parentElement; el && el !== document.body; el = el.parentElement) {
    const d = (el as HTMLElement).dataset ?? {}
    if (d.handSlot) return d.handSlot
    const named = d.testid ? own.exec(d.testid)?.[1] : undefined
    if (named) return named
  }
  return null
}

export interface ScreenFrame {
  // place → the cards visible in it, in page order: the copy (`attack-bug#6`)
  // where the page names it, the card (`attack-bug`) where it does not
  cards: Record<string, string[]>
  // a card visible more than once at the same time — unless every one of those
  // is a different, named copy, which is two cards and not one drawn twice
  twice: string[]
}

export function readScreen(): ScreenFrame {
  const cards: Record<string, string[]> = {}
  const copies = new Map<string, (string | null)[]>()
  for (const el of document.querySelectorAll('[data-card], [data-face-down]')) {
    // a card face nested inside another card's node is the same card
    if (el.parentElement?.closest('[data-card], [data-face-down]')) continue
    if (!shows(el)) continue
    const id = (el as HTMLElement).dataset.card || 'back'
    const copy = id === 'back' ? null : copyOf(el, id)
    const where = whereOf(el)
    if (!cards[where]) cards[where] = []
    cards[where].push(copy ?? id)
    if (id !== 'back') copies.set(id, [...(copies.get(id) ?? []), copy])
  }
  const twice = [...copies]
    .filter(([, seen]) => {
      if (seen.length < 2) return false
      const named = seen.filter((c): c is string => c != null)
      return named.length < seen.length || new Set(named).size < named.length
    })
    .map(([id]) => id)
  return { cards, twice }
}

/** Reads the screen on every painted frame and hands on each one that differs. */
export function watchScreen(onFrame: (frame: ScreenFrame) => void): () => void {
  let last = ''
  let handle = 0
  const tick = () => {
    const frame = readScreen()
    const text = JSON.stringify(frame)
    if (text !== last) {
      last = text
      onFrame(frame)
    }
    handle = requestAnimationFrame(tick)
  }
  handle = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(handle)
}

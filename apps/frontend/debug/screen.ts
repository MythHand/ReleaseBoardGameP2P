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

// HOW A CARD LIES, as the eye sees it: its centre and width on the page, the
// angle it is turned to, and its LAYER — where it falls in the order the page
// paints every visible card, 0 the lowest. Which card covers which, and whether
// a card at rest jumped or slid under its neighbour, is read off these.
export type Pose = [x: number, y: number, w: number, rot: number, z: number]

// The angle a node is drawn at: its own turn and every turn around it, read off
// the computed transform — the one an animation is playing included.
function angleOf(el: Element): number {
  let deg = 0
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const t = getComputedStyle(n).transform
    if (!t || t === 'none') continue
    const m = /^matrix(?:3d)?\(([^)]+)\)/.exec(t)
    if (m) {
      const [a, b] = m[1].split(',').map(Number)
      deg += (Math.atan2(b, a) * 180) / Math.PI
      continue
    }
    // a page that does not resolve transforms to a matrix (a test's) keeps it as written
    const r = /rotate\((-?[\d.]+)deg\)/.exec(t)
    if (r) deg += Number(r[1])
  }
  return Math.round(deg * 10) / 10
}

// The stacking contexts a node is painted in, outermost first, each with the
// level it is given in its parent — the CSS painting order, reduced to what
// tells two cards apart. The card itself closes the chain.
function layersOf(el: Element): { node: Element; z: number }[] {
  const chain: { node: Element; z: number }[] = [{ node: el, z: 0 }]
  for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n)
    const z = s.zIndex === 'auto' ? null : Number(s.zIndex)
    const positioned = s.position !== 'static'
    const context =
      (positioned && z !== null) ||
      s.position === 'fixed' ||
      s.position === 'sticky' ||
      Number(s.opacity) < 1 ||
      (s.transform !== '' && s.transform !== 'none') ||
      s.isolation === 'isolate'
    if (context) chain.unshift({ node: n, z: z ?? 0 })
  }
  return chain
}

// which of two cards the page paints later — over the other where they overlap
function above(a: { node: Element; z: number }[], b: { node: Element; z: number }[]): number {
  let i = 0
  while (i < a.length - 1 && i < b.length - 1 && a[i].node === b[i].node) i++
  if (a[i].z !== b[i].z) return a[i].z - b[i].z
  if (a[i].node === b[i].node) return 0
  return a[i].node.compareDocumentPosition(b[i].node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

export interface ScreenFrame {
  // place → the cards visible in it, in page order: the copy (`attack-bug#6`)
  // where the page names it, the card (`attack-bug`) where it does not
  cards: Record<string, string[]>
  // place → how each of those cards lies, in the same order as `cards`
  poses: Record<string, Pose[]>
  // a card visible more than once at the same time — unless every one of those
  // is a different, named copy, which is two cards and not one drawn twice
  twice: string[]
  // THE FACE-DOWN PILES, each as its box on the page: [left, top, width, height]
  // — the draw piles and the events deck. A card that comes to rest on one and
  // is then drawn nowhere has gone INTO it, and the pile draws it as a back
  // among backs; seen without these, it would read as a card that vanished.
  decks: [number, number, number, number][]
}

export function readScreen(): ScreenFrame {
  const cards: Record<string, string[]> = {}
  const poses: Record<string, Pose[]> = {}
  const copies = new Map<string, (string | null)[]>()
  const visible: { el: Element; pose: Pose }[] = []
  for (const el of document.querySelectorAll('[data-card], [data-face-down]')) {
    // a card face nested inside another card's node is the same card
    if (el.parentElement?.closest('[data-card], [data-face-down]')) continue
    if (!shows(el)) continue
    const id = (el as HTMLElement).dataset.card || 'back'
    const copy = id === 'back' ? null : copyOf(el, id)
    const where = whereOf(el)
    if (!cards[where]) cards[where] = []
    if (!poses[where]) poses[where] = []
    cards[where].push(copy ?? id)
    const r = el.getBoundingClientRect()
    const pose: Pose = [
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2),
      Math.round(r.width),
      angleOf(el),
      0,
    ]
    poses[where].push(pose)
    visible.push({ el, pose })
    if (id !== 'back') copies.set(id, [...(copies.get(id) ?? []), copy])
  }
  // the layer is the card's place in the order the page paints them all
  const chains = new Map(visible.map((s) => [s.el, layersOf(s.el)]))
  const painted = [...visible].sort((a, b) => {
    const ca = chains.get(a.el) ?? []
    const cb = chains.get(b.el) ?? []
    return above(ca, cb)
  })
  painted.forEach((s, z) => {
    s.pose[4] = z
  })
  const twice = [...copies]
    .filter(([, seen]) => {
      if (seen.length < 2) return false
      const named = seen.filter((c): c is string => c != null)
      return named.length < seen.length || new Set(named).size < named.length
    })
    .map(([id]) => id)
  const decks = [...document.querySelectorAll('[data-pile-box], [data-events-box]')].map((el) => {
    const r = el.getBoundingClientRect()
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] as [
      number,
      number,
      number,
      number,
    ]
  })
  return { cards, poses, twice, decks }
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

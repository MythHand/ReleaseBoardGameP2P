import type { LogEntry } from './recorder'

// READING A RECORDING BACK (#168). The recorder keeps what the page showed on
// every painted frame (`screen.ts`); this reads it and says where a card was
// drawn wrong. Nothing in it knows a beat, a gesture or a case — it counts each
// card on the screen frame by frame, the way the eye would if it could stop
// time, so a defect is found whatever drew it.
//
// Three findings, all about ONE CARD, ONE PLACE:
//   gone   — the card was drawn fewer times for a while, then as before: it
//            vanished between two places (a carrier came down before the place
//            had it), however long that lasted;
//   twice  — drawn more times for a while, then as before: it stood where it
//            was and where it went at once;
//   hop    — drawn as many times, but somewhere else for a moment: it passed
//            through a place it never meant to stand in.
// A count that changes and stays changed is the game moving on (a card dealt to
// a closed hand, a second copy drawn), not a finding.
//
// Two more, about how a card LIES — read off the poses the recorder keeps
// beside each card (`screen.ts`), and asked only of cards at rest, so a card in
// flight passing over or tucking under another is never one of them:
//   layer  — two cards lying over each other swapped which one is on top: the
//            heap re-stacked itself, or a card landed on top and then sank;
//   snap   — a card at rest jumped to another pose in one frame and stayed
//            there: it landed on one spot and the place drew it on another.
//
// Called from the command line through `analyze.mjs`, whose header says how.

export interface Options {
  /** a card gone or doubled for longer than this is the game, not a slip */
  window: number
  /** a hop shorter than this is reported */
  short: number
  /** places that copy a card on purpose: the zoom and preview on hover */
  ignore: RegExp
}

export const DEFAULTS: Options = { window: 2000, short: 60, ignore: /zoom|preview/ }

export interface Finding {
  kind: 'gone' | 'twice' | 'hop' | 'layer' | 'snap'
  card: string
  t: number
  lasted: number
  before: string[]
  during: string[]
  after: string[]
  /** the beats running at that moment */
  beats: string[]
}

/** centre x, y, width, angle, layer — `screen.ts`'s `Pose` */
type Pose = [number, number, number, number, number]

interface Shot {
  t: number
  cards: Record<string, string[]>
  /** absent in a recording made before poses were kept */
  poses?: Record<string, Pose[]>
}

const shotsOf = (entries: LogEntry[]): Shot[] =>
  entries.flatMap((e) =>
    e.kind === 'screen' && e.data.cards
      ? [
          {
            t: e.t,
            cards: e.data.cards as Record<string, string[]>,
            poses: e.data.poses as Record<string, Pose[]> | undefined,
          },
        ]
      : [],
  )

interface Lying {
  where: string
  pose: Pose
}

// Every card at its pose in one frame, by the name it is known by — a second
// copy the page does not tell apart is `~2`, in page order. Backs have no name
// to follow, and the hover copies are not the table.
function lyingIn(shot: Shot, ignore: RegExp): Map<string, Lying> {
  const out = new Map<string, Lying>()
  if (!shot.poses) return out
  for (const [where, ids] of Object.entries(shot.cards)) {
    if (ignore.test(where)) continue
    const poses = shot.poses[where] ?? []
    ids.forEach((id, i) => {
      if (id === 'back' || !poses[i]) return
      let key = id
      for (let n = 2; out.has(key); n++) key = `${id}~${n}`
      out.set(key, { where, pose: poses[i] })
    })
  }
  return out
}

// at rest between two frames: the same spot, size and angle, to a pixel
const still = (a: Pose, b: Pose) =>
  Math.abs(a[0] - b[0]) <= 1 &&
  Math.abs(a[1] - b[1]) <= 1 &&
  Math.abs(a[2] - b[2]) <= 1 &&
  Math.abs(a[3] - b[3]) <= 0.5

// a JUMP, not the tail of a movement: an eased slide spends its last frames a
// pixel or two at a time, resting between them, and that is not a card that
// landed on one spot and was drawn on another
const jumped = (a: Pose, b: Pose) =>
  Math.abs(a[0] - b[0]) >= 6 ||
  Math.abs(a[1] - b[1]) >= 6 ||
  Math.abs(a[2] - b[2]) >= 6 ||
  Math.abs(a[3] - b[3]) >= 2

// two cards lying over each other — boxes that overlap, a card being taller than wide
const overlap = (a: Pose, b: Pose) => {
  const w = (a[2] + b[2]) / 2
  return Math.abs(a[0] - b[0]) < w && Math.abs(a[1] - b[1]) < w * 1.4
}

const poseText = (p: Pose) => `(${p[0]},${p[1]} w${p[2]} ${p[3]}° z${p[4]})`

/** A card that jumped at rest, and two that swapped which lies on top. */
function lyingFindings(shots: Shot[], ignore: RegExp, beatsAt: (t: number) => string[]) {
  const out: Finding[] = []
  const frames = shots.filter((s) => s.poses).map((s) => ({ t: s.t, lying: lyingIn(s, ignore) }))
  for (let i = 1; i < frames.length; i++) {
    const was = frames[i - 1].lying
    const now = frames[i].lying
    const t = frames[i].t
    // SNAP — at rest the frame before, somewhere else now, and at rest there after
    for (const [key, cur] of now) {
      const prev = was.get(key)
      const older = frames[i - 2]?.lying.get(key)
      const next = frames[i + 1]?.lying.get(key)
      if (!prev || !older || !next) continue
      if (
        !still(older.pose, prev.pose) ||
        !jumped(prev.pose, cur.pose) ||
        !still(cur.pose, next.pose)
      )
        continue
      out.push({
        kind: 'snap',
        card: key,
        t,
        lasted: 0,
        before: [`${prev.where} ${poseText(prev.pose)}`],
        during: [`${cur.where} ${poseText(cur.pose)}`],
        after: [],
        beats: beatsAt(t),
      })
    }
    // LAYER — two cards at rest, over each other, the other one on top now
    const keys = [...now.keys()].filter((k) => {
      const p = was.get(k)
      const c = now.get(k)
      return p && c && still(p.pose, c.pose)
    })
    for (let a = 0; a < keys.length; a++) {
      for (let b = a + 1; b < keys.length; b++) {
        const [pa, pb] = [was.get(keys[a]), was.get(keys[b])] as Lying[]
        const [ca, cb] = [now.get(keys[a]), now.get(keys[b])] as Lying[]
        if (!overlap(ca.pose, cb.pose)) continue
        const before = pa.pose[4] > pb.pose[4]
        const after = ca.pose[4] > cb.pose[4]
        if (before === after) continue
        const over = (top: boolean) =>
          top ? `${keys[a]} over ${keys[b]}` : `${keys[b]} over ${keys[a]}`
        out.push({
          kind: 'layer',
          card: `${keys[a]} / ${keys[b]}`,
          t,
          lasted: 0,
          before: [over(before)],
          during: [over(after)],
          after: [`${keys[a]} in ${ca.where}`, `${keys[b]} in ${cb.where}`],
          beats: beatsAt(t),
        })
      }
    }
  }
  return out
}

/** The card itself, whichever copy: the page names a copy only where it knows it. */
export const cardOf = (id: string) => id.replace(/#[^#]*$/, '')

/** Every place one card is drawn in, in one frame, the hover copies left out. */
function placesOf(shot: Shot, card: string, ignore: RegExp): string[] {
  return Object.entries(shot.cards)
    .filter(([where]) => !ignore.test(where))
    .flatMap(([where, cards]) => cards.filter((c) => cardOf(c) === card).map(() => where))
    .sort()
}

interface Span {
  key: string
  from: number
  to: number
}

function beatSpans(entries: LogEntry[]): Span[] {
  const spans: Span[] = []
  for (const e of entries) {
    const key = String(e.data.key ?? '')
    if (e.kind === 'beat') spans.push({ key, from: e.t, to: Number.POSITIVE_INFINITY })
    if (e.kind === 'beatEnd') {
      // the latest still-open run of this beat
      for (let i = spans.length - 1; i >= 0; i--) {
        if (spans[i].key !== key || spans[i].to !== Number.POSITIVE_INFINITY) continue
        spans[i].to = e.t
        break
      }
    }
  }
  return spans
}

export function findings(entries: LogEntry[], options: Partial<Options> = {}): Finding[] {
  const { window, short, ignore } = { ...DEFAULTS, ...options }
  const shots = shotsOf(entries)
  const spans = beatSpans(entries)
  const beatsAt = (t: number) =>
    spans.filter((s) => s.from <= t + 1 && t <= s.to + 20).map((s) => s.key)
  const cards = new Set<string>()
  for (const shot of shots)
    for (const ids of Object.values(shot.cards))
      for (const id of ids) if (id !== 'back') cards.add(cardOf(id))

  const out: Finding[] = []
  for (const card of cards) {
    // where the card is, each time that changes
    const seq: { t: number; places: string[] }[] = []
    for (const shot of shots) {
      const places = placesOf(shot, card, ignore)
      if (seq.at(-1)?.places.join('&') !== places.join('&')) seq.push({ t: shot.t, places })
    }
    const found = (kind: Finding['kind'], start: number, end: number) =>
      out.push({
        kind,
        card,
        t: seq[start].t,
        lasted: seq[end].t - seq[start].t,
        before: seq[start - 1].places,
        during: seq[start].places,
        after: seq[end].places,
        beats: beatsAt(seq[start].t),
      })
    let i = 1
    while (i < seq.length) {
      const was = seq[i - 1].places.length
      const now = seq[i].places.length
      if (now !== was) {
        // fewer (or more) until it comes back to what it was — or it never does
        const fewer = now < was
        let j = i + 1
        while (j < seq.length && (fewer ? seq[j].places.length < was : seq[j].places.length > was))
          j++
        if (j < seq.length && seq[j].places.length === was && seq[j].t - seq[i].t <= window) {
          found(fewer ? 'gone' : 'twice', i, j)
          i = j + 1
          continue
        }
      } else if (i + 1 < seq.length && seq[i + 1].t - seq[i].t < short) {
        found('hop', i, i + 1)
      }
      i++
    }
  }
  out.push(...lyingFindings(shots, ignore, beatsAt))
  return out.sort((a, b) => a.t - b.t)
}

const ms = (t: number) => t.toFixed(0).padStart(7)
const at = (places: string[]) => places.join(' & ') || 'NOWHERE'

/** What the stand asked of the engine and what it answered — the context. */
export function actions(entries: LogEntry[]): string[] {
  return entries.flatMap((e) => {
    if (e.kind !== 'action') return []
    const { action, events } = e.data as {
      action: { type: string; player?: string; card?: string; choice?: unknown }
      events?: { type: string; reason?: string }[]
    }
    const choice = action.choice ? ` ${JSON.stringify(action.choice)}` : ''
    const answer = (events ?? []).map((x) => x.type + (x.reason ? `:${x.reason}` : '')).join(',')
    return [
      `${ms(e.t)} action ${action.type} ${action.player ?? ''} ${action.card ?? ''}${choice} -> ${answer}`,
    ]
  })
}

/** The whole reading: the actions, then every finding with where the card was around it. */
export function report(entries: LogEntry[], options: Partial<Options> = {}): string[] {
  const found = findings(entries, options)
  return [
    ...actions(entries),
    ...found.map((f) => {
      // a jump or a swap happens between two frames: it has no length of its own
      const lying = f.kind === 'layer' || f.kind === 'snap'
      const lasted = lying ? '' : `  ${f.lasted.toFixed(0)}ms`
      return (
        `!! ${ms(f.t)} ${f.kind.toUpperCase().padEnd(5)} ${f.card}${lasted}  beat=${f.beats.join(',') || '-'}\n` +
        `     before: ${at(f.before)}\n     during: ${at(f.during)}` +
        (lying && f.after.length === 0 ? '' : `\n     after:  ${at(f.after)}`)
      )
    }),
    ...(found.length > 0 ? [] : ['(nothing gone, doubled, hopping, re-stacked or jumping)']),
  ]
}

/**
 * THE DISCARD FRAME BY FRAME, between two moments: what the board publishes,
 * what it draws, and what the page shows in the heap and around it — the order
 * a heap lands in is read here, not guessed.
 */
export function heapTrace(entries: LogEntry[], from = 0, to = Number.POSITIVE_INFINITY): string[] {
  const lines: string[] = []
  let last = ''
  for (const e of entries) {
    if (e.t < from || e.t > to) continue
    if (e.kind === 'beat' || e.kind === 'beatEnd' || e.kind === 'beatPublish') {
      lines.push(`${ms(e.t)} ${e.kind} ${String(e.data.key ?? '')}`)
    } else if (e.kind === 'frame') {
      const decks = (e.data.decks ?? {}) as { discard?: unknown; discardTop?: unknown }
      lines.push(
        `${ms(e.t)} frame ${String(e.data.table)} discard ${String(decks.discard)} top ${String(decks.discardTop)}`,
      )
    } else if (e.kind === 'screen' && e.data.cards) {
      const cards = Object.entries(e.data.cards as Record<string, string[]>)
      const poses = e.data.poses as Record<string, Pose[]> | undefined
      // the heap as the eye sees it, bottom to top, each at its angle — or, in a
      // recording without poses, in the order the page holds it
      const heap = cards
        .filter(([where]) => where.startsWith('heapCard'))
        .flatMap(([where, c]) =>
          c.map((id, i) => ({ id, pose: poses?.[where]?.[i] as Pose | undefined })),
        )
        .sort((a, b) => (a.pose && b.pose ? a.pose[4] - b.pose[4] : 0))
        .map(({ id, pose }) => (pose ? `${id}@${pose[3]}°` : id))
      const around = cards
        .filter(([where]) => !where.startsWith('heapCard') && !/fan|zoom|preview/.test(where))
        .map(([where, c]) => `${where.split('<')[0]}:${c.join('+')}`)
        .join(' | ')
      // the whole heap: a re-stacking can happen anywhere in it, not only on top
      const line = `heap(${heap.length})[${heap.join(',')}]  ${around}`
      if (line !== last) lines.push(`${ms(e.t)} ${line}`)
      last = line
    }
  }
  return lines
}

/** ONE CARD'S WHOLE PATH: every place it was drawn in, each time that changed. */
export function cardTrail(
  entries: LogEntry[],
  card: string,
  from = 0,
  to = Number.POSITIVE_INFINITY,
): string[] {
  const lines: string[] = []
  let last: string | null = null
  for (const shot of shotsOf(entries)) {
    if (shot.t < from || shot.t > to) continue
    const where = at(placesOf(shot, cardOf(card), /$^/))
    if (where !== last) lines.push(`${ms(shot.t)} ${where}`)
    last = where
  }
  return lines
}

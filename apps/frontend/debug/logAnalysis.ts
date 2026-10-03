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
  kind: 'gone' | 'twice' | 'hop'
  card: string
  t: number
  lasted: number
  before: string[]
  during: string[]
  after: string[]
  /** the beats running at that moment */
  beats: string[]
}

interface Shot {
  t: number
  cards: Record<string, string[]>
}

const shotsOf = (entries: LogEntry[]): Shot[] =>
  entries.flatMap((e) =>
    e.kind === 'screen' && e.data.cards
      ? [{ t: e.t, cards: e.data.cards as Record<string, string[]> }]
      : [],
  )

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
    ...found.map(
      (f) =>
        `!! ${ms(f.t)} ${f.kind.toUpperCase().padEnd(5)} ${f.card}  ${f.lasted.toFixed(0)}ms  beat=${f.beats.join(',') || '-'}\n` +
        `     before: ${at(f.before)}\n     during: ${at(f.during)}\n     after:  ${at(f.after)}`,
    ),
    ...(found.length > 0 ? [] : ['(nothing gone, doubled or hopping)']),
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
      const heap = cards.filter(([where]) => where.startsWith('heapCard')).flatMap(([, c]) => c)
      const around = cards
        .filter(([where]) => !where.startsWith('heapCard') && !/fan|zoom|preview/.test(where))
        .map(([where, c]) => `${where.split('<')[0]}:${c.join('+')}`)
        .join(' | ')
      const line = `heap(${heap.length})[..${heap.slice(-4).join(',')}]  ${around}`
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

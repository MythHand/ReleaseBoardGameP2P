import { readScreen } from './screen'

// ONE CARD, ONE PLACE (#168). Watches the page through a play and checks the
// rule every hand-over between a card standing and a card in the air has to
// keep: in every state of the page a card is drawn in exactly one place. It
// knows no beat and no gesture — the same reading of the page the stand's
// recorder makes (`screen.ts`), taken after every change to it.
//
// A card is watched by its id, so the cards a test watches must be the only
// copy of themselves on the table the viewer sees.

export interface Violation {
  card: string
  rule: 'twice' | 'gone' | 'bounce' | 'back to the fan'
  // the places, in order: before, during, after
  path: string[]
}

// what a pointer over a card raises is a look at it, not the card
const looking = /zoom|preview/

function placesOf(cards: Record<string, string[]>, id: string): string[] {
  return Object.entries(cards)
    .filter(([where]) => !looking.test(where))
    .flatMap(([where, seen]) => seen.filter((c) => c.replace(/#.*$/, '') === id).map(() => where))
    .sort()
}

/**
 * Starts watching `ids`; `check()` stops and returns every break of the rule.
 * `mayComeHome` names the cards the play itself sends back to the fan.
 */
export function watchCards(ids: string[], mayComeHome: string[] = []) {
  // per card: the run of states it went through, one entry per change
  const runs = new Map<string, { places: string[]; samples: number }[]>(ids.map((id) => [id, []]))
  const sample = () => {
    const { cards } = readScreen()
    for (const id of ids) {
      const run = runs.get(id) ?? []
      const places = placesOf(cards, id)
      const last = run.at(-1)
      if (last && last.places.join('&') === places.join('&')) last.samples += 1
      else run.push({ places, samples: 1 })
    }
  }
  const observer = new MutationObserver(sample)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true })
  sample()

  const check = (): Violation[] => {
    observer.disconnect()
    sample()
    const found: Violation[] = []
    const Short = 3 // a state the page left again within this many readings
    for (const [card, run] of runs) {
      const text = (s: { places: string[] }) => s.places.join(' & ') || 'nowhere'
      run.forEach((s, i) => {
        if (s.places.length > 1)
          found.push({
            card,
            rule: 'twice',
            path: [run[i - 1], s, run[i + 1]].filter(Boolean).map(text),
          })
      })
      for (let i = 1; i + 1 < run.length; i++) {
        const [before, now, after] = [run[i - 1], run[i], run[i + 1]]
        if (now.samples > Short) continue
        if (now.places.length === 0 && before.places.length > 0 && after.places.length > 0)
          found.push({ card, rule: 'gone', path: [before, now, after].map(text) })
        else if (now.places.length > 0 && text(before) === text(after))
          found.push({ card, rule: 'bounce', path: [before, now, after].map(text) })
      }
      if (!mayComeHome.includes(card)) {
        const left = run.findIndex(
          (s, i) =>
            i > 0 &&
            run[i - 1].places.some((p) => p.includes('fan')) &&
            !s.places.some((p) => p.includes('fan')),
        )
        const back =
          left < 0
            ? -1
            : run.findIndex((s, i) => i > left && s.places.some((p) => p.includes('fan')))
        if (back > 0)
          found.push({
            card,
            rule: 'back to the fan',
            path: [run[back - 1], run[back], run[back + 1]].filter(Boolean).map(text),
          })
      }
    }
    return found
  }
  // every state a card went through, with how many readings it lasted — what a
  // report shows when a break of the rule needs its whole road
  const trail = (card: string) =>
    (runs.get(card) ?? []).map((s) => `${s.places.join(' & ') || 'nowhere'} ×${s.samples}`)
  return { check, trail }
}

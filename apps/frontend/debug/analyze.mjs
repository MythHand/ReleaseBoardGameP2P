// THE STAND'S RECORDINGS, READ BACK (#168). Only the reading of files and the
// printing live here; what is found, and how, is `logAnalysis.ts` — typed and
// tested with the rest of the stand.
//
//   pnpm --filter @release/web debug:log [name]
//       every card that went missing, stood twice, or hopped — and, in a
//       recording that keeps poses, every two cards at rest that swapped which
//       lies on top and every card at rest that jumped — in the newest
//       recording, or in every recording whose file name contains `name`
//   pnpm --filter @release/web debug:log <name> --heap <from> <to>
//       the discard frame by frame between two moments (ms of the recording),
//       bottom to top as the eye sees it, each card at its angle
//   pnpm --filter @release/web debug:log <name> --card <id> [<from> <to>]
//       one card's whole path: every place it was drawn in
//
//   --window <ms>   how long a card may be gone or doubled and still count as
//                   a slip rather than the game moving on (2000 by default)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { cardTrail, heapTrace, report } from './logAnalysis.ts'

const dir = new URL('./logs/', import.meta.url)
const args = process.argv.slice(2)
const flag = (option) => {
  const i = args.indexOf(option)
  return i < 0 ? null : args.slice(i + 1)
}
// a command-line tool prints to its own output
const print = (line) => process.stdout.write(`${line}\n`)
const numbers = (list) => (list ?? []).filter((a) => /^\d+(\.\d+)?$/.test(a)).map(Number)

const name = args[0] && !args[0].startsWith('--') ? args[0] : null
// oldest first, by when the stand saved it — a name sorts by its scene first
const all = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, at: statSync(new URL(f, dir)).mtimeMs }))
  .sort((a, b) => a.at - b.at)
  .map(({ f }) => f)
const files = name ? all.filter((f) => f.includes(name)) : all.slice(-1)
if (files.length === 0) {
  console.error(name ? `no recording matches "${name}"` : 'no recordings in debug/logs')
  process.exit(1)
}

const window = numbers(flag('--window'))[0]
for (const file of files) {
  const { entries } = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  print(`\n===== ${file}  (${entries.length} lines)`)
  // recorded before every line carried its `data`: there is nothing to read
  if (!entries.every((e) => e.data)) {
    print('  (an older recording, from before the current format — skipped)')
    continue
  }
  const heap = flag('--heap')
  const card = flag('--card')
  const lines = heap
    ? heapTrace(entries, ...numbers(heap))
    : card
      ? cardTrail(entries, card[0], ...numbers(card.slice(1)))
      : report(entries, window ? { window } : {})
  for (const line of lines) print(`  ${line}`)
}

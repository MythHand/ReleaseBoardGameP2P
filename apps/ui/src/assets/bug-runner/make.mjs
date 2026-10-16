// Builds the Bug Runner images from the game's own pixel art: the four avatars
// and the results screen's achievement. The sprites come from
// blocks/BugRunner/sprites.ts and the colours from design/tokens.css, the same
// tokens the runner reads at play — so nothing here restates either.
//
//   node apps/ui/src/assets/bug-runner/make.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import {
  BUG_RUN_A,
  BUG_SIT,
  HOTFIX,
  MONITOR,
  SERVER,
  SERVER_BITES,
} from '../../blocks/BugRunner/sprites.ts'

const HERE = new URL('.', import.meta.url)
const tokens = readFileSync(new URL('../../design/tokens.css', HERE), 'utf8')
const token = (name) => {
  const found = tokens.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!found) throw new Error(`missing token ${name}`)
  return found[1].trim()
}
const colours = (accent) => ({ a: token(accent), d: token('--surface-1') })

// A row's pixels of one kind, joined into runs, so a line is one rect.
function rects(sprite, left, top, palette) {
  const out = []
  sprite.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      const px = row[c]
      let end = c + 1
      while (end < row.length && row[end] === px) end += 1
      if (px !== '.') {
        out.push(
          `<rect x="${left + c}" y="${top + r}" width="${end - c}" height="1" fill="${palette[px]}"/>`,
        )
      }
      c = end
    }
  })
  return out
}

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">\n${body.join('\n')}\n</svg>\n`

// --- avatars ---------------------------------------------------------------

// One square for all four, so a pixel is the same size in every one of them:
// the widest sprite (the bug, 16) and the tallest (the server, 14) both fit
// with air around them.
const SIDE = 20

// The runner's palette (BugRunner.tsx `readPalette`): the accent per sprite,
// one dark body for all.
const AVATARS = [
  { file: 'avatar-bug.svg', sprite: BUG_SIT, accent: '--cat-attack' },
  { file: 'avatar-server.svg', sprite: SERVER, accent: '--cat-release' },
  { file: 'avatar-hotfix.svg', sprite: HOTFIX, accent: '--cat-defense' },
  { file: 'avatar-monitoring.svg', sprite: MONITOR, accent: '--cat-protection' },
]

for (const { file, sprite, accent } of AVATARS) {
  const left = Math.floor((SIDE - sprite[0].length) / 2)
  const top = Math.floor((SIDE - sprite.length) / 2)
  writeFileSync(new URL(file, HERE), svg(SIDE, SIDE, rects(sprite, left, top, colours(accent))))
}

// The black the avatars stand on — their background layer.
writeFileSync(
  new URL('avatar-background.svg', HERE),
  svg(SIDE, SIDE, [`<rect width="${SIDE}" height="${SIDE}" fill="${token('--bg')}"/>`]),
)

// --- achievement -------------------------------------------------------------

// The middle of a meal, as the runner draws it: the world stands still, the bug
// stands on the ground in its running frame, and the server it ran into has had
// two bites taken. A server is reached once its left edge passes under the
// bug's front (game.ts `reaches`) — three pixels in, on the frame it stops — so
// it stands there; the bug is drawn over it, as in the game (BugRunner.tsx
// `draw`).
const MEAL = SERVER_BITES[2]
const bugW = BUG_RUN_A[0].length
const serverX = bugW - 3
const w = serverX + MEAL[0].length
const h = Math.max(BUG_RUN_A.length, MEAL.length)
writeFileSync(
  new URL('achievement.svg', HERE),
  svg(w, h, [
    ...rects(MEAL, serverX, h - MEAL.length, colours('--cat-release')),
    ...rects(BUG_RUN_A, 0, h - BUG_RUN_A.length, colours('--cat-attack')),
  ]),
)

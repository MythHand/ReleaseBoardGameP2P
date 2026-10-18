import { BUG_RUN_A, HOTFIX, MONITOR, SERVER, SERVER_BITES, SUDO, sizeOf } from './sprites'

// The runner's rules, apart from any drawing: the browser's dinosaur game with
// the Bug as its hero. Everything is measured in world units — one pixel of the
// pixel art — and seconds; heights are above the ground, x from the left edge.

export type Phase = 'idle' | 'running' | 'over'
// a server is not an obstacle to beat but food: the bug runs into it and eats it;
// a sudo card is taken on the run, for one hit the bug lives through
export type Kind = 'hotfix' | 'monitor' | 'server' | 'sudo'

export interface Obstacle {
  kind: Kind
  x: number
  y: number
  // how many bites have been taken out of a server
  bites?: number
  // the run's opening server — a snack outside the server marks
  starter?: boolean
}

// the last payment, a new object each time — the block tells a fresh one by it
export interface Paid {
  kind: Kind
  points: number
}

// an obstacle the protection broke: its pieces fly apart where it stood, and go
// with the world as it runs
export interface Wreck {
  kind: Kind
  x: number
  y: number
  // seconds since it broke
  age: number
}

export interface Game {
  phase: Phase
  // how many units the world is wide — the block's own width
  width: number
  // seconds into the current run
  t: number
  // the bug's height above the ground, and its vertical speed
  y: number
  vy: number
  obstacles: Obstacle[]
  // how fast the world runs at the bug, units per second, and the pace the run
  // is set to — the speed it would have without the meals; the difficulty
  // follows the pace, and a meal only drops the speed below it for a breather
  speed: number
  pace: number
  // units left to travel before the next obstacle appears
  gap: number
  distance: number
  // points earned for the obstacles passed and the servers eaten, on top of
  // the distance, and the last of those payments
  bonus: number
  paid: Paid | null
  // whether the opening server is still to come, how many servers this run has
  // brought at its marks, and — while the bug eats one — how many seconds into
  // the meal it is; the world stands still for it
  starter: boolean
  served: number
  meal: number | null
  // the score the next sudo card comes at — drawn on the run's first frame,
  // and none while a card is on the road or its protection is held; whether
  // the bug holds one; how many seconds into the blink of taking or spending
  // it; and the obstacle it last broke, while its pieces fly
  sudoAt: number | null
  shielded: boolean
  flash: number | null
  wreck: Wreck | null
  best: number
  // when the last run ended (ms, the caller's clock) — a click right on the
  // crash must not start the next run by accident
  overAt: number
}

// The world is this many units tall: the ground strip, the bug, and the room
// above it that a jump needs.
export const WORLD_H = 28
export const GROUND = 2
// how far in from each side the world fades out — obstacles come in out of the
// right fade and leave into the left one — and where the bug stands, clear of
// the left one. Both in world units, so they hold together at any scale.
export const FADE = 16
export const BUG_X = FADE + 6

export const BUG = sizeOf(BUG_RUN_A)
const SIZE: Record<Kind, { w: number; h: number }> = {
  hotfix: sizeOf(HOTFIX),
  monitor: sizeOf(MONITOR),
  server: sizeOf(SERVER),
  sudo: sizeOf(SUDO),
}

// A jump peaks at about 15 units, over a hotfix with room to spare, and lasts
// 0.64 s: v²/2g for the height, 2v/g for the time. Both have a ceiling: past
// ~16 units the bug leaves the top of the world, past ~0.75 s a jump outlasts
// the shortest gap `nextGap` allows.
const GRAVITY = 300
const JUMP = 96
// the monitors fly in a lane a standing bug passes under and a jumping one
// runs into — the dinosaur's high bird: the answer to it is not to jump
export const MONITOR_Y = 12
// a sudo card flies between the two lanes, its middle where the hotfix's top
// and the monitor's bottom meet — taken at any height all the same
export const SUDO_Y = 7
const SPEED_START = 64
const SPEED_MAX = 150
const SPEED_GAIN = 2.5
// how fast a bug slowed by a meal catches up with the pace: two to three
// seconds for the drop a meal costs, the largest one included
const CATCH_UP = 12
// monitors join once the run has warmed up, and then as one obstacle in three
const MONITOR_FROM = 6
const MONITOR_SHARE = 0.34
// a tab coming back from the background must not teleport the world
const MAX_DT = 0.05
const RESTART_LOCK_MS = 400

// An obstacle that runs out behind the bug has been beaten — a hotfix can only
// be jumped, a monitor only run under — and pays on top of the distance.
export const BONUS: Record<'hotfix' | 'monitor', number> = { hotfix: 40, monitor: 20 }

// The n-th server comes once the score reaches 350, 1050, 2100, 3500… — the
// step between two grows by 350 each time — and pays 120, 180, 240…, which
// never reaches the next step, so a meal cannot bring the next server early.
const SERVER_STEP = 350
export const serverAt = (n: number) => (SERVER_STEP * n * (n + 1)) / 2
export const serverBonus = (n: number) => 120 + 60 * (n - 1)
// Every run opens with a server of its own, before anything else on the road:
// eaten the same way, for a small bonus and at no cost to the speed. It is not
// one of the marks, and nothing waits behind it.
export const STARTER_BONUS = 10
// a server goes a bite per frame of its art and one more that leaves nothing —
// 0.92 s for the four frames — and drops the bug by this share of the speed it
// has gained over the start, until it catches up with the pace
const BITE = 0.23
const BITES = SERVER_BITES.length
const SPEED_LOSS = 0.3
// The first sudo card comes at a score each run draws between 600 and 700; the
// next, 1200 points after its protection is spent. One at a time: none comes
// while a card is on the road or the bug holds one.
const SUDO_FIRST = 600
const SUDO_SPREAD = 100
const SUDO_AGAIN = 1200
// taking or spending the protection blinks the bug between its two colours for
// this long, a colour per BLINK; a broken obstacle's pieces fly for WRECK_S
export const FLASH_S = 0.6
export const BLINK = 0.1
export const WRECK_S = 0.4

export const scoreOf = (g: Game) => Math.floor(g.distance / 10) + g.bonus

export function newGame(width: number, best = 0): Game {
  return {
    phase: 'idle',
    width,
    t: 0,
    y: 0,
    vy: 0,
    obstacles: [],
    speed: SPEED_START,
    pace: SPEED_START,
    gap: 20,
    distance: 0,
    bonus: 0,
    paid: null,
    starter: true,
    served: 0,
    meal: null,
    sudoAt: null,
    shielded: false,
    flash: null,
    wreck: null,
    best,
    overAt: 0,
  }
}

export const resize = (g: Game, width: number): Game => ({ ...g, width })

// The one input: a press. It wakes a sitting bug, jumps a running one that is
// on the ground and not eating, and starts a new run once the last one is over.
export function press(g: Game, now: number): Game {
  if (g.phase === 'idle') return { ...g, phase: 'running', vy: JUMP }
  if (g.phase === 'running') return g.y === 0 && g.meal === null ? { ...g, vy: JUMP } : g
  if (now - g.overAt < RESTART_LOCK_MS) return g
  return { ...newGame(g.width, g.best), phase: 'running', vy: JUMP }
}

// The distance to the next obstacle: never shorter than a jump covers at this
// speed, so every gap can be cleared.
const nextGap = (speed: number, rng: () => number) => speed * 0.75 + 16 + rng() * 90

// THE MOST A RUN CAN SCORE IN `seconds`, read off the rules of this file rather
// than measured. The host checks a reported score against it, timing the run on
// its own clock, so a number typed into devtools — or any score no run of that
// length could reach — is turned away. A ceiling, never a prediction: the bug
// keeps the pace the whole time and never stops for a meal, every gap is the
// shortest one, and every obstacle pays the larger bonus.
export function maxScoreWithin(seconds: number): number {
  const t = Math.max(0, seconds)
  // the pace climbs from SPEED_START at SPEED_GAIN until SPEED_MAX, and the bug
  // never runs faster than the pace
  const climb = (SPEED_MAX - SPEED_START) / SPEED_GAIN
  const rising = Math.min(t, climb)
  const distance =
    SPEED_START * rising + (SPEED_GAIN * rising * rising) / 2 + SPEED_MAX * Math.max(0, t - climb)
  const obstacles = Math.floor(distance / nextGap(SPEED_START, () => 0)) + 1
  const plain = Math.floor(distance / 10) + obstacles * BONUS.hotfix + STARTER_BONUS
  // a server waits at every mark the score reaches, and what it pays can bring
  // the next mark within reach — so the marks are counted until they settle
  let score = plain
  for (;;) {
    let served = 0
    let pay = 0
    while (serverAt(served + 1) <= score) {
      served += 1
      pay += serverBonus(served)
    }
    if (plain + pay === score) return score
    score = plain + pay
  }
}

// A server and a sudo card are met, not dodged: the bug's front reaching one is
// enough, at any height — a bug in the air eats a server too, and lands while
// it does, and takes a card it runs over.
const meets = (o: Obstacle) => o.x + 1 < BUG_X + BUG.w - 1
const reaches = (o: Obstacle) => o.kind === 'server' && meets(o)
const takes = (o: Obstacle) => o.kind === 'sudo' && meets(o)

function hits(y: number, o: Obstacle): boolean {
  if (o.kind === 'server' || o.kind === 'sudo') return false
  const s = SIZE[o.kind]
  // a pixel of slack on every side: the art's edges are glow, not body
  return (
    BUG_X + 1 < o.x + s.w - 1 &&
    o.x + 1 < BUG_X + BUG.w - 1 &&
    y + 1 < o.y + s.h - 1 &&
    o.y + 1 < y + BUG.h - 1
  )
}

// A meal: the world stands still while the bites are taken, then the server is
// gone and paid for. A server at a mark sends the bug on a little slower for a
// breather — never back to the start — and lets the road fill again; the
// opening one does neither.
function eat(g: Game, meal: number, rng: () => number): Game {
  // the first server on the road is the one the bug has run into
  const at = g.obstacles.findIndex((o) => o.kind === 'server')
  const server = g.obstacles[at]
  if (!server) return { ...g, meal: null }
  const bites = Math.floor(meal / BITE)
  if (bites < BITES) {
    const obstacles = g.obstacles.map((o, i) => (i === at ? { ...o, bites } : o))
    return { ...g, meal, obstacles }
  }
  const obstacles = g.obstacles.filter((_, i) => i !== at)
  if (server.starter) {
    const points = STARTER_BONUS
    return {
      ...g,
      meal: null,
      obstacles,
      bonus: g.bonus + points,
      paid: { kind: 'server', points },
    }
  }
  const points = serverBonus(g.served)
  const speed = SPEED_START + (g.speed - SPEED_START) * (1 - SPEED_LOSS)
  return {
    ...g,
    meal: null,
    speed,
    obstacles,
    bonus: g.bonus + points,
    paid: { kind: 'server', points },
    gap: nextGap(speed, rng),
  }
}

export function step(g: Game, dt: number, rng: () => number, now: number): Game {
  if (g.phase !== 'running') return g
  const d = Math.min(dt, MAX_DT)
  const t = g.t + d

  let vy = g.vy - GRAVITY * d
  let y = g.y + vy * d
  if (y <= 0) {
    y = 0
    vy = 0
  }

  // the blink and a wreck's pieces keep their own time, through a meal too
  const aged = g.flash === null ? null : g.flash + d
  let flash = aged !== null && aged < FLASH_S ? aged : null
  const wreckAge = (shift: number): Wreck | null =>
    g.wreck && g.wreck.age + d < WRECK_S
      ? { ...g.wreck, x: g.wreck.x - shift, age: g.wreck.age + d }
      : null
  if (g.meal !== null) return eat({ ...g, t, y, vy, flash, wreck: wreckAge(0) }, g.meal + d, rng)
  const pace = Math.min(SPEED_MAX, g.pace + SPEED_GAIN * d)
  // off a meal the bug is below the pace, and catches up with it; otherwise the
  // two are one
  const speed = Math.min(pace, g.speed + CATCH_UP * d)
  const wreck = wreckAge(speed * d)
  let sudoAt = g.sudoAt ?? SUDO_FIRST + Math.floor(rng() * SUDO_SPREAD)

  // what has run out past the left edge is gone — it left through the fade
  let obstacles = g.obstacles
    .map((o) => ({ ...o, x: o.x - speed * d }))
    .filter((o) => o.x + SIZE[o.kind].w > 0)
  // paid once, on the frame its back edge runs past the bug's
  let bonus = g.bonus
  let paid = g.paid
  for (const o of g.obstacles) {
    if (o.kind === 'server' || o.kind === 'sudo') continue
    const back = o.x + SIZE[o.kind].w
    if (back > BUG_X && back - speed * d <= BUG_X) {
      bonus += BONUS[o.kind]
      paid = { kind: o.kind, points: BONUS[o.kind] }
    }
  }
  let gap = g.gap - speed * d
  let starter = g.starter
  let served = g.served
  if (gap <= 0 && starter) {
    // the opening server takes the first slot; the road behind it fills as usual
    obstacles.push({ kind: 'server', x: g.width, y: 0, bites: 0, starter: true })
    starter = false
    gap = nextGap(speed, rng)
  } else if (gap <= 0 && scoreOf(g) >= serverAt(served + 1)) {
    // the server takes the next obstacle's place, and nothing follows it onto
    // the road until it is eaten — the meal is never interrupted
    obstacles.push({ kind: 'server', x: g.width, y: 0, bites: 0 })
    served += 1
    gap = Number.POSITIVE_INFINITY
  } else if (gap <= 0 && scoreOf(g) >= sudoAt) {
    // a sudo card takes the next obstacle's place; the road behind it fills as
    // usual, and no other card comes until this one's protection is spent
    obstacles.push({ kind: 'sudo', x: g.width, y: SUDO_Y })
    sudoAt = Number.POSITIVE_INFINITY
    gap = nextGap(speed, rng)
  } else if (gap <= 0) {
    const kind: Kind = t >= MONITOR_FROM && rng() < MONITOR_SHARE ? 'monitor' : 'hotfix'
    // in at the right edge, out of the fade
    obstacles.push({ kind, x: g.width, y: kind === 'monitor' ? MONITOR_Y : 0 })
    gap = nextGap(speed, rng)
  }

  // a card run over is taken on the run: the bug blinks into its protection
  let shielded = g.shielded
  const card = obstacles.find(takes)
  if (card) {
    obstacles = obstacles.filter((o) => o !== card)
    shielded = true
    flash = 0
  }

  const next: Game = {
    ...g,
    t,
    y,
    vy,
    obstacles,
    speed,
    pace,
    gap,
    distance: g.distance + speed * d,
    bonus,
    paid,
    starter,
    served,
    sudoAt,
    shielded,
    flash,
    wreck,
  }
  const hit = obstacles.find((o) => hits(y, o))
  if (hit && !shielded) {
    return { ...next, phase: 'over', best: Math.max(g.best, scoreOf(next)), overAt: now }
  }
  if (hit) {
    // the protection takes the hit: the obstacle breaks and pays nothing, the
    // bug blinks back to itself, and the next card is set 1200 points on
    return {
      ...next,
      obstacles: obstacles.filter((o) => o !== hit),
      shielded: false,
      flash: 0,
      wreck: { kind: hit.kind, x: hit.x, y: hit.y, age: 0 },
      sudoAt: scoreOf(next) + SUDO_AGAIN,
    }
  }
  return obstacles.some(reaches) ? { ...next, meal: 0 } : next
}

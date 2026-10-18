import { BUG_RUN_A, DUCK, HOTFIX, MONITOR, SERVER, SERVER_BITES, SUDO, sizeOf } from './sprites'

// The runner's rules, apart from any drawing: the browser's dinosaur game with
// the Bug as its hero. Everything is measured in world units — one pixel of the
// pixel art — and seconds; heights are above the ground, x from the left edge.

export type Phase = 'idle' | 'running' | 'over'
// What the bug must get past — the defence's side of the game: a hotfix to
// jump, a monitor to run under, a roaming monitor that comes in on either lane,
// two hotfixes back to back, and a rubber ducky that runs at the bug.
export type Beatable = 'hotfix' | 'monitor' | 'roaming' | 'double' | 'duck'
// a server is not an obstacle to beat but food: the bug runs into it and eats it;
// a sudo card is taken on the run, for one hit the bug lives through
export type Kind = Beatable | 'server' | 'sudo'

export interface Obstacle {
  kind: Kind
  x: number
  y: number
  // how many bites have been taken out of a server
  bites?: number
  // the run's opening server — a snack outside the server marks
  starter?: boolean
  // a roaming monitor's lane, where on the road it settles into it, and how
  // much road one swing of it takes
  lane?: 'low' | 'high'
  settle?: number
  wave?: number
  // how far the second hotfix of a pair overlaps the first
  overlap?: number
}

// the last payment, a new object each time — the block tells a fresh one by it
export interface Paid {
  kind: Kind
  points: number
}

// an obstacle the protection broke: its pieces fly apart from its middle, and
// go with the world as it runs
export interface Wreck {
  kind: Kind
  x: number
  y: number
  w: number
  h: number
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
  // it; and the obstacle it last broke, while its pieces fly. How many
  // protections the run has spent sets how far off the next card is.
  sudoAt: number | null
  shielded: boolean
  spent: number
  // the score the run's early rubber ducky comes at — drawn on its first frame,
  // and none once it has come
  duckAt: number | null
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
  roaming: sizeOf(MONITOR),
  // the widest a pair gets: two hotfixes that do not overlap
  double: { w: 2 * sizeOf(HOTFIX).w, h: sizeOf(HOTFIX).h },
  duck: sizeOf(DUCK),
  server: sizeOf(SERVER),
  sudo: sizeOf(SUDO),
}
// how wide this obstacle is on the road — a pair, by how far its two overlap
export const widthOf = (o: Obstacle) =>
  o.kind === 'double' ? SIZE.double.w - (o.overlap ?? 0) : SIZE[o.kind].w
export const heightOf = (o: Obstacle) => SIZE[o.kind].h

// A jump peaks at about 15 units, over a hotfix with room to spare, and lasts
// 0.64 s at the start's speed: v²/2g for the height, 2v/g for the time. Both
// have a ceiling: past ~16 units the bug leaves the top of the world, past
// ~0.75 s a jump outlasts the shortest gap `nextGap` allows. It quickens with
// the world — see `jumpScale` — and the shortest gap shortens with it.
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

// THE JUMP QUICKENS WITH THE WORLD, so a faster run is a harder one. A jump of
// one length in time would cross a hotfix with more and more to spare as the
// world sped up — at full speed, three times the start's. So the jump keeps its
// height and gets shorter in time: of the spare time the speed would add, it
// keeps SPARE_KEPT — about a tenth of a second at the start, two at full speed.
// Keeping none held the start's tenth all the way and made it too hard (owner).
// The bug is over a hotfix while above the height `hits` clears it at, and has
// to stay there for the road it overlaps one on — both with `hits`' slack.
const CLEAR = SIZE.hotfix.h - 2
const SPAN = BUG.w + SIZE.hotfix.w - 4
// how long the start's jump stays above that height: 2√(v² − 2gh)/g
const ABOVE = (2 * Math.sqrt(JUMP * JUMP - 2 * GRAVITY * CLEAR)) / GRAVITY
const SPARE = ABOVE - SPAN / SPEED_START
const SPARE_KEPT = 0.5
// the spare time over a hotfix a jump leaves at this speed
const spareAt = (speed: number) => SPARE + SPARE_KEPT * (SPAN / SPEED_START - SPAN / speed)
// how many times quicker a jump is at this speed: its time ÷ this, its take-off
// speed × this, its gravity × this² — the height stays
export const jumpScale = (speed: number) => ABOVE / (spareAt(speed) + SPAN / speed)
// how fast a bug slowed by a meal catches up with the pace: two to three
// seconds for the drop a meal costs, the largest one included
const CATCH_UP = 12
// monitors join once the run has warmed up, and then as one obstacle in three
const MONITOR_FROM = 6
const MONITOR_SHARE = 0.34
// a tab coming back from the background must not teleport the world
const MAX_DT = 0.05
const RESTART_LOCK_MS = 400

// ROAMING MONITORS join at 1000 points, as 5% of the obstacles, and grow to 30%
// by 3000 — taking half their share from the monitors and half from the
// hotfixes. One swings up and down while far off, and settles into the lane it
// was given — low, to be jumped, or high, to be run under — for the last half
// of the road, so the bug can read which in time (owner: a third was too late).
const ROAMING_FROM = 1000
const ROAMING_FULL = 3000
const ROAMING_MIN = 0.05
const ROAMING_MAX = 0.3
export const roamingShare = (score: number) =>
  score < ROAMING_FROM
    ? 0
    : Math.min(
        ROAMING_MAX,
        ROAMING_MIN +
          ((ROAMING_MAX - ROAMING_MIN) * (score - ROAMING_FROM)) / (ROAMING_FULL - ROAMING_FROM),
      )
// one swing, top to bottom and back, takes this long at the speed it came in
// at — a time, not a length of road, so it swings as slowly at full speed as
// earlier on (owner: over 60 units of road it shook at full speed)
const ROAMING_SWING_S = 0.8
// A PAIR of hotfixes, back to back or overlapping by up to DOUBLE_OVERLAP,
// comes only once the bug runs faster than DOUBLE_FROM — slower, the jump
// cannot clear it with the spare a single hotfix leaves at the start — as one
// hotfix in DOUBLE_SHARE. It is one obstacle and pays as one.
export const DOUBLE_FROM = 138
const DOUBLE_SHARE = 0.2
export const DOUBLE_OVERLAP = 4
// A RUBBER DUCKY joins at 1500 points as one obstacle in DUCK_SHARE, taken from
// the hotfixes. It runs at the bug, DUCK_RUSH faster than the world, so it
// comes sooner than its distance says; it is only let onto the road where it
// cannot catch up with the obstacle ahead of it to closer than a jump.
const DUCK_FROM = 1500
const DUCK_SHARE = 0.15
// One rubber ducky comes early, in every run, between 300 and 1000 points
// (owner): at a score the run draws between 300 and 800. It takes the next
// slot from there that is an obstacle's, and where it would catch up with the
// one ahead it does not give way to a hotfix but waits for room — so it always
// comes. What goes first can carry the score on past its mark meanwhile — a
// server's slot, its meal and its 120, a sudo card, the obstacles passed while
// it waits — by up to ~280 points in 200 runs measured; drawn up to 900, the
// latest came at 981, so the mark stops at 800 to leave the window room.
const FIRST_DUCK_FROM = 300
const FIRST_DUCK_SPREAD = 500
export const DUCK_RUSH = 0.3
// how fast an obstacle comes at the bug, as a share of the world's speed
export const rushOf = (o: Obstacle) => (o.kind === 'duck' ? 1 + DUCK_RUSH : 1)

// Where a roaming monitor flies at its point of the road: on its lane from the
// settling point on; before it, on a wave between the two lanes that comes into
// its lane at the settling point, and comes in flat — no jolt as it settles.
export function roamingY(o: Obstacle): number {
  const lane = o.lane === 'high' ? MONITOR_Y : 0
  const settle = o.settle ?? 0
  if (o.x <= settle) return lane
  const wave = o.wave ?? SPEED_MAX * ROAMING_SWING_S
  const swing = Math.cos((2 * Math.PI * (o.x - settle)) / wave)
  const mid = MONITOR_Y / 2
  return o.lane === 'high' ? mid + mid * swing : mid - mid * swing
}

// An obstacle that runs out behind the bug has been beaten — a hotfix can only
// be jumped, a monitor only run under — and pays on top of the distance.
export const BONUS: Record<Beatable, number> = {
  hotfix: 40,
  monitor: 20,
  roaming: 50,
  double: 100,
  duck: 50,
}

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
// next, 1200 points after its protection is spent, and each one after that 600
// further than the last: 1200, 1800, 2400… One at a time: none comes while a
// card is on the road or the bug holds one.
const SUDO_FIRST = 600
const SUDO_SPREAD = 100
const SUDO_AGAIN = 1200
const SUDO_STEP = 600
export const sudoAgain = (spent: number) => SUDO_AGAIN + SUDO_STEP * (spent - 1)
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
    spent: 0,
    duckAt: null,
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
  if (g.phase === 'running') {
    return g.y === 0 && g.meal === null ? { ...g, vy: JUMP * jumpScale(g.speed) } : g
  }
  if (now - g.overAt < RESTART_LOCK_MS) return g
  return { ...newGame(g.width, g.best), phase: 'running', vy: JUMP }
}

// The distance to the next obstacle: never shorter than the jump covers at this
// speed — the quickened jump, so a faster road can be fuller — and so every gap
// can be cleared, and up to GAP_SPREAD longer. The extra is mostly short and now
// and then long — obstacles come in bunches with breathers between, not on a
// beat — and as long on average as an even spread of 90 would be. A spread in
// time rather than road emptied the road at speed (owner: one obstacle a screen
// past 800 points). The shortest gap grows with the speed, so the start's is
// the shortest of all: the host's ceiling counts on it.
const GAP_SPREAD = 135
export const nextGap = (speed: number, rng: () => number) =>
  (speed * 0.75) / jumpScale(speed) + 16 + GAP_SPREAD * rng() ** 2

// THE MOST A RUN CAN SCORE IN `seconds`, read off the rules of this file rather
// than measured. The host checks a reported score against it, timing the run on
// its own clock, so a number typed into devtools — or any score no run of that
// length could reach — is turned away. A ceiling, never a prediction: the bug
// keeps the pace the whole time and never stops for a meal, every gap is the
// shortest one, and every obstacle pays the most one can — a pair's 100 once
// the pace is past DOUBLE_FROM, the most of the rest before.
export function maxScoreWithin(seconds: number): number {
  const t = Math.max(0, seconds)
  // the pace climbs from SPEED_START at SPEED_GAIN until SPEED_MAX, and the bug
  // never runs faster than the pace
  const climb = (SPEED_MAX - SPEED_START) / SPEED_GAIN
  const distanceAt = (s: number) => {
    const rising = Math.min(s, climb)
    return (
      SPEED_START * rising + (SPEED_GAIN * rising * rising) / 2 + SPEED_MAX * Math.max(0, s - climb)
    )
  }
  const distance = distanceAt(t)
  const shortest = nextGap(SPEED_START, () => 0)
  // no pair comes before the pace — and so the bug — is past DOUBLE_FROM
  const beforePairs = distanceAt(Math.min(t, (DOUBLE_FROM - SPEED_START) / SPEED_GAIN))
  const early = Math.floor(beforePairs / shortest) + 1
  const late = distance > beforePairs ? Math.floor((distance - beforePairs) / shortest) + 1 : 0
  const { double, ...rest } = BONUS
  const plain =
    Math.floor(distance / 10) +
    early * Math.max(...Object.values(rest)) +
    late * double +
    STARTER_BONUS
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
  // a pixel of slack on every side: the art's edges are glow, not body
  return (
    BUG_X + 1 < o.x + widthOf(o) - 1 &&
    o.x + 1 < BUG_X + BUG.w - 1 &&
    y + 1 < o.y + heightOf(o) - 1 &&
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

// THE NEXT OBSTACLE, for a slot that is not a server's or a sudo card's. Its
// kind by the shares the score has reached — roaming monitors from 1000, rubber
// duckies from 1500, monitors once the run has warmed up, hotfixes the rest —
// and a hotfix becomes a pair now and then once the bug is fast enough.
function nextObstacle(
  g: Game,
  road: Obstacle[],
  t: number,
  speed: number,
  rng: () => number,
): Obstacle {
  const score = scoreOf(g)
  const roaming = roamingShare(score)
  const monitor = t >= MONITOR_FROM ? MONITOR_SHARE - roaming / 2 : 0
  const duck = score >= DUCK_FROM ? DUCK_SHARE : 0
  const roll = rng()
  const x = g.width
  if (roll < roaming) {
    // settles for the last half of the road it has to run
    const o: Obstacle = {
      kind: 'roaming',
      x,
      y: 0,
      lane: rng() < 0.5 ? 'low' : 'high',
      settle: BUG_X + (x - BUG_X) / 2,
      wave: speed * ROAMING_SWING_S,
    }
    return { ...o, y: roamingY(o) }
  }
  if (roll < roaming + monitor) return { kind: 'monitor', x, y: MONITOR_Y }
  if (roll < roaming + monitor + duck && duckHasRoom(road, x, speed)) {
    return { kind: 'duck', x, y: 0 }
  }
  if (speed > DOUBLE_FROM && rng() < DOUBLE_SHARE) {
    return { kind: 'double', x, y: 0, overlap: rng() * DOUBLE_OVERLAP }
  }
  return { kind: 'hotfix', x, y: 0 }
}

// Whether a rubber ducky let in at `x` keeps a jump's length behind the
// obstacle ahead of it all the way to the bug: it gains on that one by its rush
// for every unit the world runs until that one is past.
function duckHasRoom(road: Obstacle[], x: number, speed: number): boolean {
  const ahead = road.filter((o) => o.kind !== 'server' && o.kind !== 'sudo').at(-1)
  if (!ahead || ahead.x <= BUG_X) return true
  const gains = 1 + DUCK_RUSH - rushOf(ahead)
  const left = x - (ahead.x + widthOf(ahead)) - gains * (ahead.x - BUG_X)
  return left >= nextGap(speed, () => 0) - SIZE.hotfix.w
}

export function step(g: Game, dt: number, rng: () => number, now: number): Game {
  if (g.phase !== 'running') return g
  const d = Math.min(dt, MAX_DT)
  const t = g.t + d

  const lift = jumpScale(g.speed)
  let vy = g.vy - GRAVITY * lift * lift * d
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
  let duckAt = g.duckAt ?? FIRST_DUCK_FROM + Math.floor(rng() * FIRST_DUCK_SPREAD)

  // each at its own pace — a rubber ducky faster than the world — and a roaming
  // monitor at the height its point of the road gives it; what has run out past
  // the left edge is gone — it left through the fade
  let obstacles = g.obstacles
    .map((o) => {
      const moved = { ...o, x: o.x - speed * rushOf(o) * d }
      return o.kind === 'roaming' ? { ...moved, y: roamingY(moved) } : moved
    })
    .filter((o) => o.x + widthOf(o) > 0)
  // paid once, on the frame its back edge runs past the bug's
  let bonus = g.bonus
  let paid = g.paid
  for (const o of g.obstacles) {
    if (o.kind === 'server' || o.kind === 'sudo') continue
    const back = o.x + widthOf(o)
    if (back > BUG_X && back - speed * rushOf(o) * d <= BUG_X) {
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
  } else if (gap <= 0 && scoreOf(g) >= duckAt) {
    // the run's early rubber ducky: in once it has room, and until then nothing
    // else — the slot stays open, and the next frame looks again
    if (duckHasRoom(obstacles, g.width, speed)) {
      obstacles.push({ kind: 'duck', x: g.width, y: 0 })
      duckAt = Number.POSITIVE_INFINITY
      gap = nextGap(speed, rng)
    }
  } else if (gap <= 0) {
    // in at the right edge, out of the fade
    const o = nextObstacle(g, obstacles, t, speed, rng)
    obstacles.push(o)
    // a pair is longer than one hotfix: the road behind it starts at its end
    gap = nextGap(speed, rng) + (o.kind === 'double' ? widthOf(o) - SIZE.hotfix.w : 0)
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
    duckAt,
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
    // bug blinks back to itself, and the next card is set further on than the last
    const spent = g.spent + 1
    return {
      ...next,
      obstacles: obstacles.filter((o) => o !== hit),
      shielded: false,
      spent,
      flash: 0,
      wreck: { kind: hit.kind, x: hit.x, y: hit.y, w: widthOf(hit), h: heightOf(hit), age: 0 },
      sudoAt: scoreOf(next) + sudoAgain(spent),
    }
  }
  return obstacles.some(reaches) ? { ...next, meal: 0 } : next
}

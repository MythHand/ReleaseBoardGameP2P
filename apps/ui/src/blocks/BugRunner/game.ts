import { BUG_RUN_A, HOTFIX, MONITOR, sizeOf } from './sprites'

// The runner's rules, apart from any drawing: the browser's dinosaur game with
// the Bug as its hero. Everything is measured in world units — one pixel of the
// pixel art — and seconds; heights are above the ground, x from the left edge.

export type Phase = 'idle' | 'running' | 'over'
export type Kind = 'hotfix' | 'monitor'

export interface Obstacle {
  kind: Kind
  x: number
  y: number
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
  // units left to travel before the next obstacle appears
  gap: number
  distance: number
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
}

// A jump peaks at about 14 units, over a hotfix with room to spare, and lasts
// 0.6 s: v²/2g for the height, 2v/g for the time.
const GRAVITY = 320
const JUMP = 96
// the monitors fly in a lane a standing bug passes under and a jumping one
// runs into — the dinosaur's high bird: the answer to it is not to jump
export const MONITOR_Y = 12
const SPEED_START = 64
const SPEED_MAX = 150
const SPEED_GAIN = 2.5
// monitors join once the run has warmed up, and then as one obstacle in three
const MONITOR_FROM = 6
const MONITOR_SHARE = 0.34
// a tab coming back from the background must not teleport the world
const MAX_DT = 0.05
const RESTART_LOCK_MS = 400

export const speedAt = (t: number) => Math.min(SPEED_MAX, SPEED_START + t * SPEED_GAIN)
export const scoreOf = (g: Game) => Math.floor(g.distance / 10)

export function newGame(width: number, best = 0): Game {
  return {
    phase: 'idle',
    width,
    t: 0,
    y: 0,
    vy: 0,
    obstacles: [],
    gap: 20,
    distance: 0,
    best,
    overAt: 0,
  }
}

export const resize = (g: Game, width: number): Game => ({ ...g, width })

// The one input: a press. It wakes a sitting bug, jumps a running one that is
// on the ground, and starts a new run once the last one is over.
export function press(g: Game, now: number): Game {
  if (g.phase === 'idle') return { ...g, phase: 'running', vy: JUMP }
  if (g.phase === 'running') return g.y === 0 ? { ...g, vy: JUMP } : g
  if (now - g.overAt < RESTART_LOCK_MS) return g
  return { ...newGame(g.width, g.best), phase: 'running', vy: JUMP }
}

// The distance to the next obstacle: never shorter than a jump covers at this
// speed, so every gap can be cleared.
const nextGap = (speed: number, rng: () => number) => speed * 0.75 + 16 + rng() * 90

function hits(y: number, o: Obstacle): boolean {
  const s = SIZE[o.kind]
  // a pixel of slack on every side: the art's edges are glow, not body
  return (
    BUG_X + 1 < o.x + s.w - 1 &&
    o.x + 1 < BUG_X + BUG.w - 1 &&
    y + 1 < o.y + s.h - 1 &&
    o.y + 1 < y + BUG.h - 1
  )
}

export function step(g: Game, dt: number, rng: () => number, now: number): Game {
  if (g.phase !== 'running') return g
  const d = Math.min(dt, MAX_DT)
  const t = g.t + d
  const speed = speedAt(t)

  let vy = g.vy - GRAVITY * d
  let y = g.y + vy * d
  if (y <= 0) {
    y = 0
    vy = 0
  }

  // what has run out past the left edge is gone — it left through the fade
  const obstacles = g.obstacles
    .map((o) => ({ ...o, x: o.x - speed * d }))
    .filter((o) => o.x + SIZE[o.kind].w > 0)
  let gap = g.gap - speed * d
  if (gap <= 0) {
    const kind: Kind = t >= MONITOR_FROM && rng() < MONITOR_SHARE ? 'monitor' : 'hotfix'
    // in at the right edge, out of the fade
    obstacles.push({ kind, x: g.width, y: kind === 'monitor' ? MONITOR_Y : 0 })
    gap = nextGap(speed, rng)
  }

  const next: Game = { ...g, t, y, vy, obstacles, gap, distance: g.distance + speed * d }
  if (!obstacles.some((o) => hits(y, o))) return next
  return { ...next, phase: 'over', best: Math.max(g.best, scoreOf(next)), overAt: now }
}

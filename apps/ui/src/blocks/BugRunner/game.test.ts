import { describe, expect, it } from 'vitest'
import {
  BONUS,
  BUG_X,
  type Game,
  MONITOR_Y,
  newGame,
  press,
  STARTER_BONUS,
  scoreOf,
  serverAt,
  serverBonus,
  step,
} from './game'
import {
  BUG_RUN_A,
  BUG_RUN_B,
  BUG_SIT,
  HOTFIX,
  MONITOR,
  SERVER_BITES,
  type Sprite,
} from './sprites'

// no obstacle of its own unless a test places one
const never = () => 0.99
// the opening server is left out unless a test asks for it
const running = (over: Partial<Game> = {}): Game => ({
  ...newGame(200),
  phase: 'running',
  gap: 1e9,
  starter: false,
  ...over,
})
// run `seconds` of play in frames, the way the loop does
function play(g: Game, seconds: number): Game {
  let next = g
  for (let t = 0; t < seconds; t += 1 / 60) next = step(next, 1 / 60, never, 0)
  return next
}

describe('the sprites', () => {
  it.each([
    ['bug run a', BUG_RUN_A],
    ['bug run b', BUG_RUN_B],
    ['bug sit', BUG_SIT],
    ['hotfix', HOTFIX],
    ['monitor', MONITOR],
    ...SERVER_BITES.map((s, i): [string, Sprite] => [`server after ${i} bites`, s]),
  ] as [string, Sprite][])('%s is a rectangle', (_, sprite) => {
    expect(new Set(sprite.map((row) => row.length)).size).toBe(1)
  })
})

describe('the bug runner', () => {
  it('sits until the first press, then runs and jumps', () => {
    const idle = newGame(200)
    expect(step(idle, 1, never, 0)).toBe(idle)
    const woken = press(idle, 0)
    expect(woken.phase).toBe('running')
    expect(play(woken, 0.2).y).toBeGreaterThan(0)
  })

  it('jumps only from the ground', () => {
    const airborne = play(press(newGame(200), 0), 0.1)
    expect(press(airborne, 0)).toBe(airborne)
  })

  it('clears a hotfix with a jump and falls on one without', () => {
    // a hotfix just ahead: reached in an eighth of a second, passed in half of one
    const ahead = { kind: 'hotfix' as const, x: BUG_X + 23, y: 0 }
    const fell = play(running({ obstacles: [ahead] }), 0.6)
    expect(fell.phase).toBe('over')
    expect(fell.bonus).toBe(0)
    const cleared = play(press(running({ obstacles: [ahead] }), 0), 0.6)
    expect(cleared.phase).toBe('running')
    expect(cleared.bonus).toBe(BONUS.hotfix)
  })

  it('runs under a monitor, and into it with a jump', () => {
    const above = { kind: 'monitor' as const, x: BUG_X + 23, y: MONITOR_Y }
    const under = play(running({ obstacles: [above] }), 0.6)
    expect(under.phase).toBe('running')
    expect(under.bonus).toBe(BONUS.monitor)
    const hit = play(press(running({ obstacles: [above] }), 0), 0.6)
    expect(hit.phase).toBe('over')
    expect(hit.bonus).toBe(0)
  })

  it('pays a passed obstacle once, on top of the distance', () => {
    const passed = play(
      running({ obstacles: [{ kind: 'monitor', x: BUG_X + 23, y: MONITOR_Y }] }),
      1,
    )
    expect(passed.bonus).toBe(BONUS.monitor)
    expect(scoreOf(passed)).toBe(Math.floor(passed.distance / 10) + BONUS.monitor)
  })

  it('does not restart on a press right at the crash, and keeps the best score', () => {
    const crashed = play(
      running({ distance: 500, obstacles: [{ kind: 'hotfix', x: BUG_X, y: 0 }] }),
      0.05,
    )
    expect(crashed.phase).toBe('over')
    expect(crashed.best).toBe(scoreOf(crashed))
    expect(press(crashed, crashed.overAt + 100)).toBe(crashed)
    const again = press(crashed, crashed.overAt + 1000)
    expect(again.phase).toBe('running')
    expect(again.distance).toBe(0)
    expect(again.best).toBe(crashed.best)
  })

  it('sends each obstacle in at the right edge and lets it go past the left', () => {
    const spawned = step(running({ gap: 0 }), 1 / 60, never, 0)
    expect(spawned.obstacles).toHaveLength(1)
    expect(spawned.obstacles[0]?.x).toBe(200)
    const gone = step(running({ obstacles: [{ kind: 'hotfix', x: -9.5, y: 0 }] }), 1 / 60, never, 0)
    expect(gone.obstacles).toHaveLength(0)
  })
})

describe('the servers', () => {
  const server = { kind: 'server' as const, x: BUG_X + 20, y: 0, bites: 0 }

  it('come at 350, 1050, 2100… and pay 120, 180, 240…', () => {
    expect([1, 2, 3, 4].map(serverAt)).toEqual([350, 1050, 2100, 3500])
    expect([1, 2, 3].map(serverBonus)).toEqual([120, 180, 240])
  })

  it('takes the next obstacle slot once the score reaches the mark, and holds the road', () => {
    const early = step(running({ gap: 0, distance: 3490 }), 1 / 60, never, 0)
    expect(early.obstacles[0]?.kind).toBe('hotfix')
    const due = step(running({ gap: 0, distance: 3500 }), 1 / 60, never, 0)
    expect(due.obstacles[0]?.kind).toBe('server')
    expect(due.served).toBe(1)
    expect(play(due, 0.2).obstacles).toHaveLength(1)
  })

  it('is eaten a bite per frame while the world stands still, then pays and slows the bug', () => {
    const fast = running({ served: 1, speed: 120, pace: 120, obstacles: [server] })
    // reached in about 0.05 s at this speed
    const met = play(fast, 0.1)
    expect(met.meal).not.toBeNull()
    const bitten = play(met, 0.2)
    expect(bitten.distance).toBe(met.distance)
    expect(bitten.obstacles[0]?.bites).toBe(1)
    expect(press(bitten, 0)).toBe(bitten)
    const eating = play(bitten, 0.5)
    expect(eating.obstacles[0]?.bites).toBe(SERVER_BITES.length - 1)
    const fed = play(eating, 0.25)
    expect(fed.meal).toBeNull()
    expect(fed.obstacles).toHaveLength(0)
    expect(fed.bonus).toBe(serverBonus(1))
    expect(fed.paid).toEqual({ kind: 'server', points: serverBonus(1) })
    expect(fed.speed).toBeLessThan(met.speed)
    expect(fed.speed).toBeGreaterThan(newGame(200).speed)
    // the pace stands still for the meal, as the world does
    expect(eating.pace).toBe(met.pace)
  })

  it('slows the bug only for a breather: it catches up with the pace, then keeps to it', () => {
    const fed = play(running({ served: 1, speed: 120, pace: 120, obstacles: [server] }), 1.2)
    expect(fed.speed).toBeLessThan(fed.pace)
    const caught = play(fed, 3)
    expect(caught.speed).toBe(caught.pace)
    expect(caught.pace).toBeGreaterThan(fed.pace)
  })

  it('opens every run: first on the road, +10, the speed kept, the road not held', () => {
    const opened = step(running({ starter: true, gap: 0 }), 1 / 60, never, 0)
    expect(opened.obstacles[0]).toMatchObject({ kind: 'server', starter: true })
    expect(opened.starter).toBe(false)
    expect(opened.gap).toBeLessThan(Number.POSITIVE_INFINITY)
    expect(newGame(200).starter).toBe(true)

    const snack = { ...server, starter: true }
    const fed = play(running({ speed: 120, pace: 120, obstacles: [snack] }), 1.2)
    expect(fed.meal).toBeNull()
    expect(fed.obstacles).toHaveLength(0)
    expect(fed.bonus).toBe(STARTER_BONUS)
    expect(fed.paid).toEqual({ kind: 'server', points: STARTER_BONUS })
    expect(fed.speed).toBeGreaterThan(120)
    expect(fed.served).toBe(0)
  })

  it('is eaten by a bug that meets it in the air', () => {
    const met = play(press(running({ served: 1, obstacles: [server] }), 0), 0.3)
    expect(met.phase).toBe('running')
    expect(met.meal).not.toBeNull()
  })
})

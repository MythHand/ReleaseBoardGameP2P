import { describe, expect, it } from 'vitest'
import { BUG_X, type Game, MONITOR_Y, newGame, press, scoreOf, step } from './game'
import { BUG_RUN_A, BUG_RUN_B, BUG_SIT, HOTFIX, MONITOR, type Sprite } from './sprites'

// no obstacle of its own unless a test places one
const never = () => 0.99
const running = (over: Partial<Game> = {}): Game => ({
  ...newGame(200),
  phase: 'running',
  gap: 1e9,
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
    expect(play(running({ obstacles: [ahead] }), 0.6).phase).toBe('over')
    const jumped = press(running({ obstacles: [ahead] }), 0)
    expect(play(jumped, 0.6).phase).toBe('running')
  })

  it('runs under a monitor, and into it with a jump', () => {
    const above = { kind: 'monitor' as const, x: BUG_X + 23, y: MONITOR_Y }
    expect(play(running({ obstacles: [above] }), 0.6).phase).toBe('running')
    const jumped = press(running({ obstacles: [above] }), 0)
    expect(play(jumped, 0.6).phase).toBe('over')
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

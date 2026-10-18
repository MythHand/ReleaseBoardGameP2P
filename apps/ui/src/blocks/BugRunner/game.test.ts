import { describe, expect, it } from 'vitest'
import {
  BONUS,
  BUG,
  BUG_X,
  FLASH_S,
  type Game,
  jumpScale,
  MONITOR_Y,
  maxScoreWithin,
  newGame,
  nextGap,
  press,
  STARTER_BONUS,
  SUDO_Y,
  scoreOf,
  serverAt,
  serverBonus,
  step,
  sudoAgain,
  WRECK_S,
} from './game'
import {
  BUG_RUN_A,
  BUG_RUN_B,
  BUG_SIT,
  HOTFIX,
  MONITOR,
  SERVER_BITES,
  type Sprite,
  SUDO,
} from './sprites'

// no obstacle of its own unless a test places one
const never = () => 0.99
// the opening server and the sudo cards are left out unless a test asks for them
const running = (over: Partial<Game> = {}): Game => ({
  ...newGame(200),
  phase: 'running',
  gap: 1e9,
  starter: false,
  sudoAt: Number.POSITIVE_INFINITY,
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
    ['sudo', SUDO],
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

describe('a faster run is a harder one', () => {
  // how long the moment to jump over a hotfix lasts at this speed: every
  // distance the jump is taken from is tried, and the ones that clear it counted
  const spareAt = (speed: number) => {
    const stride = 0.25
    let cleared = 0
    for (let ahead = 0; ahead < 200; ahead += stride) {
      const hotfix = { kind: 'hotfix' as const, x: BUG_X + ahead, y: 0 }
      const g = play(press(running({ speed, pace: speed, obstacles: [hotfix] }), 0), 1.5)
      if (g.phase === 'running' && g.bonus === BONUS.hotfix) cleared += stride
    }
    return cleared / speed
  }

  it('leaves the start’s jump as it was', () => {
    expect(jumpScale(64)).toBe(1)
  })

  // a jump at this speed, played out in fine frames: how high, and how long
  const jumpAt = (speed: number) => {
    let g = press(running({ speed, pace: speed }), 0)
    let peak = 0
    let time = 0
    do {
      g = step(g, 1 / 600, never, 0)
      peak = Math.max(peak, g.y)
      time += 1 / 600
    } while (g.y > 0)
    return { peak, time }
  }

  it('quickens the jump with the world: the same height, less time', () => {
    const start = jumpAt(64)
    const full = jumpAt(150)
    expect(full.peak).toBeCloseTo(start.peak, 0)
    expect(full.time).toBeCloseTo(start.time / jumpScale(150), 1)
    expect(full.time).toBeLessThan(start.time)
  })

  it('lets the moment to jump a hotfix grow with the speed by half as much as it would', () => {
    // about a tenth of a second at the start, two tenths at full speed — an
    // unquickened jump left three, and one quickened all the way left the start's
    const start = spareAt(64)
    expect(start).toBeGreaterThan(0.05)
    expect(spareAt(150)).toBeCloseTo(start + 0.1, 1)
  })

  it('lets the road fill up as the jump quickens: the shortest gap is the jump’s length', () => {
    const start = nextGap(64, () => 0)
    for (const speed of [64, 80, 100, 120, 150]) {
      const shortest = nextGap(speed, () => 0)
      // every gap can still be cleared: none is shorter than a jump goes
      expect(shortest).toBeGreaterThan(speed * jumpAt(speed).time)
      // and the start's is the shortest of all — the host's ceiling counts on it
      expect(shortest).toBeGreaterThanOrEqual(start)
    }
    // at full speed, shorter than the unquickened jump allowed
    expect(nextGap(150, () => 0)).toBeLessThan(150 * 0.75 + 16)
  })

  it('keeps the road as full as ever, but the rhythm uneven: bunches and breathers', () => {
    // every die the game could roll, evenly
    const rolls = Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000)
    for (const speed of [64, 100, 150]) {
      const shortest = nextGap(speed, () => 0)
      const extras = rolls.map((r) => nextGap(speed, () => r) - shortest)
      // as long on average as the even spread of 90 that came before
      expect(extras.reduce((a, b) => a + b, 0) / extras.length).toBeCloseTo(45, 0)
      // but mostly short, and now and then half as long again as the longest was
      expect(extras.filter((e) => e < 45).length).toBeGreaterThan(extras.length * 0.55)
      expect(Math.max(...extras)).toBeGreaterThan(130)
    }
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

describe('the sudo card', () => {
  const ahead = { kind: 'hotfix' as const, x: BUG_X + 23, y: 0 }
  const card = { kind: 'sudo' as const, x: BUG_X + 10, y: SUDO_Y }
  // past the first server mark, so the slot is the card's to take
  const due = (over: Partial<Game>) => running({ gap: 0, served: 1, ...over })

  it('comes first at a score each run draws between 600 and 700', () => {
    const low = () => 0
    expect(step(due({ sudoAt: null, distance: 5990 }), 1 / 60, low, 0).obstacles[0]?.kind).toBe(
      'hotfix',
    )
    expect(step(due({ sudoAt: null, distance: 6000 }), 1 / 60, low, 0).obstacles[0]?.kind).toBe(
      'sudo',
    )
    expect(step(due({ sudoAt: null, distance: 6980 }), 1 / 60, never, 0).obstacles[0]?.kind).toBe(
      'hotfix',
    )
    expect(step(due({ sudoAt: null, distance: 6990 }), 1 / 60, never, 0).obstacles[0]?.kind).toBe(
      'sudo',
    )
  })

  it('comes one at a time: the next slot after it is an obstacle again', () => {
    const spawned = step(due({ sudoAt: 600, distance: 7000 }), 1 / 60, never, 0)
    // between the lanes: above a hotfix, below a monitor
    expect(spawned.obstacles[0]).toMatchObject({ kind: 'sudo', y: SUDO_Y })
    expect(spawned.sudoAt).toBe(Number.POSITIVE_INFINITY)
    expect(step({ ...spawned, gap: 0 }, 1 / 60, never, 0).obstacles[1]?.kind).toBe('hotfix')
  })

  it('is taken on the run, in the air too, and the bug blinks into its protection', () => {
    const before = running({ obstacles: [card] })
    const taken = play(before, 0.2)
    expect(taken.shielded).toBe(true)
    expect(taken.obstacles).toHaveLength(0)
    // no meal: the world never stood still for it
    expect(taken.meal).toBeNull()
    expect(taken.distance).toBeGreaterThan(before.distance + 64 * 0.15)
    expect(taken.flash).not.toBeNull()
    expect(play(taken, FLASH_S).flash).toBeNull()
    expect(play(press(running({ obstacles: [card] }), 0), 0.2).shielded).toBe(true)
  })

  it('takes a hit for the bug: the obstacle breaks for nothing, the next card 1200 points on', () => {
    let g = running({ shielded: true, obstacles: [ahead] })
    while (g.shielded) g = step(g, 1 / 60, never, 0)
    expect(g.phase).toBe('running')
    expect(g.obstacles).toHaveLength(0)
    expect(g.bonus).toBe(0)
    expect(g.wreck).toMatchObject({ kind: 'hotfix', age: 0 })
    expect(g.flash).toBe(0)
    expect(g.sudoAt).toBe(scoreOf(g) + 1200)
    // the pieces fly, then are gone
    expect(play(g, WRECK_S).wreck).toBeNull()
    // a monitor jumped into is taken the same way
    const above = { kind: 'monitor' as const, x: BUG_X + 23, y: MONITOR_Y }
    const jumped = play(press(running({ shielded: true, obstacles: [above] }), 0), 0.6)
    expect(jumped.phase).toBe('running')
    expect(jumped.shielded).toBe(false)
  })

  it('comes 600 points further off after each protection spent: 1200, 1800, 2400…', () => {
    expect([1, 2, 3].map(sudoAgain)).toEqual([1200, 1800, 2400])
    let g = running({ shielded: true, spent: 2, obstacles: [ahead] })
    while (g.shielded) g = step(g, 1 / 60, never, 0)
    expect(g.spent).toBe(3)
    expect(g.sudoAt).toBe(scoreOf(g) + 2400)
  })

  it('takes one hit only: the next one ends the run', () => {
    const spent = play(running({ shielded: true, obstacles: [ahead] }), 0.6)
    expect(spent.shielded).toBe(false)
    expect(play({ ...spent, obstacles: [ahead] }, 0.6).phase).toBe('over')
  })
})

// THE CEILING THE HOST CHECKS A SCORE AGAINST. It is only worth anything if no
// real run ever goes over it, so real runs are played here: the game's own
// randomness from a fixed seed, a jumper that clears hotfixes, the loop's frame
// length — and every frame of every run is held against the ceiling for the
// time it has run.
describe('maxScoreWithin', () => {
  const seeded = (seed: number) => {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }
  // jumps when a hotfix comes within an eighth of a second of the bug's front
  const jumpsHotfixes = (g: Game) =>
    g.obstacles.some((o) => {
      const ahead = o.x - (BUG_X + BUG.w)
      return o.kind === 'hotfix' && ahead >= 0 && ahead < g.speed * 0.12
    })
  // a run of `seconds`, each frame handed to `check`
  const run = (seed: number, seconds: number, check: (g: Game) => void = () => {}) => {
    const rng = seeded(seed)
    let g = press(newGame(240), 0)
    for (let frame = 0; frame < 60 * seconds && g.phase === 'running'; frame++) {
      const now = (frame * 1000) / 60
      if (jumpsHotfixes(g)) g = press(g, now)
      g = step(g, 1 / 60, rng, now)
      check(g)
    }
    return g
  }
  const seeds = [1, 7, 42, 2024, 31337]

  it('is never beaten by a real run, at any moment of it', () => {
    for (const seed of seeds) {
      const g = run(seed, 180, (frame) => {
        expect(scoreOf(frame)).toBeLessThanOrEqual(maxScoreWithin(frame.t))
      })
      // the runs go the distance: the servers and the top pace are checked too
      expect(g.phase).toBe('running')
      expect(g.served).toBeGreaterThanOrEqual(5)
      expect(g.pace).toBe(150)
    }
  })

  it('keeps a real minute’s score out of a three-second run’s reach', () => {
    for (const seed of seeds) {
      expect(scoreOf(run(seed, 60))).toBeGreaterThan(maxScoreWithin(3))
    }
  })

  it('grows with the time a run has had, and stays a number a run can mean', () => {
    expect(maxScoreWithin(0)).toBeGreaterThan(0)
    expect(maxScoreWithin(30)).toBeGreaterThan(maxScoreWithin(10))
    expect(maxScoreWithin(600)).toBeGreaterThan(maxScoreWithin(60))
    // the number the review typed into devtools is out of reach of any run
    expect(maxScoreWithin(24 * 3600)).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })
})

import { describe, expect, it } from 'vitest'
import {
  BONUS,
  BUG,
  BUG_X,
  DOUBLE_OVERLAP,
  DUCK_RUSH,
  FLASH_S,
  type Game,
  jumpScale,
  MONITOR_Y,
  maxScoreWithin,
  newGame,
  nextGap,
  press,
  roamingShare,
  rushOf,
  STARTER_BONUS,
  SUDO_Y,
  scoreOf,
  serverAt,
  serverBonus,
  step,
  sudoAgain,
  WRECK_S,
  widthOf,
} from './game'
import {
  BUG_RUN_A,
  BUG_RUN_B,
  BUG_SIT,
  DUCK,
  HOTFIX,
  MONITOR,
  SERVER_BITES,
  type Sprite,
  SUDO,
} from './sprites'

// no obstacle of its own unless a test places one
const never = () => 0.99
// the opening server, the sudo cards and the early rubber ducky are left out
// unless a test asks for them
const running = (over: Partial<Game> = {}): Game => ({
  ...newGame(200),
  phase: 'running',
  gap: 1e9,
  starter: false,
  sudoAt: Number.POSITIVE_INFINITY,
  duckAt: Number.POSITIVE_INFINITY,
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
    ['rubber ducky', DUCK],
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

// the dice the game rolls, one after another, and the last one from then on
const dice = (...rolls: number[]) => {
  let i = 0
  return () => rolls[Math.min(i++, rolls.length - 1)] ?? 0
}
// a slot coming up now, at this score and speed, with the opening server, the
// first server mark and the sudo cards out of the way
const slot = (score: number, speed = 100, over: Partial<Game> = {}) =>
  running({ gap: 0, distance: score * 10, served: 99, speed, pace: speed, t: 30, ...over })

describe('roaming monitors', () => {
  it('join at 1000 points as 5% and grow to 30% by 3000', () => {
    expect(roamingShare(999)).toBe(0)
    expect(roamingShare(1000)).toBeCloseTo(0.05)
    expect(roamingShare(2000)).toBeCloseTo(0.175)
    expect(roamingShare(3000)).toBeCloseTo(0.3)
    expect(roamingShare(9000)).toBeCloseTo(0.3)
  })

  it('take their share half from the monitors and half from the hotfixes', () => {
    // at 3000: 30% roaming, 34 − 15 = 19% monitors, 15% rubber duckies, and the
    // rest — 66 − 15 − 15 = 36% — hotfixes
    const kindAt = (roll: number) => step(slot(3000), 1 / 60, dice(roll, 0.9), 0).obstacles[0]?.kind
    expect(kindAt(0.29)).toBe('roaming')
    expect(kindAt(0.31)).toBe('monitor')
    expect(kindAt(0.48)).toBe('monitor')
    expect(kindAt(0.5)).toBe('duck')
    expect(kindAt(0.65)).toBe('hotfix')
  })

  it('settle halfway to the bug, and swing as slowly at any speed: 0.8 s a swing', () => {
    for (const speed of [100, 150]) {
      const o = step(slot(3000, speed, { width: 250 }), 1 / 60, dice(0, 0.2, 0.9), 0).obstacles[0]
      expect(o?.settle).toBeCloseTo(BUG_X + (250 - BUG_X) / 2, 6)
      // the road one swing takes, at the speed it came in at
      expect((o?.wave ?? 0) / speed).toBeCloseTo(0.8, 2)
    }
  })

  it('swing between the lanes while far off, and hold their own for the last half', () => {
    for (const [roll, lane, y] of [
      [0.2, 'low', 0],
      [0.8, 'high', MONITOR_Y],
    ] as const) {
      let g = step(slot(3000, 100, { width: 250 }), 1 / 60, dice(0, roll, 0.9), 0)
      const o = g.obstacles[0]
      expect(o).toMatchObject({ kind: 'roaming', lane })
      const heights = new Set<number>()
      while ((g.obstacles[0]?.x ?? 0) > (o?.settle ?? 0)) {
        heights.add(Math.round(g.obstacles[0]?.y ?? 0))
        g = step({ ...g, gap: 1e9 }, 1 / 60, never, 0)
      }
      // it has been on both lanes and between them on the way
      expect(heights.size).toBeGreaterThan(5)
      for (let i = 0; i < 10; i++) {
        g = step({ ...g, gap: 1e9 }, 1 / 60, never, 0)
        if (g.obstacles[0]) expect(g.obstacles[0].y).toBe(y)
      }
    }
  })

  it('are jumped on the low lane, run under on the high one, and pay 50 either way', () => {
    // settled long before: both are on their lanes already
    const low = { kind: 'roaming' as const, x: BUG_X + 23, y: 0, lane: 'low' as const, settle: 999 }
    const high = { ...low, y: MONITOR_Y, lane: 'high' as const }
    expect(play(running({ obstacles: [low] }), 0.6).phase).toBe('over')
    expect(play(press(running({ obstacles: [low] }), 0), 0.6).bonus).toBe(50)
    expect(play(press(running({ obstacles: [high] }), 0), 0.6).phase).toBe('over')
    expect(play(running({ obstacles: [high] }), 0.6).bonus).toBe(50)
  })
})

describe('a pair of hotfixes', () => {
  it('comes only above a speed of 138, as one hotfix in five', () => {
    // the speed creeps up within the frame, so the one below the line is a step off it
    expect(step(slot(500, 137), 1 / 60, dice(0.9, 0.1, 0.5), 0).obstacles[0]?.kind).toBe('hotfix')
    expect(step(slot(500, 139), 1 / 60, dice(0.9, 0.1, 0.5), 0).obstacles[0]?.kind).toBe('double')
    expect(step(slot(500, 139), 1 / 60, dice(0.9, 0.3, 0.5), 0).obstacles[0]?.kind).toBe('hotfix')
  })

  it('can be jumped at that speed, overlapping or back to back, and pays 100 once', () => {
    for (const overlap of [0, DOUBLE_OVERLAP]) {
      let cleared = false
      for (let ahead = 0; ahead < 120 && !cleared; ahead += 0.5) {
        const pair = { kind: 'double' as const, x: BUG_X + ahead, y: 0, overlap }
        const g = play(press(running({ speed: 139, pace: 139, obstacles: [pair] }), 0), 1)
        cleared = g.phase === 'running' && g.bonus === 100
      }
      expect(cleared).toBe(true)
    }
  })

  it('starts the road behind it at its end', () => {
    // overlapping by half the most: 18 long, 8 more than a hotfix
    const spawned = step(slot(500, 139), 1 / 60, dice(0.9, 0.1, 0.5, 0), 0)
    expect(spawned.obstacles[0]).toMatchObject({ kind: 'double', overlap: DOUBLE_OVERLAP / 2 })
    expect(spawned.gap).toBeCloseTo(nextGap(spawned.speed, () => 0) + 8, 6)
  })
})

describe('a rubber ducky', () => {
  it('joins at 1500 points, taken from the hotfixes', () => {
    // at 1500: 11.25% roaming, 28.4% monitors, then 15% duckies
    const kindAt = (score: number) =>
      step(slot(score), 1 / 60, dice(0.5, 0.9), 0).obstacles[0]?.kind
    expect(kindAt(1499)).toBe('hotfix')
    expect(kindAt(1500)).toBe('duck')
  })

  it('runs at the bug faster than the world, and pays 50 when jumped', () => {
    const duck = { kind: 'duck' as const, x: 200, y: 0 }
    const g = play(running({ gap: 1e9, obstacles: [duck] }), 0.5)
    const run = 200 - (g.obstacles[0]?.x ?? 0)
    expect(run / (g.distance - 0)).toBeCloseTo(1 + DUCK_RUSH, 1)
    const near = { kind: 'duck' as const, x: BUG_X + 30, y: 0 }
    expect(play(press(running({ obstacles: [near] }), 0), 0.6).bonus).toBe(50)
  })

  it('comes once early, at a score each run draws between 300 and 800', () => {
    const drawn = (roll: number) =>
      step(running({ duckAt: null }), 1 / 60, dice(roll, roll, 0.9), 0).duckAt
    expect(drawn(0)).toBe(300)
    expect(drawn(0.999)).toBe(799)
  })

  it('waits for room when it comes early, rather than give way to a hotfix', () => {
    const ahead = { kind: 'hotfix' as const, x: 200, y: 0 }
    let g = slot(500, 100, { width: 250, duckAt: 400, obstacles: [ahead] })
    g = step(g, 1 / 60, never, 0)
    // no room yet: nothing comes in, and the ducky is still to come
    expect(g.obstacles).toHaveLength(1)
    expect(g.duckAt).toBe(400)
    while (g.obstacles.length === 1) g = step(g, 1 / 60, never, 0)
    expect(g.obstacles[1]?.kind).toBe('duck')
    expect(g.duckAt).toBe(Number.POSITIVE_INFINITY)
  })

  it('is a hotfix instead where it would catch up with the obstacle ahead', () => {
    // a hotfix just let in ahead: the ducky would run into its back
    const ahead = { kind: 'hotfix' as const, x: 200, y: 0 }
    const crowded = slot(1500, 100, { width: 250, obstacles: [ahead] })
    expect(step(crowded, 1 / 60, dice(0.5, 0.9), 0).obstacles[1]?.kind).toBe('hotfix')
    // the same, with the road ahead clear
    expect(
      step(slot(1500, 100, { width: 250 }), 1 / 60, dice(0.5, 0.9), 0).obstacles[0]?.kind,
    ).toBe('duck')
  })
})

// THE CEILING THE HOST CHECKS A SCORE AGAINST. It is only worth anything if no
// real run ever goes over it, so real runs are played here: the game's own
// randomness from a fixed seed, a jumper that clears all there is to jump, the
// loop's frame length — and every frame of every run is held against the
// ceiling for the time it has run.
describe('maxScoreWithin', () => {
  const seeded = (seed: number) => {
    let s = seed
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
  }
  // what stands on the road to be jumped: a hotfix, a pair, a rubber ducky, and
  // a roaming monitor on the low lane
  const grounded = (o: Game['obstacles'][number]) =>
    o.kind === 'hotfix' ||
    o.kind === 'double' ||
    o.kind === 'duck' ||
    (o.kind === 'roaming' && o.lane === 'low')
  // jumps when one comes within an eighth of a second of the bug's front, at
  // the speed it comes at — a pair, earlier by half of what it has over a hotfix
  const jumpsHotfixes = (g: Game) =>
    g.obstacles.some((o) => {
      const closing = g.speed * rushOf(o)
      const ahead = o.x - (BUG_X + BUG.w)
      const lead = 0.12 + (widthOf(o) - HOTFIX[0].length) / (2 * closing)
      return grounded(o) && ahead >= 0 && ahead < closing * lead
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

  // the real runs serve one more rule, owner's: every run meets a rubber ducky
  // between 300 and 1000 points — one, whatever servers and sudo cards it meets
  it('brings a rubber ducky into every real run, once, between 300 and 1000 points', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const early: number[] = []
      const end = run(seed * 101, 45, (g) => {
        if (scoreOf(g) < 1500 && g.obstacles.some((o) => o.kind === 'duck' && o.x === g.width)) {
          early.push(scoreOf(g))
        }
      })
      expect(scoreOf(end)).toBeGreaterThan(1000)
      expect(early).toHaveLength(1)
      expect(early[0]).toBeGreaterThanOrEqual(300)
      expect(early[0]).toBeLessThan(1000)
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

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import Typography from '@/primitives/Typography'
import styles from './BugRunner.module.css'
import {
  BUG,
  BUG_X,
  FADE,
  type Game,
  GROUND,
  newGame,
  type Phase,
  press,
  resize,
  scoreOf,
  step,
  WORLD_H,
} from './game'
import { BUG_RUN_A, BUG_RUN_B, BUG_SIT, HOTFIX, MONITOR, type Sprite } from './sprites'

export interface BugRunnerProps {
  // what the block is, for a screen reader — the kit carries no copy of its own
  label: string
  className?: string
}

// The colours come from the design tokens, read off the element: the canvas
// takes no `var()`, and a literal here would break the colour rule.
interface Palette {
  dark: string
  bug: string
  hotfix: string
  monitor: string
  ground: string
}

function readPalette(el: Element): Palette {
  const css = getComputedStyle(el)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    dark: token('--surface-1'),
    bug: token('--cat-attack'),
    hotfix: token('--cat-defense'),
    monitor: token('--cat-protection'),
    ground: token('--white-18'),
  }
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  top: number,
  accent: string,
  dark: string,
) {
  sprite.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const px = row[c]
      if (px === '.') continue
      ctx.fillStyle = px === 'a' ? accent : dark
      ctx.fillRect(Math.round(x) + c, top + r, 1, 1)
    }
  })
}

function draw(ctx: CanvasRenderingContext2D, g: Game, p: Palette) {
  const ground = WORLD_H - GROUND
  ctx.clearRect(0, 0, g.width, WORLD_H)

  // the ground: a dashed line that runs under the bug, so standing still and
  // running read apart even with nothing on the road
  ctx.fillStyle = p.ground
  const offset = g.distance % 6
  for (let x = -offset; x < g.width; x += 6) ctx.fillRect(Math.round(x), ground, 3, 1)

  for (const o of g.obstacles) {
    if (o.kind === 'hotfix') {
      drawSprite(ctx, HOTFIX, o.x, ground - o.y - HOTFIX.length, p.hotfix, p.dark)
    } else {
      // a monitor flies: it bobs a pixel as it goes
      const bob = Math.floor(g.t * 4) % 2
      drawSprite(ctx, MONITOR, o.x, ground - o.y - MONITOR.length - bob, p.monitor, p.dark)
    }
  }

  const bug =
    g.phase === 'idle'
      ? BUG_SIT
      : g.y > 0
        ? BUG_RUN_A
        : Math.floor(g.distance / 6) % 2
          ? BUG_RUN_B
          : BUG_RUN_A
  drawSprite(ctx, bug, BUG_X, ground - Math.round(g.y) - BUG.h, p.bug, p.dark)
}

const pad = (n: number) => String(n).padStart(5, '0')

// A dinosaur game with the Bug as its hero, for the lobby's header: it sits
// until clicked, then runs — jump the hotfixes on the road, stay down under the
// monitors in the air. Transparent, and as wide as the room it is given.
export default function BugRunner({ label, className = '' }: BugRunnerProps) {
  const rootRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game>(newGame(0))
  const palette = useRef<Palette | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)

  const paint = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !palette.current) return
    draw(ctx, game.current, palette.current)
  }, [])

  // The block has no height of its own — it takes the one its place gives it,
  // and never adds to it (owner, 25.09: it grew the lobby's header). One world
  // unit is as many whole CSS pixels as that height holds, so the art stays
  // crisp at any header; the width follows in whole units. A resize repaints.
  useLayoutEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    palette.current = readPalette(root)
    const fitCanvas = () => {
      const scale = Math.max(1, Math.floor(root.clientHeight / WORLD_H))
      const width = Math.floor(root.clientWidth / scale)
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width * scale * dpr)
      canvas.height = Math.round(WORLD_H * scale * dpr)
      // whole units on screen too: stretched by the odd pixel, the art blurs
      canvas.style.inlineSize = `${width * scale}px`
      canvas.style.blockSize = `${WORLD_H * scale}px`
      // the mask's fade, in the same units as the bug's place
      root.style.setProperty('--fade', `${FADE * scale}px`)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      game.current = resize(game.current, width)
      paint()
    }
    fitCanvas()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fitCanvas)
    observer.observe(root)
    return () => observer.disconnect()
  }, [paint])

  // Frames run only while the bug does: a sitting or crashed bug costs nothing.
  useEffect(() => {
    if (phase !== 'running') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const g = step(game.current, (now - last) / 1000, Math.random, now)
      last = now
      game.current = g
      paint()
      setScore(scoreOf(g))
      if (g.phase !== 'running') {
        setBest(g.best)
        setPhase(g.phase)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, paint])

  const act = () => {
    const g = press(game.current, performance.now())
    if (g === game.current) return
    game.current = g
    setPhase(g.phase)
    paint()
  }

  // on the press, not the release: a jump that waits for the button to come up
  // is late by exactly the time the player took to let go
  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault()
    act()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    e.preventDefault()
    act()
  }

  return (
    <button
      ref={rootRef}
      type="button"
      aria-label={label}
      className={`${styles.runner} ${className}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      {phase !== 'idle' && (
        <span className={styles.score} aria-hidden="true">
          {best > 0 && (
            <Typography base="mono-xs" tk="tk-10" as="span" className={styles.best}>
              {pad(best)}
            </Typography>
          )}
          <Typography base="mono-xs" tk="tk-10" as="span">
            {pad(score)}
          </Typography>
        </span>
      )}
    </button>
  )
}

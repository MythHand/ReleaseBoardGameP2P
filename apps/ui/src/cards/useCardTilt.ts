import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

// Shared pointer-tilt engine for card faces — the single source of the tilt math.
// Maps the cursor position over a card to a deflection vector p (−0.5…0.5 on each
// axis), tracks hover, and builds the whole-card transform (lift + scale on hover,
// rotateX/rotateY from p). Both the interactive primitive Card and the display-only
// CardParallax consume it, so the engine lives in exactly one place — no copy.
//
// p is also handed to ComposedFace, which shifts each layer by its depth → parallax.

// peak tilt angle at the card edge, degrees (the edge sits at p = ±0.5 → ±ANGLE/2)
const ANGLE = 14
// hover lift (px) and scale
const LIFT = 10
const SCALE = 1.04

// the calm position. One shared object, so setting it twice is a no-op for React
// instead of a render with equal values.
const ORIGIN = { x: 0, y: 0 }

export interface Deflection {
  x: number
  y: number
}

export interface CardTilt {
  // pointer deflection, −0.5…0.5 per axis (0,0 at rest) — feeds ComposedFace parallax
  p: Deflection
  hover: boolean
  // ready-to-apply CSS transform for the tilt/lift wrapper
  transform: string
  // attach to the element `transform` goes on: straightening a mounted
  // deflection needs the node (see `from`)
  tiltRef: RefObject<HTMLDivElement | null>
  onMouseEnter: () => void
  onMouseMove: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

/**
 * @param tilt run the pointer parallax (false → stays flat; e.g. disabled / calm state)
 * @param lift run the hover lift+scale (Card separates it from tilt; Rules/preview tie both to `interactive`)
 * @param from deflection the face ARRIVES with, and straightens out of on mount
 */
export function useCardTilt({
  tilt = true,
  lift = true,
  from,
}: {
  tilt?: boolean
  lift?: boolean
  from?: Deflection
} = {}): CardTilt {
  const [p, setP] = useState(from ?? ORIGIN)
  const [hover, setHover] = useState(false)
  const tiltRef = useRef<HTMLDivElement>(null)

  // reset the tilt when parallax turns off (card left the hovered / active state)
  useEffect(() => {
    if (!tilt) setP(ORIGIN)
  }, [tilt])

  // A face can arrive already deflected. A card torn out of the fan onto the drag
  // layer is a NEW instance of the component, and a new instance is born flat —
  // so the straightening this layer transitions through on every mouseleave never
  // happens, and the card cuts to flat in a single frame. `from` mounts it at the
  // deflection it had and hands it to that same transition: one straightening,
  // one implementation, no second animation for a movement that already exists.
  //
  // The read between the two values is the whole trick. Without a style
  // recalculation the browser only ever sees the flat value and has nothing to
  // transition from — the cut would survive the fix.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a mount-time handover — `from` is the value it arrived with, read once by definition
  useLayoutEffect(() => {
    if (!from) return
    tiltRef.current?.getBoundingClientRect()
    setP(ORIGIN)
  }, [])

  function onMouseMove(e: MouseEvent<HTMLElement>) {
    if (!tilt) return
    const r = e.currentTarget.getBoundingClientRect()
    setP({
      x: (e.clientX - r.left) / r.width - 0.5,
      y: (e.clientY - r.top) / r.height - 0.5,
    })
  }
  function onMouseEnter() {
    if (lift) setHover(true)
  }
  function onMouseLeave() {
    setHover(false)
    setP(ORIGIN)
  }

  const transform =
    `translateY(${hover ? -LIFT : 0}px) scale(${hover ? SCALE : 1}) ` +
    `rotateX(${(-p.y * ANGLE).toFixed(2)}deg) rotateY(${(p.x * ANGLE).toFixed(2)}deg)`

  return { p, hover, transform, tiltRef, onMouseEnter, onMouseMove, onMouseLeave }
}

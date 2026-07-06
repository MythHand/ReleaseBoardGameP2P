import { type MouseEvent, useEffect, useState } from 'react'

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

export interface CardTilt {
  // pointer deflection, −0.5…0.5 per axis (0,0 at rest) — feeds ComposedFace parallax
  p: { x: number; y: number }
  hover: boolean
  // ready-to-apply CSS transform for the tilt/lift wrapper
  transform: string
  onMouseEnter: () => void
  onMouseMove: (e: MouseEvent<HTMLElement>) => void
  onMouseLeave: () => void
}

/**
 * @param tilt run the pointer parallax (false → stays flat; e.g. disabled / calm state)
 * @param lift run the hover lift+scale (Card separates it from tilt; Rules/preview tie both to `interactive`)
 */
export function useCardTilt({
  tilt = true,
  lift = true,
}: {
  tilt?: boolean
  lift?: boolean
} = {}): CardTilt {
  const [p, setP] = useState({ x: 0, y: 0 })
  const [hover, setHover] = useState(false)

  // reset the tilt when parallax turns off (card left the hovered / active state)
  useEffect(() => {
    if (!tilt) setP({ x: 0, y: 0 })
  }, [tilt])

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
    setP({ x: 0, y: 0 })
  }

  const transform =
    `translateY(${hover ? -LIFT : 0}px) scale(${hover ? SCALE : 1}) ` +
    `rotateX(${(-p.y * ANGLE).toFixed(2)}deg) rotateY(${(p.x * ANGLE).toFixed(2)}deg)`

  return { p, hover, transform, onMouseEnter, onMouseMove, onMouseLeave }
}

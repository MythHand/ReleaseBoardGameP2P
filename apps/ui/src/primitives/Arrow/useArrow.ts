import { useCallback, useEffect, useState } from 'react'
import type { Point } from './Arrow'

// Центр элемента в координатах viewport (clientX/Y) — для точек from/to стрелки.
export function centerOf(el: HTMLElement): Point {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// Поведение адресной стрелки: держит точки from/to и активность, сам следит за
// курсором, пока активна. aim(откуда[, куда[, цвет]]) — начать; stop() — закончить.
// Что делать по клику (отмена / подтверждение) решает потребитель.
//
// The colour is armed WITH the origin, because it belongs to the same thing:
// the arrow leaves a card, and that card decides both where the line starts and
// what colour it is drawn in. Passing it separately to `<Arrow>` means the
// consumer holds a second rule for the same fact, and the two drift — a sudo
// handed the aim over to the card it enhances, the origin moved and the hue
// stayed yellow (#168). Whoever aims names the colour; `color` is opaque here,
// so this stays free of any idea of card categories.
export function useArrow() {
  const [from, setFrom] = useState<Point | null>(null)
  const [to, setTo] = useState<Point | null>(null)
  const [color, setColor] = useState<string | undefined>(undefined)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active) return
    const onMove = (e: MouseEvent) => setTo({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [active])

  const aim = useCallback((origin: Point, at?: Point, hue?: string) => {
    setFrom(origin)
    setTo(at ?? origin)
    setColor(hue)
    setActive(true)
  }, [])

  const stop = useCallback(() => {
    setActive(false)
    setFrom(null)
    setTo(null)
    setColor(undefined)
  }, [])

  return { from, to, color, active, aim, stop }
}

import { useCallback, useEffect, useState } from 'react'
import type { Point } from './Arrow'

// Центр элемента в координатах viewport (clientX/Y) — для точек from/to стрелки.
export function centerOf(el: HTMLElement): Point {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

// Поведение адресной стрелки: держит точки from/to и активность, сам следит за
// курсором, пока активна. aim(откуда[, куда]) — начать; stop() — закончить.
// Что делать по клику (отмена / подтверждение) решает потребитель.
export function useArrow() {
  const [from, setFrom] = useState<Point | null>(null)
  const [to, setTo] = useState<Point | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!active) return
    const onMove = (e: MouseEvent) => setTo({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [active])

  const aim = useCallback((origin: Point, at?: Point) => {
    setFrom(origin)
    setTo(at ?? origin)
    setActive(true)
  }, [])

  const stop = useCallback(() => {
    setActive(false)
    setFrom(null)
    setTo(null)
  }, [])

  return { from, to, active, aim, stop }
}

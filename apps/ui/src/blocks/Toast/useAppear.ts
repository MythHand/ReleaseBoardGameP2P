import { useEffect, useRef } from 'react'
import { play } from '@/animations/play'

// Приход и уход одной штуки в стопке — и плашки, и кнопки под ней: они части
// одного целого, значит и появляться должны одинаково, а не «похоже».
// Приход играется на монтировании элемента, поэтому хук обязан жить в том
// компоненте, который вместе с этим элементом монтируется.
// Уход элемент доигрывает САМ: снаружи ему говорят `leaving`, и только после
// конца анимации он отдаёт право снять себя со сцены (`onLeft`).
export function useAppear<T extends HTMLElement>(leaving: boolean, onLeft?: () => void) {
  const ref = useRef<T>(null)

  useEffect(() => {
    play('hudIn', ref.current, { dy: 18, dur: 260 })
  }, [])

  useEffect(() => {
    if (!leaving) return
    const anim = play('popOut', ref.current)
    if (!anim) {
      onLeft?.()
      return
    }
    let alive = true
    anim.finished
      .then(() => {
        if (alive) onLeft?.()
      })
      .catch(() => {
        // прерванная анимация — не ошибка: элемент сняли раньше нас
      })
    return () => {
      alive = false
    }
  }, [leaving, onLeft])

  return ref
}

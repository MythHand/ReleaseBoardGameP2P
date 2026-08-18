import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { play } from '@/animations/play'
import Button from '@/primitives/Button'
import Toast from './Toast'
import styles from './Toast.module.css'
import { useAppear } from './useAppear'

export interface ToastItem {
  id: string
  node: ReactNode
}

export interface ToastStackCopy {
  // подпись кнопки, гасящей всю стопку разом
  hide: string
}

interface ToastStackProps {
  // Полный список того, что МОЖЕТ всплыть. Стопка сама решает, что из него
  // новое: всё, что уже лежало на момент запуска, считается увиденным — иначе
  // при входе на экран в лицо прилетает история.
  items: ToastItem[]
  copy: ToastStackCopy
  // сколько плашек держится одновременно; лишние уходят в порядке прибытия
  max?: number
  // сколько живёт одна плашка, мс
  hold?: number
  // клик по плашке — открыть то место, где это сообщение живёт целиком
  onOpen?: () => void
  className?: string
}

interface LiveToast {
  key: string
  node: ReactNode
  // уход начат: плашка ещё на сцене, но уже доигрывает свою анимацию
  leaving: boolean
}

// Кнопка, гасящая стопку: приходит и уходит тем же движением, что и плашки, —
// она часть стопки, а не рамка вокруг неё. Отдельным компонентом она нужна
// затем, что приход играется на монтировании, а монтируется она не вместе со
// стопкой, а вместе с первой плашкой.
function HideButton({
  leaving,
  onLeft,
  label,
  onClick,
}: {
  leaving: boolean
  onLeft: () => void
  label: string
  onClick: () => void
}) {
  const ref = useAppear<HTMLDivElement>(leaving, onLeft)
  return (
    <div ref={ref} className={styles.hide}>
      <Button variant="tech" onClick={onClick}>
        {label}
      </Button>
    </div>
  )
}

// Стопка всплывающих плашек: прижата к низу и растёт вверх. Знает ровно три
// вещи — что уже показано, сколько держится и когда пора уходить. Что внутри
// плашки, стопка не знает: ей дают готовые узлы.
export default function ToastStack({
  items,
  copy,
  max = 4,
  hold = 6000,
  onOpen,
  className = '',
}: ToastStackProps) {
  const [live, setLive] = useState<LiveToast[]>([])
  // Кнопка держится на сцене после того, как ушла последняя плашка, — ровно на
  // время собственного ухода. Само же её появление СОСТОЯНИЕМ не управляется:
  // оно выводится в том же рендере, что и первая плашка (см. hideOn ниже).
  // Через эффект кнопка приезжала на рендер позже и толкала колонку вверх
  // посреди прихода плашки — приход и получался дёрганым.
  const [hideLingers, setHideLingers] = useState(false)
  const [paused, setPaused] = useState(false)
  // что уже проходило через стопку. Первый заход только помечает — он же и есть
  // «на момент запуска»
  const seen = useRef<Set<string>>(new Set())
  const started = useRef(false)

  const startLeave = useCallback((key: string) => {
    setLive((prev) => prev.map((l) => (l.key === key ? { ...l, leaving: true } : l)))
  }, [])

  useEffect(() => {
    if (!started.current) {
      started.current = true
      for (const it of items) seen.current.add(it.id)
      return
    }
    const fresh = items.filter((it) => !seen.current.has(it.id))
    if (fresh.length === 0) return
    for (const it of fresh) seen.current.add(it.id)
    setLive((prev) => {
      const next = [...prev, ...fresh.map((it) => ({ key: it.id, node: it.node, leaving: false }))]
      // перебор гасим с головы очереди: первым пришло — первым ушло
      let over = next.filter((l) => !l.leaving).length - max
      return next.map((l) => {
        if (l.leaving || over <= 0) return l
        over -= 1
        return { ...l, leaving: true }
      })
    })
  }, [items, max])

  // Сроки. Наведение мышью снимает их со всех плашек, увод — заводит заново с
  // полного срока: читать под уезжающий отсчёт нельзя, а гнаться за остатком
  // ради секунды точности значит завести в ките часы, которых у него нет.
  const timers = useRef(new Map<string, number>())
  useEffect(() => {
    const map = timers.current
    if (paused) {
      for (const id of map.values()) clearTimeout(id)
      map.clear()
      return
    }
    for (const l of live) {
      if (l.leaving || map.has(l.key)) continue
      map.set(
        l.key,
        window.setTimeout(() => startLeave(l.key), hold),
      )
    }
    for (const [key, id] of map) {
      if (!live.some((l) => l.key === key && !l.leaving)) {
        clearTimeout(id)
        map.delete(key)
      }
    }
  }, [live, paused, hold, startLeave])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const id of map.values()) clearTimeout(id)
      map.clear()
    }
  }, [])

  // Сдвиг соседей. Плашки разной высоты, поэтому ехать «на шаг» нечем: у каждой
  // своя дельта. Меряем место до и после перерисовки и доигрываем разницу
  // (flyFrom — тот же FLIP, что у карт). Новая плашка сюда не попадает: ей
  // прошлого места неоткуда взять, у неё свой приход.
  // кнопка на сцене, пока есть плашки — и ещё немного после последней
  const hideOn = live.length > 0 || hideLingers
  useEffect(() => {
    if (live.length > 0) setHideLingers(true)
  }, [live.length])

  const nodes = useRef(new Map<string, HTMLElement>())
  const rects = useRef(new Map<string, DOMRect>())
  useLayoutEffect(() => {
    for (const [key, el] of nodes.current) {
      const now = el.getBoundingClientRect()
      const was = rects.current.get(key)
      if (was && Math.abs(was.top - now.top) > 0.5) {
        play('flyFrom', el, { from: was, duration: 240 })
      }
      rects.current.set(key, now)
    }
    for (const key of [...rects.current.keys()]) {
      if (!nodes.current.has(key)) rects.current.delete(key)
    }
  })

  // Пока кнопка доигрывает уход, стопка остаётся на сцене — иначе снятие
  // оборвало бы анимацию, ради которой всё и затевалось.
  if (!hideOn) return null

  return (
    <div className={`${styles.stack} ${className}`}>
      {/* список ловит мышь ровно своей высотой — пустое место стопки остаётся
          столу; наведение на него же и останавливает сроки. role="log" здесь по
          делу: это лента приходящих записей, и скринридер должен её читать */}
      <div
        className={styles.list}
        role="log"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {live.map((l) => (
          <div
            key={l.key}
            ref={(el) => {
              if (el) nodes.current.set(l.key, el)
              else nodes.current.delete(l.key)
            }}
          >
            <Toast
              leaving={l.leaving}
              onLeft={() => setLive((prev) => prev.filter((x) => x.key !== l.key))}
              onClick={onOpen}
            >
              {l.node}
            </Toast>
          </div>
        ))}
      </div>
      {hideOn && (
        <HideButton
          leaving={live.length === 0}
          onLeft={() => setHideLingers(false)}
          label={copy.hide}
          onClick={() => setLive((prev) => prev.map((l) => ({ ...l, leaving: true })))}
        />
      )}
    </div>
  )
}

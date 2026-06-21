import { cardById, cardCanTarget } from '@/cards'
import Arrow from '@/primitives/Arrow'
import Card from '@/primitives/Card'
import type { CardData } from '@release/ui'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import styles from './ArrowStory.module.css'

interface Point {
  x: number
  y: number
}

const SOURCE = cardById('attack-security-bug')! // целится только то, что умеет (атака)
const TARGETS = [
  { id: 't1', label: 'свежий релиз' },
  { id: 't2', label: 'рука оппонента' },
  { id: 't3', label: 'monitoring' },
]

export default function ArrowStory() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  const [active, setActive] = useState<CardData | null>(null) // карта, которой целимся, или null
  const [from, setFrom] = useState<Point | null>(null)
  const [to, setTo] = useState<Point | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const color = active ? `var(--cat-${active.category})` : 'var(--brand-green)'

  useEffect(() => {
    if (!active) return
    const onMove = (e: MouseEvent) => setTo({ x: e.clientX, y: e.clientY })
    const onDown = () => {
      setActive(null)
      setHovered(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
    }
  }, [active])

  const arm = (e: React.MouseEvent, card: CardData) => {
    if (!cardCanTarget(card)) return // релиз не выбирает цель
    e.stopPropagation()
    const r = refs.current[card.id]!.getBoundingClientRect()
    setFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    setTo({ x: e.clientX, y: e.clientY })
    setActive(card)
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Клик по карте атаки — стрелка идёт за курсором. Наведи на цель — она подсветится цветом
        карты. Клик ещё раз — отмена.
      </p>

      <div className={styles.stage}>
        <div
          ref={(el) => {
            refs.current[SOURCE.id] = el
          }}
          className={styles.src}
          onMouseDown={(e) => arm(e, SOURCE)}
        >
          <Card card={SOURCE} interactive={false} width="150px" />
        </div>

        <div className={styles.targets}>
          {TARGETS.map((t) => {
            const lit = active && hovered === t.id
            return (
              <div
                key={t.id}
                className={`${styles.target} ${lit ? styles.targeted : ''}`}
                style={lit ? ({ '--hl': color } as CSSProperties) : undefined}
                onMouseEnter={() => active && setHovered(t.id)}
                onMouseLeave={() => setHovered((h: string | null) => (h === t.id ? null : h))}
              >
                {t.label}
              </div>
            )
          })}
        </div>
      </div>

      {active && <Arrow from={from} to={to} color={color} />}
    </div>
  )
}

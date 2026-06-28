import type { CardData } from '@release/ui'
import type React from 'react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cardById } from '@/cards'
import Arrow, { centerOf, useArrow } from '@/primitives/Arrow'
import Card from '@/primitives/Card'
import styles from './ArrowStory.module.css'

// Демонстрация цветовой цепочки: цвет карты (по группе) → цвет стрелки → цвет
// выделения цели. Карты четырёх цветов: красная (attack), оранжевая (operation),
// жёлтая (support), зелёная (release). Цели обезличены — это просто зоны.
const SOURCES = ['attack-security-bug', 'operation-git-branch', 'support-sudo', 'release-frontend']
  // biome-ignore lint/style/noNonNullAssertion: все id — из каталога
  .map((id) => cardById(id)!)

const TARGETS = ['зона 1', 'зона 2', 'зона 3']

export default function ArrowStory() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  // геометрия и слежение за курсором — общий хук стрелки
  const { from, to, active, aim, stop } = useArrow()
  const [armed, setArmed] = useState<CardData | null>(null) // какой картой целимся (для цвета)
  const [hovered, setHovered] = useState<string | null>(null)

  const color = armed ? `var(--cat-${armed.category})` : 'var(--brand-green)'

  // клик в пустоту — отмена прицеливания
  useEffect(() => {
    if (!active) return
    const onDown = () => {
      setArmed(null)
      setHovered(null)
      stop()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [active, stop])

  const arm = (e: React.MouseEvent, card: CardData) => {
    e.stopPropagation()
    const el = refs.current[card.id]
    if (!el) return
    aim(centerOf(el), { x: e.clientX, y: e.clientY })
    setArmed(card)
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Клик по карте — стрелка её цвета идёт за курсором. Наведи на зону — она подсветится тем же
        цветом (обводка + свечение, как у обложки). Клик ещё раз — отмена.
      </p>

      <div className={styles.stage}>
        <div className={styles.sources}>
          {SOURCES.map((card) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only targeting demo (drag an arrow); sandbox story
            <div
              key={card.id}
              ref={(el) => {
                refs.current[card.id] = el
              }}
              className={styles.src}
              onMouseDown={(e) => arm(e, card)}
            >
              <Card card={card} interactive={false} width="130px" />
            </div>
          ))}
        </div>

        <div className={styles.targets}>
          {TARGETS.map((label) => {
            const lit = active && hovered === label
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only hover target for the arrow demo; sandbox story
              <div
                key={label}
                className={`${styles.target} ${lit ? styles.targeted : ''}`}
                style={lit ? ({ '--hl': color } as CSSProperties) : undefined}
                onMouseEnter={() => active && setHovered(label)}
                onMouseLeave={() => setHovered((h: string | null) => (h === label ? null : h))}
              >
                {label}
              </div>
            )
          })}
        </div>
      </div>

      {active && <Arrow from={from} to={to} color={color} />}
    </div>
  )
}

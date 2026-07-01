import type { CardData } from '@release/ui'
import type React from 'react'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { cardById } from '@/cards'
import Arrow, { centerOf, useArrow } from '@/primitives/Arrow'
import Card from '@/primitives/Card'
import { type Lang, pick, useLang } from '../../Playground/lang'
import styles from './ArrowStory.module.css'

type Loc = Record<Lang, string>

// Color-chain demo: card color (by group) → arrow color → target highlight color.
// Cards of four colors: red (attack), orange (operation), yellow (support),
// green (release). Targets are impersonal — just zones.
const SOURCES = ['attack-security-bug', 'operation-git-branch', 'support-sudo', 'release-frontend']
  // biome-ignore lint/style/noNonNullAssertion: all ids are from the catalog
  .map((id) => cardById(id)!)

const TARGETS: { id: string; label: Loc }[] = [
  { id: 'z1', label: { ru: 'зона 1', en: 'zone 1' } },
  { id: 'z2', label: { ru: 'зона 2', en: 'zone 2' } },
  { id: 'z3', label: { ru: 'зона 3', en: 'zone 3' } },
]

export default function ArrowStory() {
  const { lang } = useLang()
  const refs = useRef<Record<string, HTMLDivElement | null>>({})
  // geometry and cursor tracking — the shared arrow hook
  const { from, to, active, aim, stop } = useArrow()
  const [armed, setArmed] = useState<CardData | null>(null) // which card we aim with (for color)
  const [hovered, setHovered] = useState<string | null>(null)

  const color = armed ? `var(--cat-${armed.category})` : 'var(--brand-green)'

  // click on empty space — cancel aiming
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
        {pick(lang, {
          ru: 'Клик по карте — стрелка её цвета идёт за курсором. Наведи на зону — она подсветится тем же цветом (обводка + свечение, как у обложки). Клик ещё раз — отмена.',
          en: 'Click a card — an arrow in its color follows the cursor. Hover a zone — it lights up in the same color (outline + glow, like the cover). Click again — cancel.',
        })}
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
          {TARGETS.map((target) => {
            const lit = active && hovered === target.id
            return (
              // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only hover target for the arrow demo; sandbox story
              <div
                key={target.id}
                className={`${styles.target} ${lit ? styles.targeted : ''}`}
                style={lit ? ({ '--hl': color } as CSSProperties) : undefined}
                onMouseEnter={() => active && setHovered(target.id)}
                onMouseLeave={() => setHovered((h: string | null) => (h === target.id ? null : h))}
              >
                {target.label[lang]}
              </div>
            )
          })}
        </div>
      </div>

      {active && <Arrow from={from} to={to} color={color} />}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import Card from '@/primitives/Card'
import Arrow from '@/primitives/Arrow'
import { cardById, cardCanTarget } from '@/cards'
import styles from './ArrowStory.module.css'

const SOURCE = cardById('attack-security-bug') // целится только то, что умеет (атака)
const TARGETS = [
  { id: 't1', label: 'свежий релиз' },
  { id: 't2', label: 'рука оппонента' },
  { id: 't3', label: 'monitoring' },
]

export default function ArrowStory() {
  const refs = useRef({})
  const [active, setActive] = useState(null) // карта, которой целимся, или null
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [hovered, setHovered] = useState(null)

  const color = active ? `var(--cat-${active.category})` : 'var(--brand-green)'

  useEffect(() => {
    if (!active) return
    const onMove = (e) => setTo({ x: e.clientX, y: e.clientY })
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

  const arm = (e, card) => {
    if (!cardCanTarget(card)) return // релиз не выбирает цель
    e.stopPropagation()
    const r = refs.current[card.id].getBoundingClientRect()
    setFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    setTo({ x: e.clientX, y: e.clientY })
    setActive(card)
  }

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        Клик по карте атаки — стрелка идёт за курсором. Наведи на цель — она
        подсветится цветом карты. Клик ещё раз — отмена.
      </p>

      <div className={styles.stage}>
        <div
          ref={(el) => (refs.current[SOURCE.id] = el)}
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
                style={lit ? { '--hl': color } : undefined}
                onMouseEnter={() => active && setHovered(t.id)}
                onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
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

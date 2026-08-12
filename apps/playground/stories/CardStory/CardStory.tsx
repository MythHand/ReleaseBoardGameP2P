import type { CategoryId } from '@release/ui'
import { type CSSProperties, useState } from 'react'
import { CARDS, CATEGORIES } from '@/cards'
import Card from '@/primitives/Card'
import { useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechHint, TechSwitch, TechToggle } from '../controls/TechControls'
import styles from './CardStory.module.css'

type CardState = 'idle' | 'playable' | 'selected' | 'disabled'
const STATES: CardState[] = ['idle', 'playable', 'selected', 'disabled']

const COPY = {
  ru: {
    tilt: 'наклон',
    hint: 'OG-лица: плоский PNG-арт (без сборных слоёв). Наведи — подъём + наклон. Карты сегментированы по типам.',
  },
  en: {
    tilt: 'tilt',
    hint: 'OG faces: flat PNG art (no composed layers). Hover — lift + tilt. Cards are segmented by type.',
  },
}

// category order for segmentation
const ORDER: CategoryId[] = [
  'release',
  'attack',
  'defense',
  'protection',
  'operation',
  'support',
  'trigger',
  'ai',
]

export default function CardStory() {
  const { lang } = useLang()
  const t = COPY[lang]
  const [state, setState] = useState<CardState>('idle')
  const [tilt, setTilt] = useState(true)

  const groups = ORDER.map((cat) => ({
    cat,
    label: CATEGORIES[cat].label,
    accent: CATEGORIES[cat].accent,
    cards: CARDS.filter((c) => c.category === cat),
  })).filter((g) => g.cards.length)

  return (
    <div className={styles.root}>
      <TechBar>
        <TechToggle on={tilt} onChange={setTilt}>
          {t.tilt}
        </TechToggle>
        <TechSwitch
          options={STATES.map((s) => ({ value: s, label: s }))}
          value={state}
          onChange={setState}
        />
        <TechHint>{t.hint}</TechHint>
      </TechBar>

      <div className={styles.body}>
        {groups.map((g) => (
          <section key={g.cat} className={styles.group}>
            <h3 className={styles.divider} style={{ '--accent': g.accent } as CSSProperties}>
              <span className={styles.dividerLabel}>{g.label}</span>
              <span className={styles.dividerLine} />
              <span className={styles.count}>{g.cards.length}</span>
            </h3>
            <div className={styles.grid}>
              {g.cards.map((card) => (
                <div key={card.id} className={styles.cell}>
                  <Card card={card} state={state} tilt={tilt} png />
                  <div className={styles.cap}>
                    {card.name} · {card.category}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

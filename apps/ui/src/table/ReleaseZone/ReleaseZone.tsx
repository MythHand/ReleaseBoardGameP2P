import type { CSSProperties, MouseEvent } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import CardPair from '@/primitives/CardPair'
import styles from './ReleaseZone.module.css'

export interface ReleaseSlots {
  frontend?: CardType | null
  backend?: CardType | null
  database?: CardType | null
  // отдельный слот под защитную карту Monitoring (в зоне релиза, но не Release)
  monitoring?: CardType | null
}

// Карта поддержки, положенная ВМЕСТЕ с релизом в тот же слот — по правилам это
// Code Review и Monitoring. Слот показывает их парой: релиз сверху, поддержка
// выглядывает из-под него.
export type ReleaseSupport = Partial<Record<keyof ReleaseSlots, CardType | null>>

interface ReleaseZoneProps {
  release?: ReleaseSlots
  // что положено вместе с релизом в тот же слот (см. ReleaseSupport)
  support?: ReleaseSupport
  size?: string
  // compact — карты в 1.4× меньше, подпись пустого слота вертикальная
  variant?: 'default' | 'compact'
  // per-slot DOM node — so a consumer can measure a slot and fly a card into it
  // (e.g. an AI Release / Monitoring landing in its slot). Purely a position hook;
  // no visual effect.
  slotRef?: (key: keyof ReleaseSlots, el: HTMLDivElement | null) => void
  // упрощённое чтение карт в зоне (LOD). Решает ПОТРЕБИТЕЛЬ: чужая зона —
  // мебель, её карты читать не нужно; своя зона по умолчанию остаётся полной.
  lod?: boolean
  // ===== состояние и жест: зона ОТРАЖАЕТ то, что решил потребитель, и отдаёт
  // ему нажатие — та же модель, что у Hand (stateAt / accentAt / onCardDown). =====
  // цвет свечения слота: карту отсюда сейчас можно взять. undefined — покоя
  accentAt?: (key: keyof ReleaseSlots) => string | undefined
  // карта из слота сейчас поднята (её несёт флаер потребителя) — слот показывает
  // своё пустое место, чтобы зона не мигала дырой
  liftedAt?: (key: keyof ReleaseSlots) => boolean
  // нажатие на занятый слот — жест забирает потребитель
  onSlotDown?: (key: keyof ReleaseSlots, e: MouseEvent<HTMLDivElement>) => void
}

const SLOTS: [keyof ReleaseSlots, string][] = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['database', 'Database'],
  ['monitoring', 'Monitoring'],
]

// Зона релиза игрока: по одному слоту на тип. Пустой слот — место под релиз.
// compact-вариант: карты в 1.4× меньше, подпись пустого слота повёрнута вертикально.
export default function ReleaseZone({
  release = {},
  support = {},
  size = '84px',
  variant = 'default',
  slotRef,
  lod = false,
  accentAt,
  liftedAt,
  onSlotDown,
}: ReleaseZoneProps) {
  const compact = variant === 'compact'
  const slotSize = compact ? `calc(${size} / 1.4)` : size
  return (
    <div className={`${styles.zone} ${compact ? styles.compact : ''}`}>
      {SLOTS.map(([key, label]) => {
        const card = release[key]
        const aux = support[key]
        const accent = accentAt?.(key)
        const shown = card && !liftedAt?.(key)
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only grab of a card lying in the zone; the consumer owns the real interaction
          <div
            key={key}
            className={`${styles.slot} ${accent ? styles.grabbable : ''}`}
            style={{ width: slotSize, ...(accent ? { '--accent': accent } : {}) } as CSSProperties}
            ref={(el) => slotRef?.(key, el)}
            onMouseDown={card && onSlotDown ? (e) => onSlotDown(key, e) : undefined}
          >
            {shown ? (
              aux ? (
                <CardPair main={card} aux={aux} width="100%" />
              ) : (
                <Card card={card} interactive={false} width="100%" lod={lod} />
              )
            ) : (
              <div className={styles.empty}>{label}</div>
            )}
            {/* the highlight is a layer INSIDE the slot, so it is drawn on the card's
                own box and its radius scales with the card (see the module CSS) */}
            <span className={styles.glow} aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}

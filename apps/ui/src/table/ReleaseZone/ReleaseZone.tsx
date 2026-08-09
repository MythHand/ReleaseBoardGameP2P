import type { CSSProperties, MouseEvent } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import CardPair from '@/primitives/CardPair'
import type { ReleaseSlotId, TableTarget } from '@/table/Table/intents'
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
  // ===== the OTHER way a slot can be acted on: not a grab, a pick. The engine
  // says which targets are legal and the zone reflects exactly those. The two
  // models do not overlap — a scene drives the grab, the game drives the pick. =====
  // whose release zone this is — needed to build the `release`/`monitoring`
  // targets a slot click emits. Omitted → the zone is purely decorative.
  player?: string
  // legality is the engine's answer: a slot highlights and accepts a click
  // only when its target appears in `targets`, never by inspecting the card.
  onPick?: (target: TableTarget) => void
  targets?: TableTarget[]
}

const SLOTS: [keyof ReleaseSlots, string][] = [
  ['frontend', 'Frontend'],
  ['backend', 'Backend'],
  ['database', 'Database'],
  ['monitoring', 'Monitoring'],
]

function targetFor(player: string, key: keyof ReleaseSlots): TableTarget {
  return key === 'monitoring'
    ? { kind: 'monitoring', player }
    : { kind: 'release', player, slot: key as ReleaseSlotId }
}

function sameTarget(a: TableTarget, b: TableTarget): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'release' && b.kind === 'release') {
    return a.player === b.player && a.slot === b.slot
  }
  if (a.kind === 'monitoring' && b.kind === 'monitoring') return a.player === b.player
  return false
}

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
  player,
  onPick,
  targets = [],
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
        const target = player == null ? null : targetFor(player, key)
        const targetable = target != null && targets.some((t) => sameTarget(t, target))
        const pick = (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          if (target) onPick?.(target)
        }
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: actionable slots get role=button + onKeyDown + tabIndex below; the pointer-only grab is the consumer's own interaction; a slot that is neither is presentational
          <div
            key={key}
            className={`${styles.slot} ${accent ? styles.grabbable : ''} ${
              targetable ? styles.targetable : ''
            }`}
            style={{ width: slotSize, ...(accent ? { '--accent': accent } : {}) } as CSSProperties}
            ref={(el) => slotRef?.(key, el)}
            onMouseDown={card && onSlotDown ? (e) => onSlotDown(key, e) : undefined}
            onClick={targetable ? pick : undefined}
            onKeyDown={
              targetable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') pick(e)
                  }
                : undefined
            }
            role={targetable ? 'button' : undefined}
            tabIndex={targetable ? 0 : undefined}
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

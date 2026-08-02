import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import type { ReleaseSlotId, TableTarget } from '@/table/Table/intents'
import styles from './ReleaseZone.module.css'

export interface ReleaseSlots {
  frontend?: CardType | null
  backend?: CardType | null
  database?: CardType | null
  // отдельный слот под защитную карту Monitoring (в зоне релиза, но не Release)
  monitoring?: CardType | null
}

interface ReleaseZoneProps {
  release?: ReleaseSlots
  size?: string
  // compact — карты в 1.4× меньше, подпись пустого слота вертикальная
  variant?: 'default' | 'compact'
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
  size = '84px',
  variant = 'default',
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
        const target = player == null ? null : targetFor(player, key)
        const targetable = target != null && targets.some((t) => sameTarget(t, target))
        const pick = (e: { stopPropagation: () => void }) => {
          e.stopPropagation()
          if (target) onPick?.(target)
        }
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: actionable slots get role=button + onKeyDown + tabIndex below; non-targetable slots are presentational (no handlers)
          <div
            key={key}
            className={`${styles.slot} ${targetable ? styles.targetable : ''}`}
            style={{ width: slotSize }}
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
            {card ? (
              <Card card={card} interactive={false} width="100%" />
            ) : (
              <div className={styles.empty}>{label}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

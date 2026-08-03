import type { CSSProperties, Ref } from 'react'
import { restTransform, type Scatter } from '@/animations'
import ReleaseLogo from '@/brand/ReleaseLogo'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import Typography from '@/primitives/Typography'
import styles from './DiscardHeap.module.css'

// One card lying in the heap: the card plus the Scatter it rests at — the SAME
// Scatter its incoming flight was built from (animations/scatter.ts), which is
// what couples «where it landed» to «where it lies».
export interface DiscardCard extends Scatter {
  card: CardType
  // stable key when the consumer has one; otherwise the heap index is used
  // (the heap is append-only, so the index is stable too)
  uid?: string
}

interface DiscardHeapProps {
  cards: DiscardCard[]
  // number → px; string passes through (e.g. '100%'). 116 = the table canon.
  width?: number | string
  // подпись под стопкой (компонент i18n-agnostic — текст приходит пропом)
  label?: string
  // язык логотипа в пустом сбросе
  logoVariant?: 'ru' | 'en'
  // значение бейджа; по умолчанию — число карт. Отдельный проп нужен, когда
  // видимых карт меньше, чем в сбросе (maxVisible), а счётчик показывает всё.
  count?: number
  showCount?: boolean
  // карты собираются в ровную стопку (сброс превращается в колоду) — разброс
  // уходит транзишеном, а не мгновенной подменой
  gathered?: boolean
  // сколько верхних карт кучи рисовать (HEAP_SHOW); по умолчанию — все
  maxVisible?: number
  // принудительно пустое состояние при непустой куче (сброс временно скрыт)
  empty?: boolean
  // DOM-узел коробки стопки — в него целятся полёты в сброс
  stackRef?: Ref<HTMLDivElement>
}

/**
 * Сброс — наброшенная куча карт (не ровная стопка `Pile`): карты лежат со своим
 * разбросом, поверх — бейдж счётчика, под ней — подпись. Пустая куча показывает
 * ту же зону, что и пустой сброс `Pile`: дашед-слот с логотипом.
 *
 * Единственный источник этого блока — раньше каждая интерактивная сцена
 * собирала его у себя, и копии разъезжались.
 */
export default function DiscardHeap({
  cards,
  width = 116,
  label,
  logoVariant = 'ru',
  count,
  showCount = true,
  gathered = false,
  maxVisible,
  empty = false,
  stackRef,
}: DiscardHeapProps) {
  const visible = maxVisible == null ? cards : cards.slice(-maxVisible)
  const total = count ?? cards.length
  const isEmpty = empty ? true : cards.length === 0
  return (
    <div
      className={styles.heap}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      <div className={styles.stack} ref={stackRef}>
        {isEmpty ? (
          <div className={styles.emptyZone}>
            <ReleaseLogo className={styles.emptyLogo} variant={logoVariant} blink={false} />
          </div>
        ) : (
          <>
            {visible.map((c, i) => (
              <div
                key={c.uid ?? i}
                className={styles.card}
                // I9 — слой карты это её значение, а не порядок в DOM
                style={
                  {
                    transform: gathered ? 'translate(0, 0) rotate(0deg)' : restTransform(c),
                    zIndex: i,
                  } as CSSProperties
                }
              >
                <Card card={c.card} interactive={false} width="100%" />
              </div>
            ))}
            {showCount && total > 0 && (
              <Typography base="mono-lg" tk="tk-02" className={styles.count}>
                {total}
              </Typography>
            )}
          </>
        )}
      </div>
      {label && (
        <Typography base="pile-label" tk="tk-08" className={styles.label}>
          {label}
        </Typography>
      )}
    </div>
  )
}

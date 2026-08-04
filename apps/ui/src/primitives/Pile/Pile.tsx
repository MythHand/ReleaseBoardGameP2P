import type { CSSProperties, Ref } from 'react'
import { restTransform, type Scatter } from '@/animations'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { COVERS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './Pile.module.css'

// Одна карта, лежащая в куче сброса: карта плюс разброс, с которым она лежит —
// ТОТ ЖЕ разброс, из которого был собран её прилёт (animations/scatter). Поэтому
// карта лежит ровно там, где приземлилась, без подмены позиции в финале.
export interface HeapCard extends Scatter {
  card: CardType
  // стабильный ключ — нужен там, где из сброса ВЫНИМАЮТ карты (Inside,
  // cherry-pick): по индексу перекладка пошла бы по чужим узлам
  uid?: string
}

interface PileProps {
  label?: string
  count?: number
  deck?: 'base' | 'ai'
  topCard?: CardType | null
  // number → px (formatted here); string passes through (e.g. '100%')
  width?: number | string
  /** 'br' — бейдж в правом нижнем (сброс) | 'tl' — текст в левом верхнем (колоды) */
  countPos?: 'br' | 'tl'
  /** выделение обложки: обводка + свечение в цвете accent (как у Card) */
  selected?: boolean
  accent?: string
  /** язык логотипа пустого сброса (примитив i18n-agnostic — вариант приходит пропом) */
  logoVariant?: 'ru' | 'en'
  /**
   * Сброс на столе — не ровная стопка, а наброшенная КУЧА: карты лежат каждая
   * со своим разбросом. Непустая куча заменяет собой верх стопки.
   */
  heap?: HeapCard[]
  /**
   * Ограничить кучу верхними N картами — те, что под ними, сливаются в слои
   * глубины. По умолчанию НЕ ограничена: разбросанная куча целиком и есть вид
   * сброса. Срез (обычно `HEAP_SHOW`) включает тот, у кого в сбросе десятки
   * карт и рисовать их все бессмысленно.
   */
  heapShow?: number
  /** куча собирается в ровную стопку — сброс превращается в колоду */
  gathered?: boolean
  /** DOM-узел коробки карты — в него целятся полёты в эту стопку */
  boxRef?: Ref<HTMLDivElement>
}

// Стопка карт: колода (рубашкой вверх), сброс (куча лицом вверх) или пустая зона.
// Показывает «глубину» стопки + счётчик + подпись.
export default function Pile({
  label,
  count = 0,
  deck = 'base',
  topCard = null,
  width = 88,
  countPos = 'br',
  selected = false,
  accent = 'var(--brand-green)',
  logoVariant = 'ru',
  heap,
  heapShow,
  gathered,
  boxRef,
}: PileProps) {
  const cards = heap ?? []
  // вся куча целиком, если срез не задан; иначе верх, а остальное — «глубина»
  const visible = heapShow != null && cards.length > heapShow ? cards.slice(-heapShow) : cards
  // Пустой сброс — это не стопка, а обозначение зоны: плоский дашед-слот с
  // полупрозрачным логотипом (никакой «глубины», обложек и свечения).
  const emptyDiscard = !topCard && cards.length === 0 && countPos === 'br'
  // глубина под верхом: у колоды и у верхней карты — всегда; у кучи — только
  // когда под видимыми картами действительно что-то лежит
  const showDepth = !emptyDiscard && (cards.length === 0 || cards.length > visible.length)
  return (
    <div
      className={styles.pile}
      style={{ width: typeof width === 'number' ? `${width}px` : width }}
    >
      {/* The card box. The counter badge lives HERE and not inside .stack: there
          container-type (for the cqw radii) brings containment, which traps any
          layer set inside the stack. From the box it clears the whole pile with one
          layer of its own (.count) — no consumer has to pass one. */}
      <div className={styles.box}>
        <div
          className={styles.stack}
          ref={boxRef}
          data-selected={selected}
          style={{ '--accent': accent } as CSSProperties}
        >
          {showDepth && (
            <>
              <span className={styles.layer} aria-hidden="true" />
              <span className={styles.layer} aria-hidden="true" />
            </>
          )}
          {visible.length > 0 ? (
            visible.map((c, i) => (
              <div
                key={c.uid ?? i}
                className={styles.heapCard}
                // переезд в ровную стопку — только там, где это и есть эффект
                data-gathers={gathered != null}
                // слой карты — её собственное значение, а не порядок в DOM
                style={{
                  transform: gathered ? 'translate(0, 0) rotate(0deg)' : restTransform(c),
                  zIndex: i,
                }}
              >
                <Card card={c.card} interactive={false} width="100%" />
              </div>
            ))
          ) : (
            <div className={styles.top}>
              {topCard ? (
                <Card card={topCard} interactive={false} width="100%" />
              ) : emptyDiscard ? (
                <div className={styles.emptyZone}>
                  <ReleaseLogo className={styles.emptyLogo} variant={logoVariant} blink={false} />
                </div>
              ) : (
                <img
                  className={styles.back}
                  src={COVERS[deck] ?? COVERS.base}
                  alt=""
                  draggable={false}
                />
              )}
            </div>
          )}
          {/* выделение обложки — поверх стопки, по краям карты */}
          {!emptyDiscard && <span className={styles.glow} aria-hidden="true" />}
        </div>
        {count > 0 && (
          <span className={`${styles.count} ${countPos === 'tl' ? styles.tl : styles.br}`}>
            {count}
          </span>
        )}
      </div>
      {label && <div className={styles.label}>{label}</div>}
    </div>
  )
}

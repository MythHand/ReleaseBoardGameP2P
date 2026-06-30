import type { CSSProperties } from 'react'
import ReleaseLogo from '@/brand/ReleaseLogo'
import { COVERS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './Pile.module.css'

interface PileProps {
  label?: string
  count?: number
  deck?: 'base' | 'ai'
  topCard?: CardType | null
  width?: string
  /** 'br' — бейдж в правом нижнем (сброс) | 'tl' — текст в левом верхнем (колоды) */
  countPos?: 'br' | 'tl'
  /** выделение обложки: обводка + свечение в цвете accent (как у Card) */
  selected?: boolean
  accent?: string
  /** язык логотипа пустого сброса (примитив i18n-agnostic — вариант приходит пропом) */
  logoVariant?: 'ru' | 'en'
}

// Стопка карт: колода (рубашкой вверх) или сброс (верхняя карта лицом).
// Показывает «глубину» стопки + счётчик + подпись.
export default function Pile({
  label,
  count = 0,
  deck = 'base',
  topCard = null,
  width = '88px',
  countPos = 'br',
  selected = false,
  accent = 'var(--brand-green)',
  logoVariant = 'ru',
}: PileProps) {
  // Пустой сброс — это не стопка, а обозначение зоны: плоский дашед-слот с
  // полупрозрачным логотипом (никакой «глубины», обложек и свечения).
  const emptyDiscard = !topCard && countPos === 'br'
  return (
    <div className={styles.pile} style={{ width }}>
      <div
        className={styles.stack}
        data-selected={selected}
        style={{ '--accent': accent } as CSSProperties}
      >
        {!emptyDiscard && (
          <>
            <span className={styles.layer} aria-hidden="true" />
            <span className={styles.layer} aria-hidden="true" />
          </>
        )}
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
        {/* выделение обложки — поверх стопки, по краям карты */}
        {!emptyDiscard && <span className={styles.glow} aria-hidden="true" />}
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

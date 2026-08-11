import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import styles from './CardCatalog.module.css'

// КАТАЛОГ ВЫБОРА КАРТЫ — набор карт лицом вверх, из которого называют одну.
// Не веер и не куча: карты разложены, чтобы их прочитали и сравнили, поэтому по
// ховеру ячейка вырастает до читаемого размера, а не поднимается.
//
// Жизнь каталога — три состояния, и они выражены двумя пропсами:
//   open                — выбор идёт: все ячейки живые и кликабельные;
//   !open + chosen       — выбор сделан: названная держится увеличенной, пока
//                          остальные уезжают вниз;
//   !open без chosen     — уходит весь каталог.
// selected — то, на чём выбор ЗАРЯЖЕН, но ещё не подтверждён (карта светится
// цветом выбора). Подтверждение — снаружи, обычно через ConfirmAction: назвать
// карту необратимо.
//
// Блок отвечает за сетку и за то, как ячейка живёт; ГДЕ каталог стоит на экране —
// дело потребителя (оборачивает своим позиционированным контейнером).
export interface CardCatalogProps {
  cards: CardType[]
  // выбор ещё идёт
  open: boolean
  // на чём заряжен выбор (id карты)
  selected?: string | null
  // что названо после подтверждения — держится, пока остальные уходят
  chosen?: string | null
  onPick?: (card: CardType) => void
  // ширина карты в ячейке
  width?: number
  // задержка появления между соседними ячейками
  stagger?: number
}

export default function CardCatalog({
  cards,
  open,
  selected,
  chosen,
  onPick,
  width = 100,
  stagger = 18,
}: CardCatalogProps) {
  const cellClass = (id: string) => {
    if (open) return styles.cell
    if (id === chosen) return `${styles.cell} ${styles.chosen}`
    return `${styles.cell} ${styles.leaving}`
  }

  return (
    <div className={styles.grid}>
      {cards.map((c, i) => (
        <button
          key={c.id}
          type="button"
          className={cellClass(c.id)}
          style={{ animationDelay: `${i * stagger}ms` }}
          onClick={open && onPick ? () => onPick(c) : undefined}
        >
          <Card
            card={c}
            interactive={false}
            width={width}
            state={open && selected === c.id ? 'selected' : 'idle'}
            // выбор одной из набора — единый цвет выбора, а не акцент категории
            accent="var(--select-accent)"
          />
        </button>
      ))}
    </div>
  )
}

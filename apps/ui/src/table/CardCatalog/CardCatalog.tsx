import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import CardPull from '@/table/CardPull/CardPull'
import type { HandPlayDrop } from '@/table/Hand/Hand'
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
  onDrop?: (card: CardType, drop: HandPlayDrop) => boolean
  // ширина карты в ячейке
  width?: number
  // задержка появления между соседними ячейками
  stagger?: number
  // A positioned, non-scrolling layer reserved by the consumer for reading.
  previewRoot?: RefObject<HTMLElement | null>
  // Keep a remote selection readable even outside this viewer’s scrollport.
  previewSelected?: boolean
}

export default function CardCatalog({
  cards,
  open,
  selected,
  chosen,
  onPick,
  onDrop,
  width = 100,
  stagger = 18,
  previewRoot,
  previewSelected = false,
}: CardCatalogProps) {
  const cells = useRef(new Map<string, HTMLDivElement>())
  const [reading, setReading] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    id: string
    root: HTMLElement
    left: number
    top: number
    width: number
  } | null>(null)
  const active = open ? (reading ?? (previewSelected ? selected : null)) : chosen

  useLayoutEffect(() => {
    const root = previewRoot?.current
    const cell = active ? cells.current.get(active) : undefined
    if (!root || !cell || !active) {
      setPreview(null)
      return
    }
    const measure = () => {
      const area = root.getBoundingClientRect()
      const source = cell.getBoundingClientRect()
      // Reserve the full selection glow and shadow around the card face.
      const margin = 24
      const ratio = 368 / 515
      const enlargedWidth = Math.min(
        width * (open ? 1.9 : 1.7),
        area.width - margin * 2,
        (area.height - margin * 2) * ratio,
      )
      if (enlargedWidth <= 0) {
        setPreview(null)
        return
      }
      const height = enlargedWidth / ratio
      const clamp = (value: number, end: number) => Math.max(margin, Math.min(value, end))
      setPreview({
        id: active,
        root,
        width: enlargedWidth,
        left: clamp(
          source.left + source.width / 2 - area.left - enlargedWidth / 2,
          area.width - margin - enlargedWidth,
        ),
        top: clamp(
          source.top + source.height / 2 - area.top - height / 2,
          area.height - margin - height,
        ),
      })
    }
    measure()
    // Scrolling changes what is under the pointer; never retain the old card
    // over a different row. A committed choice instead follows its source.
    const onScroll = () => (open ? setReading(null) : measure())
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [active, open, previewRoot, width])

  const previewCard = preview?.id === active ? cards.find((c) => c.id === active) : undefined
  const cellClass = (id: string) => {
    if (open) return styles.cell
    if (id === chosen) return `${styles.cell} ${styles.chosen}`
    return `${styles.cell} ${styles.leaving}`
  }

  return (
    <>
      <div className={`${styles.grid} ${previewRoot ? styles.floating : ''}`}>
        {cards.map((c, i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: decorative reading preview only; the nested button owns every action
          <div
            key={c.id}
            ref={(element) => {
              if (element) cells.current.set(c.id, element)
              else cells.current.delete(c.id)
            }}
            className={cellClass(c.id)}
            style={{ animationDelay: `${i * stagger}ms` }}
            onMouseEnter={(event) => {
              if (open && previewRoot && event.buttons === 0) setReading(c.id)
            }}
            onMouseMove={(event) => {
              if (open && previewRoot && event.buttons === 0) setReading(c.id)
            }}
            onMouseLeave={() => setReading(null)}
            onFocus={() => open && previewRoot && setReading(c.id)}
            onBlur={() => setReading(null)}
            onPointerDownCapture={() => onDrop && setReading(null)}
          >
            {onDrop ? (
              <CardPull
                card={c}
                label={c.name}
                width={width}
                disabled={!open}
                selected={selected === c.id}
                onDrop={(drop) => onDrop(c, drop)}
                onKeyboardPick={() => onPick?.(c)}
              />
            ) : (
              <button
                type="button"
                className={styles.choice}
                aria-label={c.name}
                aria-pressed={selected === c.id}
                disabled={!open}
                onClick={open && onPick ? () => onPick(c) : undefined}
              >
                <Card
                  card={c}
                  interactive={false}
                  width={width}
                  state={open && selected === c.id ? 'selected' : 'idle'}
                  accent="var(--select-accent)"
                />
              </button>
            )}
          </div>
        ))}
      </div>
      {preview &&
        previewCard &&
        createPortal(
          <div
            key={preview.id}
            data-catalog-preview
            aria-hidden="true"
            className={styles.preview}
            style={{ left: preview.left, top: preview.top, width: preview.width }}
          >
            <Card
              card={previewCard}
              interactive={false}
              width="100%"
              state={selected === previewCard.id ? 'selected' : 'idle'}
              accent="var(--select-accent)"
            />
          </div>,
          preview.root,
        )}
    </>
  )
}

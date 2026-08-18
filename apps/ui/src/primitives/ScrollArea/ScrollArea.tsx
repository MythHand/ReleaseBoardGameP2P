import 'overlayscrollbars/overlayscrollbars.css'
import { OverlayScrollbars, type PartialOptions } from 'overlayscrollbars'
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef } from 'react'
import styles from './ScrollArea.module.css'

export interface ScrollAreaHandle {
  // элемент, который на самом деле прокручивается: свой у него scrollTop, своя
  // высота. Нативный div больше не он — прокруткой владеет библиотека.
  viewport: () => HTMLElement | null
}

interface ScrollAreaProps {
  children: ReactNode
  // класс самой области: её место и размер в раскладке родителя
  className?: string
  // класс потока ВНУТРИ области — колонка, зазоры, отступы содержимого. Держать
  // раскладку на самой области нельзя: дети уезжают во внутренний viewport
  // библиотеки, и её собственный display до них не доходит.
  contentClassName?: string
  // прокрутка произошла — отдаём тот самый элемент, чтобы не искать его снаружи
  onScroll?: (viewport: HTMLElement) => void
  ref?: Ref<ScrollAreaHandle>
}

// Прокручиваемая область проекта: полоса лежит НАД содержимым, поэтому не
// съедает ширину и не двигает раскладку, и её не видно, пока не прокручивают.
// Тема `os-theme-release` живёт в global.css: класс библиотека ставит строкой, а
// модульный CSS хеширует имена — оттуда его было бы не видно.
//
// Библиотека берётся ЯДРОМ, без React-обёртки: `overlayscrollbars-react` стоит
// на 0.5.x с апреля 2024 и мажорной версии так и не получила, тогда как само
// ядро живое. Обёртка давала ровно то, что здесь занимает десяток строк —
// инициализацию на элементе и уборку за собой, — так что цена независимости
// от неё меньше, чем цена застрявшей зависимости в ките.
export default function ScrollArea({
  children,
  className = '',
  contentClassName,
  onScroll,
  ref,
}: ScrollAreaProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const osRef = useRef<OverlayScrollbars | null>(null)
  const viewport = () => osRef.current?.elements().viewport ?? null

  useImperativeHandle(ref, () => ({ viewport }))

  // Обработчик читается через ref, а не через замыкание эффекта: иначе новая
  // функция на каждом рендере пересоздавала бы всю прокрутку — а вместе с ней
  // и позицию, на которой стоял читатель.
  const scrollRef = useRef(onScroll)
  scrollRef.current = onScroll

  // Один экземпляр на всю жизнь области: элемент-хост не меняется, а опции
  // постоянны. Инициализация в эффекте — то же, что давало `defer` у обёртки:
  // узел к этому моменту уже в документе и его размеры измеримы.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const instance = OverlayScrollbars(el, OPTIONS, {
      scroll: (self) => scrollRef.current?.(self.elements().viewport),
    })
    osRef.current = instance
    return () => {
      instance.destroy()
      osRef.current = null
    }
  }, [])

  return (
    <div ref={hostRef} className={`${styles.area} ${className}`}>
      <div className={contentClassName}>{children}</div>
    </div>
  )
}

const OPTIONS: PartialOptions = {
  scrollbars: {
    theme: 'os-theme-release',
    // полосу видно только пока прокручивают, дальше она уходит сама
    autoHide: 'scroll',
    autoHideDelay: 600,
  },
}

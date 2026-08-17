import 'overlayscrollbars/overlayscrollbars.css'
import type { PartialOptions } from 'overlayscrollbars'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import { type ReactNode, type Ref, useImperativeHandle, useRef } from 'react'
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
export default function ScrollArea({
  children,
  className = '',
  contentClassName,
  onScroll,
  ref,
}: ScrollAreaProps) {
  const osRef = useRef<React.ComponentRef<typeof OverlayScrollbarsComponent>>(null)
  const viewport = () => osRef.current?.osInstance()?.elements().viewport ?? null

  useImperativeHandle(ref, () => ({ viewport }))

  return (
    <OverlayScrollbarsComponent
      ref={osRef}
      className={`${styles.area} ${className}`}
      defer
      options={OPTIONS}
      events={
        onScroll
          ? {
              scroll: (instance) => onScroll(instance.elements().viewport),
            }
          : undefined
      }
    >
      <div className={contentClassName}>{children}</div>
    </OverlayScrollbarsComponent>
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

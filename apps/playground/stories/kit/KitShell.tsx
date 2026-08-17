import type { ReactNode } from 'react'
import styles from './KitShell.module.css'

// Shared showcase-page frame: section tag, title, sections and cells.
// `tag` defaults to "ui kit"; block stories pass "block".
export function KitPage({
  title,
  tag = 'ui kit',
  children,
}: {
  title: string
  tag?: string
  children: ReactNode
}) {
  return (
    <div className={styles.page}>
      <div className={styles.tag}>{tag}</div>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </div>
  )
}

export function KitSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionH}>{title}</h2>
      <div className={styles.row}>{children}</div>
    </section>
  )
}

// `wide` — пример, которому узкая колонка ряда не годится: он занимает строку
// целиком и тянет своё тело на всю ширину страницы (сцена в углу, широкий стол).
export function KitCell({
  caption,
  wide = false,
  children,
}: {
  caption: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={`${styles.cell} ${wide ? styles.cellWide : ''}`}>
      <div className={styles.cellBody}>{children}</div>
      <span className={styles.caption}>{caption}</span>
    </div>
  )
}

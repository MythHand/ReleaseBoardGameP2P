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

export function KitCell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      <div className={styles.cellBody}>{children}</div>
      <span className={styles.caption}>{caption}</span>
    </div>
  )
}

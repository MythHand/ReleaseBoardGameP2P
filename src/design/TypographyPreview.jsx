import styles from './TypographyPreview.module.css'

// Документация по шрифтам и их применению. Живёт в песочнице.
const fonts = [
  {
    varName: '--font-heading',
    name: 'Onest',
    role: 'Заголовки',
    where: 'Заголовки карт, экранов и секций (настольная игра).',
    sample: 'Release любой ценой',
    cls: styles.heading,
  },
  {
    varName: '--font-text',
    name: 'Fira Mono',
    role: 'Основной текст',
    where: 'Тело карт, описания, подписи, HUD, история действий (настольная игра).',
    sample: 'Выложите эту карту в свою зону релиза. Для этого сбросьте 1 карту из руки.',
    cls: styles.text,
  },
  {
    varName: '--font-mono',
    name: 'JetBrains Mono',
    role: 'Терминал / лоадер',
    where: 'Только модуль загрузки (boot-экран). Шрифт лоадера — не затираем.',
    sample: '> booting release-engine … [ok]   PUSH',
    cls: styles.mono,
  },
]

export default function TypographyPreview() {
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>typography</h2>
      <div className={styles.list}>
        {fonts.map((f) => (
          <article key={f.varName} className={styles.item}>
            <header className={styles.meta}>
              <span className={styles.role}>{f.role}</span>
              <span className={styles.name}>{f.name}</span>
              <code className={styles.var}>{f.varName}</code>
            </header>
            <div className={f.cls}>{f.sample}</div>
            <p className={styles.where}>{f.where}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

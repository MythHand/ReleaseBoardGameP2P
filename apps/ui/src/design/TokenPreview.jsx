import styles from './TokenPreview.module.css'

// Один и тот же компонент используется и реальным приложением, и песочницей —
// демонстрация принципа «общие компоненты, две точки входа».
const swatches = [
  ['--bg', 'bg'],
  ['--fg', 'fg'],
  ['--surface-0', 'surface-0'],
  ['--surface-1', 'surface-1'],
  ['--brand-green', 'brand-green'],
  ['--cat-release', 'release'],
  ['--cat-attack', 'attack'],
  ['--cat-operation', 'operation'],
  ['--cat-protection', 'protection'],
  ['--cat-support', 'support'],
  ['--cat-defense', 'defense'],
  ['--cat-trigger', 'trigger'],
  ['--cat-ai', 'ai'],
]

export default function TokenPreview() {
  return (
    <section className={styles.root}>
      <h2 className={styles.h}>
        design tokens <span className={styles.note}>// провизорно</span>
      </h2>

      <div className={styles.grid}>
        {swatches.map(([varName, label]) => (
          <div key={varName} className={styles.swatch}>
            <div className={styles.chip} style={{ background: `var(${varName})` }} />
            <div className={styles.label}>{label}</div>
            <code className={styles.var}>{varName}</code>
          </div>
        ))}
      </div>

      <div className={styles.cardrow}>
        <div className={styles.cardSlot}>
          <span>card 368×515</span>
        </div>
        <p className={styles.typo}>
          JetBrains Mono — ABCDEF abcdef 0123456789
          <br />
          «Release любой ценой»
        </p>
      </div>
    </section>
  )
}

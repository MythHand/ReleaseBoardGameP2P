import styles from './ModeSelect.module.css'

// Выбор режима: заголовок + варианты в строчку + «ползунок» (подсветка),
// который едет к активному варианту. Колонки равной ширины — ползунок
// двигается на ширину одной колонки за шаг.
export default function ModeSelect({ title, options, value, onChange, readOnly = false }) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )

  return (
    <div className={styles.group}>
      <h4 className={styles.title}>{title}</h4>
      <div
        className={`${styles.track} ${readOnly ? styles.readOnly : ''}`}
        style={{ '--n': options.length, '--i': index }}
      >
        <span className={styles.thumb} aria-hidden="true" />
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            className={`${styles.opt} ${i === index ? styles.active : ''}`}
            onClick={() => !readOnly && onChange?.(o.value)}
            tabIndex={readOnly ? -1 : 0}
          >
            <span className={styles.label}>{o.label}</span>
            <span className={styles.desc}>{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

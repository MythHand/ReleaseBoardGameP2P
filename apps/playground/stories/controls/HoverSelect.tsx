import styles from './HoverSelect.module.css'

export interface HoverOption {
  value: string
  label: string
}

interface HoverSelectProps {
  label: string
  options: HoverOption[]
  value: string
  onChange: (value: string) => void
}

// Дев-контрол плейграунда: компактный селект, выпадающий вниз по наведению (без клика).
export default function HoverSelect({ label, options, value, onChange }: HoverSelectProps) {
  const current = options.find((o) => o.value === value)
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.select}>
        <div className={styles.trigger}>
          <span>{current?.label ?? '—'}</span>
          <span className={styles.caret} aria-hidden="true">
            ▾
          </span>
        </div>
        <div className={styles.menu}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={o.value === value ? styles.optOn : styles.opt}
              onClick={() => onChange(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import styles from './ModeSelect.module.css'

export interface ModeOption {
  value: string
  label: string
  desc: string
}

interface ModeSelectProps {
  title: string
  options: ModeOption[]
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
}

// Выбор режима: заголовок + варианты в строчку + «ползунок» (подсветка),
// который едет к активному варианту. Колонки равной ширины — ползунок
// двигается на ширину одной колонки за шаг. Текст — через пропсы (i18n-agnostic).
export default function ModeSelect({
  title,
  options,
  value,
  onChange,
  readOnly = false,
  disabled = false,
}: ModeSelectProps) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  return (
    <div className={styles.group}>
      <h4 className={styles.title}>{title}</h4>
      <div
        className={`${styles.track} ${readOnly ? styles.readOnly : ''} ${disabled ? styles.disabled : ''}`}
        style={{ '--n': options.length, '--i': index } as CSSProperties}
      >
        <span className={styles.thumb} aria-hidden="true" />
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            className={`${styles.opt} ${i === index ? styles.active : ''}`}
            onClick={() => !readOnly && !disabled && onChange?.(o.value)}
            tabIndex={readOnly || disabled ? -1 : 0}
          >
            <span className={styles.label}>{o.label}</span>
            <span className={styles.desc}>{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

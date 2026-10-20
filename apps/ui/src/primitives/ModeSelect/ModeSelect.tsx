import type { CSSProperties } from 'react'
import Typography from '@/primitives/Typography'
import styles from './ModeSelect.module.css'

export interface ModeOption {
  value: string
  label: string
  desc?: string
}

interface ModeSelectProps {
  title?: string
  options: ModeOption[]
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  disabled?: boolean
  // md — the match modes, a label and a line of description per option; sm — a
  // compact row for a settings panel, the height of a toggle beside it, labels
  // only (a `desc` is not shown)
  size?: 'md' | 'sm'
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
  size = 'md',
}: ModeSelectProps) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const sm = size === 'sm'

  return (
    <div className={styles.group}>
      {title && <h4 className={styles.title}>{title}</h4>}
      <div
        className={`${styles.track} ${styles[size]} ${readOnly ? styles.readOnly : ''} ${disabled ? styles.disabled : ''}`}
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
            <Typography
              as="span"
              base={sm ? 'label-sm' : 'mono-strong'}
              tk={sm ? 'tk-12' : 'tk-02'}
            >
              {o.label}
            </Typography>
            {!sm && o.desc && (
              <Typography as="span" base="mono-sm" tk="tk-01">
                {o.desc}
              </Typography>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

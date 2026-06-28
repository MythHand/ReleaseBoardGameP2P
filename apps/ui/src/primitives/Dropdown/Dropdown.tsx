import { type ReactNode, useEffect, useState } from 'react'
import styles from './Dropdown.module.css'

export interface DropdownItem {
  label: string
  danger?: boolean
  // недоступный пункт — серый, но кликабельный: по клику показывает hint
  disabled?: boolean
  hint?: string
  onClick: () => void
}

interface DropdownProps {
  items: DropdownItem[]
  // подпись кнопки-триггера (a11y) — приходит пропсом (i18n-agnostic)
  ariaLabel?: string
  // содержимое кнопки-триггера; по умолчанию «⋯»
  trigger?: ReactNode
}

// Выпадающее меню действий по кнопке «⋯»: открытие/закрытие, закрытие по клику
// снаружи, пункты с вариантами danger / disabled (+подсказка по клику).
export default function Dropdown({ items, ariaLabel = 'действия', trigger = '⋯' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState('')

  // закрываем по клику вне меню
  useEffect(() => {
    if (!open) return
    const onDoc = () => {
      setOpen(false)
      setHint('')
    }
    window.addEventListener('click', onDoc)
    return () => window.removeEventListener('click', onDoc)
  }, [open])

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.kebab}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation()
          setHint('')
          setOpen((v) => !v)
        }}
      >
        {trigger}
      </button>
      {open && (
        <div className={styles.menu}>
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className={`${styles.item} ${it.danger ? styles.itemDanger : ''} ${
                it.disabled ? styles.itemDisabled : ''
              }`}
              onClick={(e) => {
                e.stopPropagation()
                // клик по недоступному пункту — показываем подсказку, не действуем
                if (it.disabled) {
                  setHint(it.hint ?? '')
                } else {
                  it.onClick()
                  setOpen(false)
                  setHint('')
                }
              }}
            >
              {it.label}
            </button>
          ))}
          {hint && <div className={styles.hint}>{hint}</div>}
        </div>
      )}
    </div>
  )
}

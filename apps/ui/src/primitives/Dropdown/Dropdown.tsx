import { type ReactNode, useEffect, useId, useState } from 'react'
import styles from './Dropdown.module.css'

// Page-wide "only one open at a time": an opening dropdown broadcasts its id on
// window; every other open dropdown hears it and closes itself. No provider needed.
const EXCLUSIVE_EVENT = 'ui-dropdown-open'

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
  const id = useId()
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

  // only one dropdown open page-wide — close when another one announces it opened
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) {
        setOpen(false)
        setHint('')
      }
    }
    window.addEventListener(EXCLUSIVE_EVENT, onOther)
    return () => window.removeEventListener(EXCLUSIVE_EVENT, onOther)
  }, [id])

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.kebab}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation()
          setHint('')
          if (open) {
            setOpen(false)
          } else {
            // opening — tell any other open dropdown to close, then open this one
            window.dispatchEvent(new CustomEvent(EXCLUSIVE_EVENT, { detail: id }))
            setOpen(true)
          }
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

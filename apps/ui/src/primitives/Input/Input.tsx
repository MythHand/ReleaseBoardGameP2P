import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'
import { play } from '@/animations'
import styles from './Input.module.css'

export interface InputHandle {
  // тряхнуть поле — фидбек ошибки (напр. незаполнено при сабмите). Дёргает весь
  // .field (лейбл + поле + trailing), как делалось вручную на экранах.
  shake: () => void
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  // строка ошибки: красная рамка + сообщение под полем
  error?: string
  trailing?: ReactNode
  // по умолчанию значение капсится (коды, лобби); plain — натуральный регистр
  // (никнейм: в игре он используется как написан, без стилизации в капс)
  plain?: boolean
}

const Input = forwardRef<InputHandle, InputProps>(function Input(
  { label, error, trailing, plain, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const fieldRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(
    ref,
    () => ({
      shake: () => {
        play('shake', fieldRef.current)
      },
    }),
    [],
  )

  const inputClassName = `${styles.input}${plain ? ` ${styles.plain}` : ''}${
    error ? ` ${styles.inputError}` : ''
  }`

  // The label is associated to the input via htmlFor/id rather than wrapping it,
  // so an interactive `trailing` control (e.g. a random-nickname / copy button)
  // is not nested inside a <label> — clicking it would otherwise also forward a
  // focus/activation to the text input.
  return (
    <div ref={fieldRef} className={`${styles.field}${className ? ` ${className}` : ''}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {trailing ? (
        <div className={styles.row}>
          <input id={inputId} className={inputClassName} {...rest} />
          {trailing}
        </div>
      ) : (
        <input id={inputId} className={inputClassName} {...rest} />
      )}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
})

export default Input

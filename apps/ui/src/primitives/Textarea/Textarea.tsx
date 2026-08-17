import {
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react'
import { play } from '@/animations'
import styles from './Textarea.module.css'

export interface TextareaHandle {
  // тряхнуть поле — фидбек ошибки, как у Input
  shake: () => void
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  error?: string
  trailing?: ReactNode
  // сколько строк поле занимает пустым и до скольких растёт по содержимому
  rows?: number
  maxRows?: number
  // React 19: ref передаётся обычным пропом, forwardRef не нужен
  ref?: Ref<TextareaHandle>
}

// Многострочный близнец Input: то же поле, тот же лейбл, тот же слот trailing —
// но текст переносится, а высота идёт за содержимым до maxRows, после чего поле
// начинает прокручиваться. Однострочный Input для реплики не годится: длинное
// сообщение уезжает строкой вбок и его не видно целиком.
function Textarea({
  label,
  error,
  trailing,
  rows = 1,
  maxRows = 6,
  className,
  id,
  value,
  ref,
  ...rest
}: TextareaProps) {
  const autoId = useId()
  const areaId = id ?? autoId
  const fieldRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const shake = useCallback(() => play('shake', fieldRef.current), [])
  useImperativeHandle(ref, () => ({ shake }), [shake])

  // высота по содержимому: сбрасываем и меряем реальную высоту текста, потолок —
  // maxRows строк. Замер до кадра, поэтому промежуточной высоты не видно.
  // biome-ignore lint/correctness/useExhaustiveDependencies: зависимость здесь — отрисованное содержимое поля, а не переменная в теле эффекта; `value` и есть то, от чего меняется scrollHeight
  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const cs = getComputedStyle(el)
    // потолок = maxRows строк ПЛЮС то, что высотой текста не является: паддинги
    // (они внутри clientHeight) и рамки (разница offset/client). Без них поле
    // схлопывалось бы до высоты одних только строк.
    const line = Number.parseFloat(cs.lineHeight) || 0
    const chrome =
      el.offsetHeight -
      el.clientHeight +
      Number.parseFloat(cs.paddingBlockStart) +
      Number.parseFloat(cs.paddingBlockEnd)
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + chrome)}px`
  }, [value, maxRows])

  const invalid = error ? true : undefined
  const areaEl = (
    <textarea
      id={areaId}
      ref={areaRef}
      rows={rows}
      value={value}
      className={styles.area}
      aria-invalid={invalid}
      {...rest}
    />
  )

  return (
    <div ref={fieldRef} data-field className={`${styles.field}${className ? ` ${className}` : ''}`}>
      {label && (
        <label htmlFor={areaId} className={styles.label}>
          {label}
        </label>
      )}
      {trailing == null ? (
        areaEl
      ) : (
        <div className={styles.row}>
          {areaEl}
          {trailing}
        </div>
      )}
    </div>
  )
}

export default Textarea

import type { CSSProperties } from 'react'
import Typography, { type TypographyBase, type TypographyTk } from '../Typography'
import styles from './Slider.module.css'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange?: (value: number) => void
  label?: string
  // акцентный цвет (бегунок + значение + заливка). Не задан — зелёный бегунок, белое значение.
  color?: string
  // заливка дорожки до текущего значения цветом color (как у светофорного лимита)
  fill?: boolean
  // the thumb's own colour, leaving the value's alone; unset — color's
  thumbColor?: string
  // what follows the number, e.g. '%'
  unit?: string
  // the value's face on the scale; unset — numeric, the slider's own
  valueBase?: TypographyBase
  valueTk?: TypographyTk
  className?: string
}

// Слайдер-строка: подпись + range + числовое значение. Бегунок красится через --thumb.
export default function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  color,
  fill = false,
  thumbColor,
  unit = '',
  valueBase = 'numeric',
  valueTk,
  className = '',
}: SliderProps) {
  const thumb = thumbColor ?? color ?? '#8fd9b0'
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  // the widest value the range can show, its unit included, in characters
  const valueChars = Math.max(String(min).length, String(max).length) + unit.length
  const inputStyle = {
    '--thumb': thumb,
    ...(fill
      ? {
          background: `linear-gradient(90deg, ${thumb} ${percent}%, rgba(255,255,255,0.18) ${percent}%)`,
        }
      : {}),
  } as CSSProperties

  return (
    <div className={`${styles.row} ${className}`}>
      {label && <span className={styles.label}>{label}</span>}
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        style={inputStyle}
      />
      <Typography
        base={valueBase}
        tk={valueTk}
        as="span"
        className={styles.value}
        style={{ minInlineSize: `${valueChars}ch`, ...(color ? { color } : {}) }}
      >
        {value}
        {unit}
      </Typography>
    </div>
  )
}

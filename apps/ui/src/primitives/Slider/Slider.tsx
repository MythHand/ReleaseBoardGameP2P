import type { CSSProperties } from 'react'
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
  className = '',
}: SliderProps) {
  const thumb = color ?? '#8fd9b0'
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
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
      <span className={styles.value} style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  )
}

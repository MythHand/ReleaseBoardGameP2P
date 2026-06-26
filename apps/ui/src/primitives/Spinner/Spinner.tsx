import type { CSSProperties } from 'react'
import styles from './Spinner.module.css'

interface SpinnerProps {
  // диаметр в px
  size?: number
  className?: string
}

export default function Spinner({ size = 18, className = '' }: SpinnerProps) {
  const style: CSSProperties = { inlineSize: size, blockSize: size }
  return <span className={`${styles.spinner} ${className}`} style={style} aria-hidden="true" />
}

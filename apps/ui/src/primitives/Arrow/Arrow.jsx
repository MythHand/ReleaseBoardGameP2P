import styles from './Arrow.module.css'

// Адресная стрелка: плавная дуга (квадратичная Безье) из точки from в точку to.
// Координаты — в системе viewport (clientX/Y). Цвет — акцент типа карты.
// Лёгкий поток пунктира вдоль кривой даёт ненавязчивое направление к цели.
export default function Arrow({ from, to, color = 'var(--brand-green)' }) {
  if (!from || !to) return null

  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1

  // контрольная точка — смещение перпендикуляра от середины (мягкая дуга).
  // Знак выбираем так, чтобы дуга всегда выгибалась ВВЕРХ — она адаптируется
  // к позициям start/end, а не выгнута всегда в одну сторону.
  let px = -dy / len
  let py = dx / len
  if (py > 0) {
    px = -px
    py = -py
  }
  const arc = Math.min(len * 0.2, 130)
  const cx = (from.x + to.x) / 2 + px * arc
  const cy = (from.y + to.y) / 2 + py * arc

  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`

  // угол наконечника = касательная в конце (от контрольной точки к концу)
  const ang = (Math.atan2(to.y - cy, to.x - cx) * 180) / Math.PI

  return (
    <svg className={styles.svg} style={{ '--arrow': color }} aria-hidden="true">
      <circle className={styles.origin} cx={from.x} cy={from.y} r="4" />
      <path className={styles.base} d={d} />
      <path className={styles.flow} d={d} />
      <g transform={`translate(${to.x} ${to.y}) rotate(${ang})`}>
        <path className={styles.head} d="M 7 0 L -21 -14 L -9 0 L -21 14 Z" />
      </g>
    </svg>
  )
}

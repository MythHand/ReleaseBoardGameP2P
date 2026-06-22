import { useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import styles from './GameOver.module.css'

export type GameOverCondition = 'release' | 'lastStanding'

export interface GameOverCopy {
  winnerLabel: string
  condition: Record<GameOverCondition, string>
  continue: string
}

interface GameOverProps {
  winner?: { name: string } | null
  condition?: GameOverCondition
  onContinue?: () => void
  copy: GameOverCopy
}

// Оверлей завершения партии поверх стола: победитель + условие победы + CTA.
export default function GameOver({
  winner,
  condition = 'release',
  onContinue,
  copy,
}: GameOverProps) {
  const [shown, setShown] = useState(false)

  // двойной rAF — гарантируем плавное появление (как у Modal)
  useEffect(() => {
    let r2: number
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [])

  return (
    <div className={`${styles.overlay} ${shown ? styles.shown : ''}`}>
      <div className={styles.card}>
        <span className={styles.crown}>♛</span>
        <div className={styles.label}>{copy.winnerLabel}</div>
        <div className={styles.name}>{winner?.name}</div>
        <div className={styles.condition}>{copy.condition[condition]}</div>
        <div className={styles.actions}>
          <Button onClick={onContinue}>{copy.continue}</Button>
        </div>
      </div>
    </div>
  )
}

import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import styles from './GameOver.module.css'

export type GameOverCondition = 'release' | 'lastStanding'

// Text — via prop (i18n-agnostic); strings come from the central catalog.
export interface GameOverCopy {
  winner: string
  conditions: Record<GameOverCondition, string>
  continue: string
}

interface GameOverProps {
  winner?: { name: string } | null
  condition?: GameOverCondition
  onContinue?: () => void
  copy: GameOverCopy
}

// Окно завершения партии поверх стола: победитель + условие победы + CTA.
export default function GameOver({
  winner,
  condition = 'release',
  onContinue,
  copy,
}: GameOverProps) {
  return (
    <Overlay className={styles.over}>
      <div className={styles.card}>
        <span className={styles.crown}>♛</span>
        <div className={styles.label}>{copy.winner}</div>
        <div className={styles.name}>{winner?.name}</div>
        <div className={styles.condition}>{copy.conditions[condition]}</div>
        <div className={styles.actions}>
          <Button onClick={onContinue}>{copy.continue}</Button>
        </div>
      </div>
    </Overlay>
  )
}

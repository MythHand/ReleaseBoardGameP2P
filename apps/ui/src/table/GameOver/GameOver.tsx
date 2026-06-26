import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import styles from './GameOver.module.css'

export type GameOverCondition = 'release' | 'lastStanding'

// Текст окна — пропсом (i18n-agnostic). Дефолт — русский.
export interface GameOverCopy {
  winner: string
  conditions: Record<GameOverCondition, string>
  continue: string
}

export const GAME_OVER_COPY_RU: GameOverCopy = {
  winner: 'победитель',
  conditions: { release: 'Собраны 3 релиза', lastStanding: 'Остался последним' },
  continue: 'к статистике',
}

export const GAME_OVER_COPY_EN: GameOverCopy = {
  winner: 'winner',
  conditions: { release: '3 releases shipped', lastStanding: 'last one standing' },
  continue: 'to stats',
}

interface GameOverProps {
  winner?: { name: string } | null
  condition?: GameOverCondition
  onContinue?: () => void
  copy?: GameOverCopy
}

// Окно завершения партии поверх стола: победитель + условие победы + CTA.
export default function GameOver({
  winner,
  condition = 'release',
  onContinue,
  copy = GAME_OVER_COPY_RU,
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

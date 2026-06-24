import GameSettings from '@/blocks/GameSettings'
import { type GameModesCopy, MODES_COPY_RU, type Setup } from '@/game/modes'
import styles from './GameModes.module.css'

interface GameModesProps {
  setup?: Setup
  copy?: GameModesCopy
}

// Игровой режим на столе — те же группы, что выбирались в лобби, но read-only:
// смотреть можно всем, менять во время партии нельзя (как у гостя в лобби).
export default function GameModes({ setup = {}, copy = MODES_COPY_RU }: GameModesProps) {
  return (
    <div className={styles.box}>
      <div className={styles.list}>
        <GameSettings setup={setup} readOnly copy={copy} />
      </div>
    </div>
  )
}

import GameSettings from '@/blocks/GameSettings'
import type { GameModesCopy, Setup } from '@/game/modes'
import ScrollArea from '@/primitives/ScrollArea'
import styles from './GameModes.module.css'

interface GameModesProps {
  setup?: Setup
  // текст режимов (из каталога `gameModes`, по языку) — передаёт консьюмер
  copy: GameModesCopy
}

// Игровой режим на столе — те же группы, что выбирались в лобби, но read-only:
// смотреть можно всем, менять во время партии нельзя (как у гостя в лобби).
export default function GameModes({ setup = {}, copy }: GameModesProps) {
  return (
    <div className={styles.box}>
      <ScrollArea className={styles.list} contentClassName={styles.listFlow}>
        <GameSettings setup={setup} readOnly copy={copy} />
      </ScrollArea>
    </div>
  )
}

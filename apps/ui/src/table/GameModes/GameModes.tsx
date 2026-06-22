import { buildModes, type ModesCopy, type Setup } from '@/game/modes'
import ModeSelect from '@/primitives/ModeSelect'
import styles from './GameModes.module.css'

interface GameModesProps {
  setup?: Setup
  copy: ModesCopy
}

// Игровой режим на столе — те же группы, что выбирались в лобби, но read-only:
// смотреть можно всем, менять во время партии нельзя (как у гостя в лобби).
export default function GameModes({ setup = {}, copy }: GameModesProps) {
  return (
    <div className={styles.box}>
      <div className={styles.list}>
        {buildModes(copy).map((m) => (
          <ModeSelect
            key={m.key}
            title={m.title}
            options={m.options}
            value={setup[m.key] ?? ''}
            readOnly
          />
        ))}
      </div>
    </div>
  )
}

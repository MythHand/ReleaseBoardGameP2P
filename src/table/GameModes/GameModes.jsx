import ModeSelect from '@/primitives/ModeSelect'
import { GAME_MODES } from '@/game/modes'
import styles from './GameModes.module.css'

// Игровой режим на столе — те же группы, что выбирались в лобби, но read-only:
// смотреть можно всем, менять во время партии нельзя (как у гостя в лобби).
export default function GameModes({ setup = {} }) {
  return (
    <div className={styles.box}>
      <div className={styles.list}>
        {GAME_MODES.map((m) => (
          <ModeSelect
            key={m.key}
            title={m.title}
            options={m.options}
            value={setup[m.key]}
            readOnly
          />
        ))}
      </div>
    </div>
  )
}

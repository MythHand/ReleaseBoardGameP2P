import { useState } from 'react'
import GameSettings from '@/blocks/GameSettings'
import { DEFAULT_SETUP, MODES_COPY_EN, MODES_COPY_RU, type Setup } from '@/game/modes'
import { pick, useLang } from '../../Playground/lang'
import styles from './GameSettingsBlock.module.css'

// Готовый кусок: реальный компонент GameSettings (тот же, что в Start/Lobby/Table).
// Стейт держит стори, текст режимов — по языку из тумблера.
export default function GameSettingsBlock() {
  const { lang } = useLang()
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP)
  const setMode = (key: string, value: string) => setSetup((s) => ({ ...s, [key]: value }))

  return (
    <div className={styles.root}>
      <div className={styles.list}>
        <GameSettings
          setup={setup}
          onChange={setMode}
          copy={pick(lang, { ru: MODES_COPY_RU, en: MODES_COPY_EN })}
        />
      </div>
    </div>
  )
}

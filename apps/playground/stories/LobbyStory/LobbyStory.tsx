import { useState } from 'react'
import { MODES_COPY_EN, MODES_COPY_RU } from '@/game/modes'
import Lobby from '@/screens/Lobby'
import { pick, useLang } from '../../Playground/lang'
import styles from './LobbyStory.module.css'

export default function LobbyStory() {
  const { lang } = useLang()
  const [role, setRole] = useState<'host' | 'guest'>('host')
  return (
    <div className={styles.root}>
      <div className={styles.switch}>
        <button
          type="button"
          className={role === 'host' ? styles.on : ''}
          onClick={() => setRole('host')}
        >
          host
        </button>
        <button
          type="button"
          className={role === 'guest' ? styles.on : ''}
          onClick={() => setRole('guest')}
        >
          guest
        </button>
      </div>
      <Lobby role={role} modesCopy={pick(lang, { ru: MODES_COPY_RU, en: MODES_COPY_EN })} />
    </div>
  )
}

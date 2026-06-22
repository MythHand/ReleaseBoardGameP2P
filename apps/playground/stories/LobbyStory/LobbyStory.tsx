import { useState } from 'react'
import Lobby from '@/screens/Lobby'
import { RU_MODES } from '../ru-copy'
import styles from './LobbyStory.module.css'

export default function LobbyStory() {
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
      <Lobby role={role} modesCopy={RU_MODES} />
    </div>
  )
}

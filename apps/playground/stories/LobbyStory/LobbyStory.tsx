import { useState } from 'react'
import Lobby from '@/screens/Lobby'
import { useLang } from '../../Playground/lang'
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
      {/* стартовый язык лобби берём из языка плейграунда; дальше им управляет
          встроенный в лобби свитчер. key переинициализирует экран при смене
          языка плейграунда из шапки */}
      <Lobby key={lang} role={role} initialLang={lang} />
    </div>
  )
}

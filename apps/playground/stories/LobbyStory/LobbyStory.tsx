import { useState } from 'react'
import Lobby from '@/screens/Lobby'
import { useLang } from '../../Playground/lang'
import styles from './LobbyStory.module.css'

export default function LobbyStory() {
  const { lang } = useLang()
  const [role, setRole] = useState<'host' | 'guest'>('host')
  const [bg, setBg] = useState<'neutral' | 'positive'>('neutral')
  return (
    <div className={styles.root}>
      <div className={styles.controls}>
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
        <div className={styles.switch}>
          <button
            type="button"
            className={bg === 'neutral' ? styles.on : ''}
            onClick={() => setBg('neutral')}
          >
            neutral
          </button>
          <button
            type="button"
            className={bg === 'positive' ? styles.on : ''}
            onClick={() => setBg('positive')}
          >
            positive
          </button>
        </div>
      </div>
      {/* стартовый язык лобби берём из языка плейграунда; дальше им управляет
          встроенный в лобби свитчер. key переинициализирует экран при смене
          языка плейграунда из шапки */}
      <div className={styles.stage}>
        <Lobby key={lang} role={role} initialLang={lang} bgTone={bg} />
      </div>
    </div>
  )
}

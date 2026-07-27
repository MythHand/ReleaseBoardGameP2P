import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import Lobby from '@/screens/Lobby'
import { useLang } from '../../Playground/lang'
import styles from './LobbyStory.module.css'

export default function LobbyStory() {
  const { lang } = useLang()
  const [role, setRole] = useState<'host' | 'guest'>('host')
  const [bg, setBg] = useState<'neutral' | 'positive' | 'problem'>('neutral')
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
          <button
            type="button"
            className={bg === 'problem' ? styles.on : ''}
            onClick={() => setBg('problem')}
          >
            problem
          </button>
        </div>
      </div>
      {/* стартовый язык лобби берём из языка плейграунда; дальше им управляет
          встроенный в лобби свитчер. key переинициализирует экран при смене
          языка плейграунда из шапки */}
      <div className={styles.stage}>
        <Lobby
          key={lang}
          role={role}
          initialLang={lang}
          bgTone={bg}
          lobbyCodeCopy={{ ru: ruCommon.lobbyCode, en: enCommon.lobbyCode }}
          gameModesCopy={{ ru: ruCommon.gameModes, en: enCommon.gameModes }}
          rulesBlockCopy={{ ru: ruCommon.rulesBlock, en: enCommon.rulesBlock }}
          lobbyScreenCopy={{ ru: ruCommon.lobbyScreen, en: enCommon.lobbyScreen }}
        />
      </div>
    </div>
  )
}

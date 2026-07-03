import { useState } from 'react'
import { makeStats } from '@/mocks/stats'
import Stats from '@/screens/Stats'
import type { StatsCopy } from '@/screens/Stats/Stats'
import { pick, useLang } from '../../Playground/lang'
import styles from './StatsStory.module.css'

const COPY: Record<'ru' | 'en', StatsCopy> = {
  ru: {
    title: 'Итоги партии',
    subtitle: 'Партия завершена',
    winnerLabel: 'победитель',
    winnerTag: 'winner',
    colName: 'игрок',
    colLoc: 'где сейчас',
    colAttack: 'атакующих',
    colDefense: 'защитных',
    toLobby: 'в лобби',
    location: {
      game: 'в игре',
      stats: 'на статистике',
      lobby: 'в лобби',
      offline: 'не в сети',
    },
    achievements: {
      ddos: { title: 'King of DDoS', unit: 'раз сыграл DDoS' },
      ai: { title: 'AI зависимый', unit: 'карт AI из колоды' },
      err503: { title: 'Везучий', unit: 'ошибок 503 из колоды' },
      cherryPick: { title: 'Кладоискатель', unit: 'раз достал из сброса' },
      attackedInto: { title: 'Забагованный', unit: 'карт атаки прилетело' },
    },
  },
  en: {
    title: 'Match results',
    subtitle: 'Match over',
    winnerLabel: 'winner',
    winnerTag: 'winner',
    colName: 'player',
    colLoc: 'location',
    colAttack: 'attack',
    colDefense: 'defense',
    toLobby: 'to lobby',
    location: {
      game: 'in game',
      stats: 'on stats',
      lobby: 'in lobby',
      offline: 'offline',
    },
    achievements: {
      ddos: { title: 'King of DDoS', unit: 'times played DDoS' },
      ai: { title: 'AI Addict', unit: 'AI cards from deck' },
      err503: { title: 'Lucky One', unit: 'Error 503s from deck' },
      cherryPick: { title: 'Treasure Hunter', unit: 'times pulled from discard' },
      attackedInto: { title: 'Bug Magnet', unit: 'attack cards taken' },
    },
  },
}

export default function StatsStory() {
  const { lang, setLang } = useLang()
  const [bg, setBg] = useState<'neutral' | 'positive'>('neutral')
  const data = makeStats()
  return (
    <div className={styles.root}>
      <div className={styles.controls}>
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
      <div className={styles.stage}>
        <Stats {...data} copy={pick(lang, COPY)} lang={lang} onLangChange={setLang} bgTone={bg} />
      </div>
    </div>
  )
}

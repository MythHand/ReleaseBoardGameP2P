import { useState } from 'react'
import { makeStats } from '@/mocks/stats'
import Stats from '@/screens/Stats'
import type { StatsCopy } from '@/screens/Stats/Stats'
import { pick, useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechSwitch } from '../controls/TechControls'
import styles from './StatsStory.module.css'

const COPY: Record<'ru' | 'en', StatsCopy> = {
  ru: {
    title: 'Итоги партии',
    subtitle: 'Партия завершена',
    winnerLabel: 'победитель',
    winnerTag: 'winner',
    selfTag: 'вы',
    colName: 'игрок',
    colLoc: 'где сейчас',
    colAttack: 'атак',
    colDefense: 'защит',
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
    selfTag: 'you',
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

// Длина ника — отдельный кейс раскладки, а не мелочь: имя ведёт и строку
// таблицы, и плашку ачивки. По умолчанию мок отдаёт РАЗНЫЕ длины (8 / 14 / 20),
// так что все три шага кегля видны на одном экране; два других набора — стресс,
// когда длинные ники у всех сразу. Взяты из пула кнопки «рандомный ник»
// (`long`) и добиты до 20 символов — предела поля ввода в Start (`max`).
// Предел этот, впрочем, ничего не гарантирует экрану: имя приезжает сюда
// пропсом, и что в нём будет — решает не поле.
type NameSet = 'mixed' | 'long' | 'max'

const NAMES: Record<NameSet, string[] | null> = {
  mixed: null, // как в моке: deadlock 8, TabsOverSpaces 14, SyntaxSeagull_9000_x 20, null_ptr 8
  long: ['TabsOverSpaces', 'CtrlAltDefeat', 'BugWhisperer', 'MergeGremlin'],
  max: [
    'SyntaxSeagull_9000_x',
    'QuantumYak_Overflow9',
    'RubberDuck_Debugger1',
    'HeapHopper_Kernel_88',
  ],
}

export default function StatsStory() {
  const { lang, setLang } = useLang()
  const [bg, setBg] = useState<'neutral' | 'positive'>('neutral')
  const [names, setNames] = useState<NameSet>('mixed')
  const data = makeStats()
  const swap = NAMES[names]
  const players = swap
    ? data.players.map((p, i) => ({ ...p, name: swap[i] ?? p.name }))
    : data.players
  return (
    <div className={styles.root}>
      <TechBar>
        <TechSwitch
          options={[
            { value: 'neutral', label: 'neutral' },
            { value: 'positive', label: 'positive' },
          ]}
          value={bg}
          onChange={setBg}
        />
        <TechSwitch
          label="nickname"
          options={[
            { value: 'mixed', label: 'mixed' },
            { value: 'long', label: 'long' },
            { value: 'max', label: 'max 20' },
          ]}
          value={names}
          onChange={setNames}
        />
      </TechBar>
      <div className={styles.stage}>
        <Stats
          {...data}
          players={players}
          copy={pick(lang, COPY)}
          lang={lang}
          onLangChange={setLang}
          bgTone={bg}
        />
      </div>
    </div>
  )
}

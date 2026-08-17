import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import Chat, { type ChatMessage } from '@/blocks/Chat'
import { CHAT_SELF, makeChat } from '@/mocks/chat'
import { makeStats } from '@/mocks/stats'
import Stats, { type StatPlayer } from '@/screens/Stats'
import type { StatsCopy } from '@/screens/Stats/Stats'
import { pick, useLang } from '../../Playground/lang'
import TechBar from '../controls/TechBar'
import { TechSwitch, TechToggle } from '../controls/TechControls'
import styles from './StatsChatStory.module.css'

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

// Ничья по показателю ачивку не отдаёт никому, поэтому пять плашек — это
// удачный случай, а не данность. Набор `ties` доводит до ничьей два показателя:
// «Забагованный» (широкая плашка) и «Кладоискатель». Остаётся три плашки, и
// ряд обрывается на половине — так раскладку и надо смотреть.
const TIES: Record<string, Partial<StatPlayer>> = {
  you: { attackedInto: 6 }, // вровень с p3
  p4: { cherryPick: 3 }, // вровень с you
}

export default function StatsChatStory() {
  const { lang, setLang } = useLang()
  const [bg, setBg] = useState<'neutral' | 'positive'>('neutral')
  const [names, setNames] = useState<NameSet>('mixed')
  const [ties, setTies] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(makeChat)
  const data = makeStats()
  // отправка локальная: экран итогов переписку не ведёт, он только даёт ей место
  const send = (text: string) =>
    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, who: CHAT_SELF, role: 'player', text, time: '20:41' },
    ])
  const swap = NAMES[names]
  const players = data.players.map((p, i) => ({
    ...p,
    ...(swap ? { name: swap[i] ?? p.name } : null),
    ...(ties ? TIES[p.id] : null),
  }))
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
        <TechToggle on={ties} onChange={setTies}>
          ties
        </TechToggle>
      </TechBar>
      <div className={styles.stage}>
        <Stats
          {...data}
          players={players}
          copy={pick(lang, COPY)}
          lang={lang}
          onLangChange={setLang}
          bgTone={bg}
          chat={
            <Chat
              messages={messages}
              copy={pick(lang, { ru: ruCommon.chat, en: enCommon.chat })}
              selfName={CHAT_SELF}
              onSend={send}
            />
          }
        />
      </div>
    </div>
  )
}

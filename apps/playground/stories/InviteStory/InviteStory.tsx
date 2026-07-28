import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import type { CodeCheckState, InviteCopy, InviteState, SlotAvailability } from '@/screens/Invite'
import Invite from '@/screens/Invite'
import { type Lang, pick, useLang } from '../../Playground/lang'
import styles from './InviteStory.module.css'

const COPY: Record<'ru' | 'en', InviteCopy> = {
  ru: {
    logoAlt: 'Release любой ценой',
    logoVariant: 'ru',
    tags: ['Открытый P2P-проект', 'По настольной карточной игре'],
    description:
      'Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные события, атаки соперников — преодолевай всё это и зарелизь первым.',
    formTitle: 'Приглашение в игру',
    codeLabel: 'код игры',
    checkCode: 'проверить код',
    codeChecking: 'проверяю',
    codeError: 'не удалось подключиться',
    nicknameLabel: 'ваш никнейм',
    nicknamePlaceholder: 'НАПР. Dimbo',
    randomNick: 'случайный ник',
    roleTitle: 'подключиться как',
    rolePlayer: 'игрок',
    roleSpectator: 'зритель',
    spectatorOnlyNote: 'мест игрока нет — доступно только подключение зрителем',
    noSlotsNote: 'нет доступных мест',
    joinCta: 'подключиться',
    checkSlots: 'проверить слоты',
    connecting: 'подключение',
    connected: 'подключено',
    cancel: 'отмена',
    retry: 'повторить',
    connectError: 'не удалось подключиться',
    fullStatus: 'мест нет',
    notFoundStatus: 'игра не найдена',
    homePage: 'главная страница',
  },
  en: {
    logoAlt: 'Release at any cost',
    logoVariant: 'en',
    tags: ['Open P2P project', 'Based on the tabletop card game'],
    description:
      'A strategy card game about the real grind of software development. Bugs, sudden events, rival attacks — power through it all and ship your release first.',
    formTitle: 'Game invite',
    codeLabel: 'game code',
    checkCode: 'check the code',
    codeChecking: 'checking',
    codeError: 'couldn’t connect',
    nicknameLabel: 'your nickname',
    nicknamePlaceholder: 'E.G. Dimbo',
    randomNick: 'random name',
    roleTitle: 'join as',
    rolePlayer: 'player',
    roleSpectator: 'spectator',
    spectatorOnlyNote: 'no player slots left — you can only join as a spectator',
    noSlotsNote: 'no slots available',
    joinCta: 'connect',
    checkSlots: 'check slots',
    connecting: 'connecting',
    connected: 'connected',
    cancel: 'cancel',
    retry: 'retry',
    connectError: 'couldn’t connect',
    fullStatus: 'no free slots',
    notFoundStatus: 'game not found',
    homePage: 'home page',
  },
}

type Loc = Record<Lang, string>

// slot availability — a simulated lobby response
const AVAILABILITY: { value: SlotAvailability; label: Loc }[] = [
  { value: 'open', label: { ru: 'игрок + зритель', en: 'player + spectator' } },
  { value: 'spectatorOnly', label: { ru: 'только зритель', en: 'spectator only' } },
  { value: 'full', label: { ru: 'мест нет', en: 'no slots' } },
]

// the screen state depends on availability: when full there is nowhere to connect,
// so there are no connect phases — only the form and the "no slots" (red) line
const STATES_DEFAULT: { value: InviteState; label: Loc }[] = [
  { value: 'form', label: { ru: 'форма', en: 'form' } },
  { value: 'connecting', label: { ru: 'подключение', en: 'connecting' } },
  { value: 'connected', label: { ru: 'подключено', en: 'connected' } },
  { value: 'failed', label: { ru: 'ошибка', en: 'failed' } },
  { value: 'notFound', label: { ru: 'не найдена', en: 'not found' } },
]
const STATES_FULL: { value: InviteState; label: Loc }[] = [
  { value: 'form', label: { ru: 'форма', en: 'form' } },
  { value: 'full', label: { ru: 'мест нет', en: 'no slots' } },
]

// проверка кода у поля (мок дозвона до хоста): ok / идёт проверка / не удалось
const CODE_CHECK: { value: CodeCheckState; label: Loc }[] = [
  { value: 'ok', label: { ru: 'ок', en: 'ok' } },
  { value: 'checking', label: { ru: 'проверка', en: 'checking' } },
  { value: 'error', label: { ru: 'ошибка', en: 'error' } },
]

export default function InviteStory() {
  const { lang, setLang } = useLang()
  const [availability, setAvailability] = useState<SlotAvailability>('open')
  const [state, setState] = useState<InviteState>('form')
  const [codeState, setCodeState] = useState<CodeCheckState>('ok')
  const stateOptions = availability === 'full' ? STATES_FULL : STATES_DEFAULT

  // the right selector depends on the left one — on change, reset an unavailable state
  const changeAvailability = (a: SlotAvailability) => {
    setAvailability(a)
    if (a === 'full' && state !== 'form' && state !== 'full') setState('form')
    if (a !== 'full' && state === 'full') setState('form')
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.controlsLabel}>
          {pick(lang, { ru: 'доступность слота', en: 'slot availability' })}
        </span>
        <div className={styles.switch}>
          {AVAILABILITY.map((a) => (
            <button
              key={a.value}
              type="button"
              className={availability === a.value ? styles.on : ''}
              onClick={() => changeAvailability(a.value)}
            >
              {a.label[lang]}
            </button>
          ))}
        </div>
        <span className={styles.controlsLabel}>{pick(lang, { ru: 'состояние', en: 'state' })}</span>
        <div className={styles.switch}>
          {stateOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              className={state === s.value ? styles.on : ''}
              onClick={() => setState(s.value)}
            >
              {s.label[lang]}
            </button>
          ))}
        </div>
        <span className={styles.controlsLabel}>
          {pick(lang, { ru: 'проверка кода', en: 'code check' })}
        </span>
        <div className={styles.switch}>
          {CODE_CHECK.map((c) => (
            <button
              key={c.value}
              type="button"
              className={codeState === c.value ? styles.on : ''}
              onClick={() => setCodeState(c.value)}
            >
              {c.label[lang]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.stage}>
        <Invite
          code="F96-NMT"
          availability={availability}
          state={state}
          codeState={codeState}
          // refresh button triggers the host re-check (mock → checking)
          onCheckCode={() => setCodeState('checking')}
          copy={pick(lang, COPY)}
          physicalEditionCopy={pick(lang, {
            ru: ruCommon.physicalEdition,
            en: enCommon.physicalEdition,
          })}
          // clicking "connect" in the sandbox starts the connecting phase
          onJoin={() => setState('connecting')}
          onCancel={() => setState('form')}
          lang={lang}
          onLangChange={setLang}
        />
      </div>
    </div>
  )
}

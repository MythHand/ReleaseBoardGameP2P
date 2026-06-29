import { useState } from 'react'
import type { InviteCopy, InviteState, SlotAvailability } from '@/screens/Invite'
import Invite from '@/screens/Invite'
import { pick, useLang } from '../../Playground/lang'
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

// доступность слота — имитация ответа лобби
const AVAILABILITY: { value: SlotAvailability; label: string }[] = [
  { value: 'open', label: 'игрок + зритель' },
  { value: 'spectatorOnly', label: 'только зритель' },
  { value: 'full', label: 'мест нет' },
]

// состояние экрана зависит от доступности: при full подключаться некуда, поэтому
// фаз коннекта нет — остаются только форма и «мест нет» (красная строка)
const STATES_DEFAULT: { value: InviteState; label: string }[] = [
  { value: 'form', label: 'форма' },
  { value: 'connecting', label: 'подключение' },
  { value: 'connected', label: 'подключено' },
  { value: 'failed', label: 'ошибка' },
  { value: 'notFound', label: 'не найдена' },
]
const STATES_FULL: { value: InviteState; label: string }[] = [
  { value: 'form', label: 'форма' },
  { value: 'full', label: 'мест нет' },
]

export default function InviteStory() {
  const { lang, setLang } = useLang()
  const [availability, setAvailability] = useState<SlotAvailability>('open')
  const [state, setState] = useState<InviteState>('form')
  const stateOptions = availability === 'full' ? STATES_FULL : STATES_DEFAULT

  // правый селектор зависит от левого — при смене сбрасываем недоступное состояние
  const changeAvailability = (a: SlotAvailability) => {
    setAvailability(a)
    if (a === 'full' && state !== 'form' && state !== 'full') setState('form')
    if (a !== 'full' && state === 'full') setState('form')
  }

  return (
    <div className={styles.root}>
      <div className={styles.controls}>
        <span className={styles.controlsLabel}>доступность слота</span>
        <div className={styles.switch}>
          {AVAILABILITY.map((a) => (
            <button
              key={a.value}
              type="button"
              className={availability === a.value ? styles.on : ''}
              onClick={() => changeAvailability(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span className={styles.controlsLabel}>состояние</span>
        <div className={styles.switch}>
          {stateOptions.map((s) => (
            <button
              key={s.value}
              type="button"
              className={state === s.value ? styles.on : ''}
              onClick={() => setState(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.stage}>
        <Invite
          code="F96-NMT"
          availability={availability}
          state={state}
          copy={pick(lang, COPY)}
          // клик по «подключиться» в песочнице запускает фазу подключения
          onJoin={() => setState('connecting')}
          onCancel={() => setState('form')}
          lang={lang}
          onLangChange={setLang}
        />
      </div>
    </div>
  )
}

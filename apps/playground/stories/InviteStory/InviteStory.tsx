import { useState } from 'react'
import type { InviteCopy, SlotAvailability } from '@/screens/Invite'
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
    fullTitle: 'мест нет',
    fullNote: 'в этой игре не осталось свободных слотов — ни игрока, ни зрителя',
    notFoundTitle: 'игра не найдена',
    notFoundNote: 'игры по этому коду нет — возможно, она уже закрыта или ссылка неверна',
    refresh: 'обновить',
    joinCta: 'подключиться',
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
    fullTitle: 'no slots',
    fullNote: 'this game has no free slots left — neither player nor spectator',
    notFoundTitle: 'game not found',
    notFoundNote: 'no game for this code — it may have closed already or the link is wrong',
    refresh: 'refresh',
    joinCta: 'connect',
    homePage: 'home page',
  },
}

// техническая линия: какие слоты доступны по ссылке (имитация ответа лобби)
const AVAILABILITY: { value: SlotAvailability; label: string }[] = [
  { value: 'open', label: 'игрок + зритель' },
  { value: 'spectatorOnly', label: 'только зритель' },
  { value: 'full', label: 'мест нет' },
  { value: 'notFound', label: 'игра не найдена' },
]

export default function InviteStory() {
  const { lang, setLang } = useLang()
  const [availability, setAvailability] = useState<SlotAvailability>('open')

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
              onClick={() => setAvailability(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.stage}>
        <Invite
          code="F96-NMT"
          availability={availability}
          copy={pick(lang, COPY)}
          // в песочнице «обновить» имитирует перепроверку: слот освободился
          onRefresh={() => setAvailability('open')}
          lang={lang}
          onLangChange={setLang}
        />
      </div>
    </div>
  )
}

import { RULES_COPY_EN, RULES_COPY_RU } from '@/blocks/Rules'
import { MODES_COPY_EN, MODES_COPY_RU } from '@/game/modes'
import Start from '@/screens/Start'
import type { StartCopy } from '@/screens/Start/Start'
import { pick, useLang } from '../../Playground/lang'
import styles from './StartStory.module.css'

const COPY: Record<'ru' | 'en', StartCopy> = {
  ru: {
    logoAlt: 'Release любой ценой',
    logoVariant: 'ru',
    tags: ['Открытый P2P-проект', 'По настольной карточной игре'],
    description:
      'Стратегическая карточная игра про реальные будни разработки. Баги, неожиданные события, атаки соперников — преодолевай всё это и зарелизь первым.',
    createGame: 'создать игру',
    joinGame: 'подключиться',
    rules: 'правила',
    github: 'GitHub',
    playground: 'Playground',
    videoReview: 'видео-обзор',
    close: 'закрыть',
    createTitle: 'Создать игру',
    lobbyParams: 'Параметры лобби',
    nicknameLabel: 'Ваш никнейм',
    nicknamePlaceholder: 'напр. dimbo',
    randomNick: 'случайный ник',
    createCta: 'создать лобби',
    lobbyNote:
      'Лимит игроков и режимы партии настраиваются уже в лобби — пересоздавать ничего не нужно.',
    joinTitle: 'Подключиться',
    gameCodeLabel: 'код игры',
    gameCodePlaceholder: 'напр. 4F2A-9K',
    joinCta: 'войти',
    rulesTitle: 'Правила',
    authorDesign: 'Game & Design:',
    authorDev: 'Development:',
    modes: MODES_COPY_RU,
  },
  en: {
    logoAlt: 'Release at any cost',
    logoVariant: 'en',
    tags: ['Open P2P project', 'Based on the tabletop card game'],
    description:
      'A strategy card game about the real grind of software development. Bugs, sudden events, rival attacks — power through it all and ship your release first.',
    createGame: 'create game',
    joinGame: 'join',
    rules: 'rules',
    github: 'GitHub',
    playground: 'Playground',
    videoReview: 'video review',
    close: 'close',
    createTitle: 'Create game',
    lobbyParams: 'Lobby settings',
    nicknameLabel: 'Your nickname',
    nicknamePlaceholder: 'e.g. dimbo',
    randomNick: 'random name',
    createCta: 'create lobby',
    lobbyNote:
      'Player limit and game modes are configured later in the lobby — no need to recreate anything.',
    joinTitle: 'Join',
    gameCodeLabel: 'game code',
    gameCodePlaceholder: 'e.g. 4F2A-9K',
    joinCta: 'enter',
    rulesTitle: 'Rules',
    authorDesign: 'Game & Design:',
    authorDev: 'Development:',
    modes: MODES_COPY_EN,
  },
}

export default function StartStory() {
  const { lang } = useLang()
  return (
    <div className={styles.root}>
      <Start
        copy={pick(lang, COPY)}
        rulesCopy={pick(lang, { ru: RULES_COPY_RU, en: RULES_COPY_EN })}
        onPlayground={() => {}}
      />
    </div>
  )
}

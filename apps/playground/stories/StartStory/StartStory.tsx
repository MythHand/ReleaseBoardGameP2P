import { en as enCommon, ru as ruCommon } from '@release/translation/catalog'
import Start from '@/screens/Start'
import type { StartCopy } from '@/screens/Start/Start'
import { pick, useLang } from '../../Playground/lang'
import styles from './StartStory.module.css'

const COPY: Record<'ru' | 'en', StartCopy> = {
  ru: {
    logoAlt: 'Release любой ценой',
    logoVariant: 'ru',
    tags: ['Beta · Открытый код · без игрового сервера', 'По настольной карточной игре'],
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
    nicknamePlaceholder: 'НАПР. Dimbo',
    randomNick: 'случайный ник',
    createCta: 'создать лобби',
    lobbyNote:
      'Лимит игроков и режимы партии настраиваются уже в лобби — пересоздавать ничего не нужно.',
    joinTitle: 'Подключиться',
    gameCodeLabel: 'код игры',
    gameCodePlaceholder: 'напр. 4F2A-9K',
    joinCta: 'подключиться',
    rulesTitle: 'Правила',
    authorDesign: 'Game & Design:',
    authorDev: 'Development:',
    version: 'Version:',
    modes: ruCommon.gameModes,
  },
  en: {
    logoAlt: 'Release at any cost',
    logoVariant: 'en',
    tags: ['Beta · Open source · no game server', 'Based on the tabletop card game'],
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
    nicknamePlaceholder: 'E.G. Dimbo',
    randomNick: 'random name',
    createCta: 'create lobby',
    lobbyNote:
      'Player limit and game modes are configured later in the lobby — no need to recreate anything.',
    joinTitle: 'Join',
    gameCodeLabel: 'game code',
    gameCodePlaceholder: 'e.g. 4F2A-9K',
    joinCta: 'connect',
    rulesTitle: 'Rules',
    authorDesign: 'Game & Design:',
    authorDev: 'Development:',
    version: 'Version:',
    modes: enCommon.gameModes,
  },
}

export default function StartStory() {
  const { lang, setLang } = useLang()
  return (
    <div className={styles.root}>
      <Start
        copy={pick(lang, COPY)}
        // the root package.json's, put in by vite.config.ts — the same as the app's
        version={import.meta.env.VITE_APP_VERSION}
        physicalEditionCopy={pick(lang, {
          ru: ruCommon.physicalEdition,
          en: enCommon.physicalEdition,
        })}
        rulesCopy={pick(lang, { ru: ruCommon.rulesBlock, en: enCommon.rulesBlock })}
        onPlayground={() => {}}
        lang={lang}
        onLangChange={setLang}
      />
    </div>
  )
}

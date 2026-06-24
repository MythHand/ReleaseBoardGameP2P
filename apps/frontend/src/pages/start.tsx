import { useTranslation } from '@release/translation'
import { MODES_COPY_EN, MODES_COPY_RU, Start, type StartCopy } from '@release/ui'
import { useCreateLobby } from '~/features/create-lobby/useCreateLobby'
import { useJoinLobby } from '~/features/join-lobby/useJoinLobby'

// Лобби-протокол пока берёт name + maxPlayers; лимит игроков задаётся уже в лобби,
// так что на создании используем дефолт.
const DEFAULT_MAX_PLAYERS = 4

// Стартовый экран — полированный <Start> из @release/ui (наш дизайн).
// Создание/вход прокидываются в сетевые хуки сессии (логика друга).
export default function StartPage() {
  const { t, i18n } = useTranslation()
  const isEn = i18n.language.startsWith('en')
  const createLobby = useCreateLobby()
  const joinLobby = useJoinLobby()

  const copy: StartCopy = {
    logoAlt: t('start.logoAlt'),
    logoVariant: isEn ? 'en' : 'ru',
    tags: [t('start.tagOpenP2P'), t('start.tagBoardCard')],
    description: t('start.description'),
    createGame: t('start.createGame'),
    joinGame: t('start.joinGame'),
    rules: t('start.rules'),
    github: t('start.github'),
    videoReview: t('start.videoReview'),
    close: t('start.close'),
    createTitle: t('start.createTitle'),
    lobbyParams: t('start.lobbyParams'),
    nicknameLabel: t('start.nicknameLabel'),
    nicknamePlaceholder: t('start.nicknamePlaceholder'),
    randomNick: t('start.randomNick'),
    createCta: t('start.createCta'),
    lobbyNote: t('start.lobbyNote'),
    joinTitle: t('start.joinTitle'),
    gameCodeLabel: t('start.gameCodeLabel'),
    gameCodePlaceholder: t('start.gameCodePlaceholder'),
    joinCta: t('start.joinCta'),
    rulesTitle: t('start.rulesTitle'),
    authorDesign: t('start.authorDesign'),
    authorDev: t('start.authorDev'),
    modes: isEn ? MODES_COPY_EN : MODES_COPY_RU,
  }

  return (
    <Start
      copy={copy}
      onCreate={(nickname) => createLobby(nickname, DEFAULT_MAX_PLAYERS)}
      onJoin={(nickname, code) => joinLobby(code, nickname)}
    />
  )
}

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
<<<<<<< HEAD
    <Start
      copy={copy}
      onCreate={(nickname) => createLobby(nickname, DEFAULT_MAX_PLAYERS)}
      onJoin={(nickname, code) => joinLobby(code, nickname)}
    />
=======
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[url(@/assets/home/photo.jpg)] bg-center bg-cover" />
      <div className="absolute inset-0 start-blur-mask" />
      <div className="absolute inset-0 start-scrim" />

      <div className="relative z-[2] flex h-full items-center ps-[76px]">
        <div className="flex w-[460px] -translate-y-[8vh] flex-col items-start">
          <ReleaseLogo className="mb-3 -ml-[11px] h-auto w-[480px]" />

          <div className="mb-[38px] flex flex-col gap-[6px]">
            <span className="font-mono text-[12px] text-cat-release uppercase tracking-[0.16em] opacity-85">
              {t('start.tagOpenP2P')}
            </span>
            <span className="font-mono text-[12px] text-cat-release uppercase tracking-[0.16em] opacity-85">
              {t('start.tagBoardCard')}
            </span>
          </div>

          <p className="m-0 mb-24 text-[15px] leading-[1.65] opacity-85">
            {t('start.description')}
          </p>

          <Menu className="-ml-[11px] items-center">
            <MenuButton autoFocus value="create" onClick={handleMenuClick}>
              {t('start.createGame')}
            </MenuButton>
            <MenuButton value="join" onClick={handleMenuClick}>
              {t('start.joinGame')}
            </MenuButton>
            <div className="flex flex-col pt-6">
              <MenuButton value="rules" onClick={handleMenuClick}>
                {t('start.rules')}
              </MenuButton>
              <MenuButton onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
                {t('start.github')}
              </MenuButton>
            </div>
          </Menu>

          <img
            src={MYTHHAND}
            alt="MythHand"
            className="ms-[73px] mt-24 w-[132px] self-start opacity-[0.28]"
          />
        </div>
      </div>

      {/* Video player — expands in place to an inline iframe */}
      <div className={playerClass} onTransitionEnd={onPlayerTransEnd}>
        <button
          type="button"
          className="start-play-face"
          onClick={openVideo}
          aria-label={t('start.videoReview')}
          tabIndex={videoMounted ? -1 : 0}
        >
          <span className="start-play-icon">▶</span>
          <span className="start-play-cap">{t('start.videoReview')}</span>
        </button>

        {videoMounted && (
          <div className={videoFaceClass}>
            <button
              type="button"
              className="start-big-close"
              onClick={closeVideo}
              aria-label={t('start.close')}
            >
              ✕
            </button>
            <iframe
              className="block h-full w-full border-0"
              src="https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1"
              title={t('start.logoAlt')}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        )}
      </div>
    </div>
>>>>>>> bd25d1c (fix(start): flex-col on rules/github separator div)
  )
}

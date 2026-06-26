import { useTranslation } from '@release/translation'
import { Menu, MenuButton } from '@release/ui'
import type { TransitionEvent } from 'react'
import { useEffect, useState } from 'react'
import MYTHHAND from '@/assets/brand/mythhand.svg'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import AppLogo from '~/shared/ui/AppLogo'
import { useModalRoute } from '~/shared/ui/ModalRouter'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'

export default function StartPage() {
  const { t } = useTranslation()
  const handleMenuClick = useModalRoute()
  const session = useSession()
  const goToLobby = useGoToLobby()
  const hasSession = session.status === 'in-lobby' && !!session.state

  const [videoMounted, setVideoMounted] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const playerClass = videoOpen ? 'start-player start-player-open' : 'start-player'
  const videoFaceClass = videoOpen ? 'start-video-face start-video-shown' : 'start-video-face'

  const openVideo = () => {
    setVideoMounted(true)
    requestAnimationFrame(() => setVideoOpen(true))
  }
  const closeVideo = () => setVideoOpen(false)
  const onPlayerTransEnd = (e: TransitionEvent) => {
    if ((e.propertyName === 'inline-size' || e.propertyName === 'width') && !videoOpen) {
      setVideoMounted(false)
    }
  }

  useEffect(() => {
    if (!videoOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setVideoOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [videoOpen])

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[url(@/assets/home/photo.jpg)] bg-center bg-cover" />
      <div className="absolute inset-0 start-blur-mask" />
      <div className="absolute inset-0 start-scrim" />

      <div className="relative z-2 flex h-full items-center ps-19">
        <div className="flex w-115 translate-y-[-8vh] flex-col items-start">
          <AppLogo className="mb-3 -ml-2.75 h-auto w-120" />

          <div className="mb-9.5 flex flex-col gap-1.5">
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

          <Menu className="-ml-2.75 items-center">
            {/* Always rendered so toggling it never reflows the column — without
                a reserved slot, mounting/unmounting would change the
                vertically-centred column's height and shift everything. Hidden
                and inert when there is no session to resume. */}
            <MenuButton
              aria-hidden={!hasSession}
              disabled={!hasSession}
              className={hasSession ? undefined : 'pointer-events-none invisible'}
              onClick={() => session.roomCode && goToLobby(session.roomCode)}
            >
              {t('start.continueSession')}
            </MenuButton>
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
            </div>
            <div className="flex flex-col pt-6">
              <MenuButton onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
                {t('start.github')}
              </MenuButton>
              <MenuButton
                onClick={() => {
                  window.location.href = `${import.meta.env.BASE_URL}playground/`
                }}
              >
                {t('start.playground')}
              </MenuButton>
            </div>
          </Menu>

          <img
            src={MYTHHAND}
            alt="MythHand"
            className="ms-18.25 mt-24 w-33 self-start opacity-[0.28]"
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
  )
}

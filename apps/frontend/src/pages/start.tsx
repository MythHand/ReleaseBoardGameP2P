import { useTranslation } from '@release/translation'
import { Menu, MenuButton, MenuGroup, Typography, VideoPlayer } from '@release/ui'
import { useGoToLobby } from '~/app/lib/lobbyNavigation'
import { useSession } from '~/app/providers/SessionProvider'
import AppLogo from '~/shared/ui/AppLogo'
import { useModalRoute } from '~/shared/ui/ModalRouter'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'
const VIDEO_URL = 'https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1'

export default function StartPage() {
  const { t } = useTranslation()
  const handleMenuClick = useModalRoute()
  const session = useSession()
  const goToLobby = useGoToLobby()
  const hasSession = session.status === 'in-lobby' && !!session.state

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="absolute inset-0 bg-[url(@/assets/home/photo.jpg)] bg-center bg-cover" />
      <div className="absolute inset-0 start-blur-mask" />
      <div className="absolute inset-0 start-scrim" />

      <div className="relative z-2 flex h-full items-center ps-19">
        <div className="flex w-115 translate-y-[-8vh] flex-col items-start">
          <AppLogo className="mb-3 -ml-2.75 h-auto w-120" />

          <div className="mb-9.5 flex flex-col gap-1.5 text-cat-release opacity-85">
            <Typography variant="tag">{t('start.tagOpenP2P')}</Typography>
            <Typography variant="tag">{t('start.tagBoardCard')}</Typography>
          </div>

          <Typography variant="body" className="mb-24">
            {t('start.description')}
          </Typography>

          <Menu>
            {/* Always rendered so toggling it never reflows the column — without
                a reserved slot, mounting/unmounting would change the
                vertically-centred column's height and shift everything. Hidden
                and inert when there is no session to resume. */}
            <MenuGroup>
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
            </MenuGroup>
            <MenuGroup>
              <MenuButton value="rules" onClick={handleMenuClick}>
                {t('start.rules')}
              </MenuButton>
            </MenuGroup>
            <MenuGroup>
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
            </MenuGroup>
          </Menu>
        </div>
      </div>

      {/* Video player — expands in place to an inline iframe */}
      <VideoPlayer
        src={VIDEO_URL}
        copy={{
          videoReview: t('start.videoReview'),
          close: t('start.close'),
          title: t('start.logoAlt'),
        }}
      />
    </div>
  )
}

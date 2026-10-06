import { useTranslation } from '@release/translation'
import { Menu, MenuButton, MenuGroup, VideoPlayer } from '@release/ui'
import { useModalRoute } from '~/shared/ui/ModalRouter'
import ScreenShell from '~/shared/ui/ScreenShell'
import styles from './start.module.css'

const REPO_URL = 'https://github.com/dimbo-design/ReleaseBoardGameP2P'
const VIDEO_URL = 'https://www.youtube.com/embed/bxGtRnoYW4g?autoplay=1'

export default function StartPage() {
  const { t } = useTranslation()
  const handleMenuClick = useModalRoute()
  return (
    <ScreenShell
      tags={[t('start.tagOpenP2P'), t('start.tagBoardCard')]}
      description={t('start.description')}
      corners={
        <>
          {/* Video player — expands in place to an inline iframe */}
          <VideoPlayer
            src={VIDEO_URL}
            copy={{
              videoReview: t('start.videoReview'),
              close: t('start.close'),
              title: t('start.logoAlt'),
            }}
          />
        </>
      }
    >
      <Menu className={styles.menu}>
        <MenuGroup>
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
    </ScreenShell>
  )
}

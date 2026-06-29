import VideoPlayer from '@/blocks/VideoPlayer'
import { KitPage, KitSection } from './KitShell'
import styles from './VideoPlayerKit.module.css'

// The real embed player: the ▶ button expands in place into the inline video.
// The stage provides a positioned container — the component is absolutely positioned.
const VIDEO_SRC = 'https://www.youtube.com/embed/bxGtRnoYW4g'

export default function VideoPlayerKit() {
  return (
    <KitPage title="Video player">
      <KitSection title="Кнопка разворачивается в инлайн-плеер (Esc — закрыть)">
        <div className={styles.stage}>
          <VideoPlayer
            src={VIDEO_SRC}
            copy={{ videoReview: 'Видеообзор', close: 'Закрыть', title: 'Видеообзор игры' }}
            className={styles.player}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}

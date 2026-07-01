import VideoPlayer from '@/blocks/VideoPlayer'
import { useLang } from '../../Playground/lang'
import { KitPage, KitSection } from './KitShell'
import styles from './VideoPlayerKit.module.css'

// The real embed player: the ▶ button expands in place into the inline video.
// The stage provides a positioned container — the component is absolutely positioned.
const VIDEO_SRC = 'https://www.youtube.com/embed/bxGtRnoYW4g'

const COPY = {
  ru: {
    section: 'Кнопка разворачивается в инлайн-плеер (Esc — закрыть)',
    videoReview: 'Видеообзор',
    close: 'Закрыть',
    title: 'Видеообзор игры',
  },
  en: {
    section: 'Button expands into an inline player (Esc to close)',
    videoReview: 'Video review',
    close: 'Close',
    title: 'Game video review',
  },
}

export default function VideoPlayerKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Video player">
      <KitSection title={t.section}>
        <div className={styles.stage}>
          <VideoPlayer
            src={VIDEO_SRC}
            copy={{ videoReview: t.videoReview, close: t.close, title: t.title }}
            className={styles.player}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}

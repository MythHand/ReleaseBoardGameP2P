import VideoPlayer from '@/blocks/VideoPlayer'
import { KitPage, KitSection } from './KitShell'
import styles from './VideoPlayerKit.module.css'

// Реальный embed-плеер: кнопка ▶ разворачивается на месте в инлайн-видео.
// Сцена даёт позиционированный контейнер — компонент абсолютно спозиционирован.
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

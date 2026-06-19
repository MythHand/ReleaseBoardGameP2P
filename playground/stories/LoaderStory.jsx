import Loader from '@/boot'
import styles from './LoaderStory.module.css'

// Лоадер — самостоятельный декоративный boot-экран. Клик POWER ON запускает
// (нужен жест пользователя для звука).
export default function LoaderStory() {
  return (
    <div className={styles.root}>
      <Loader />
    </div>
  )
}

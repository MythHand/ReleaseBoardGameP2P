import Overlay from '@/primitives/Overlay'
import Spinner from '@/primitives/Spinner'
import styles from './Reconnect.module.css'

// Текст окна — пропсом (i18n-agnostic). Дефолт — русский.
export interface ReconnectCopy {
  label: string
}

export const RECONNECT_COPY_RU: ReconnectCopy = { label: 'переподключение…' }
export const RECONNECT_COPY_EN: ReconnectCopy = { label: 'reconnecting…' }

interface ReconnectProps {
  copy?: ReconnectCopy
}

// Окно переподключения поверх стола: scrim + спиннер + статус.
export default function Reconnect({ copy = RECONNECT_COPY_RU }: ReconnectProps) {
  return (
    <Overlay className={styles.over}>
      <div className={styles.box}>
        <Spinner />
        {copy.label}
      </div>
    </Overlay>
  )
}

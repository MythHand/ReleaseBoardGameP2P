import Overlay from '@/primitives/Overlay'
import Spinner from '@/primitives/Spinner'
import styles from './Reconnect.module.css'

// Text — via prop (i18n-agnostic); strings come from the central catalog.
export interface ReconnectCopy {
  label: string
}

interface ReconnectProps {
  copy: ReconnectCopy
}

// Окно переподключения поверх стола: scrim + спиннер + статус.
export default function Reconnect({ copy }: ReconnectProps) {
  return (
    <Overlay className={styles.over}>
      <div className={styles.box}>
        <Spinner />
        {copy.label}
      </div>
    </Overlay>
  )
}

import Button from '@/primitives/Button'
import styles from './LobbyCode.module.css'

// Текст блока приходит пропсом (компонент i18n-agnostic). Дефолт — русский.
export interface LobbyCodeCopy {
  label: string
  copy: string
  copied: string
}

export const LOBBY_CODE_COPY_RU: LobbyCodeCopy = {
  label: 'код игры',
  copy: 'копировать',
  copied: 'скопировано',
}

export const LOBBY_CODE_COPY_EN: LobbyCodeCopy = {
  label: 'game code',
  copy: 'copy',
  copied: 'copied',
}

interface LobbyCodeProps {
  code: string
  copy?: LobbyCodeCopy
}

// Блок «код игры»: метка сверху, ниже — кнопка копирования слева и сам код
// справа. Копирование через режим Button (copyValue → буфер + «скопировано»).
export default function LobbyCode({ code, copy = LOBBY_CODE_COPY_RU }: LobbyCodeProps) {
  return (
    <div className={styles.box}>
      <span className={styles.label}>{copy.label}</span>
      <div className={styles.row}>
        <Button variant="tech" copyValue={code} copiedChildren={copy.copied}>
          {copy.copy}
        </Button>
        <span className={styles.code}>{code}</span>
      </div>
    </div>
  )
}

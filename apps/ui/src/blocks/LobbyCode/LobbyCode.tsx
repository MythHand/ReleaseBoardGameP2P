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
  // своя подпись «код игры» (true по умолч.); выключаем, когда заголовок внешний
  showLabel?: boolean
  // выравнивание: end (по умолч., как в шапке лобби) / start
  align?: 'start' | 'end'
  // порядок в ряду: false — кнопка слева + код (лобби); true — код + кнопка справа
  reverse?: boolean
}

// Блок «код игры»: метка сверху, ниже — кнопка копирования и сам код.
// Копирование через режим Button (copyValue → буфер + «скопировано»).
export default function LobbyCode({
  code,
  copy = LOBBY_CODE_COPY_RU,
  showLabel = true,
  align = 'end',
  reverse = false,
}: LobbyCodeProps) {
  const copyBtn = (
    <Button variant="tech" copyValue={code} copiedChildren={copy.copied}>
      {copy.copy}
    </Button>
  )
  const codeEl = <span className={styles.code}>{code}</span>
  return (
    <div className={`${styles.box} ${align === 'start' ? styles.start : ''}`}>
      {showLabel && <span className={styles.label}>{copy.label}</span>}
      <div className={styles.row}>
        {reverse ? (
          <>
            {codeEl}
            {copyBtn}
          </>
        ) : (
          <>
            {copyBtn}
            {codeEl}
          </>
        )}
      </div>
    </div>
  )
}

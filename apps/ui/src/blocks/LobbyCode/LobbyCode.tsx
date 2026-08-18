import { CopyButton } from '@/primitives/Button'
import Typography from '@/primitives/Typography'
import styles from './LobbyCode.module.css'

// Текст блока приходит пропсом (компонент i18n-agnostic). Дефолт — русский.
export interface LobbyCodeCopy {
  label: string
  copy: string
  copied: string
  // Two-copy mode (when `link` is supplied): the share link is the primary
  // action, the bare code the fallback. Optional so the single-button callers
  // (Table, the frontend's own mirror) keep compiling on `copy` alone.
  copyLink?: string
  copyCode?: string
}

interface LobbyCodeProps {
  code: string
  copy: LobbyCodeCopy
  // Полная ссылка-приглашение. Когда задана — рядом с копированием кода
  // появляется вторая кнопка «ссылка» (копирует именно её).
  link?: string
  // своя подпись «код игры» (true по умолч.); выключаем, когда заголовок внешний
  showLabel?: boolean
  // выравнивание: end (по умолч., как в шапке лобби) / start
  align?: 'start' | 'end'
  // порядок в ряду: false — кнопка слева + код (лобби); true — код + кнопка справа
  reverse?: boolean
  // Кнопки нет вовсе: копирует клик по САМОМУ коду. Кегль там на ступень ниже —
  // такой код стоит в строке настроек, где он значение, а не герой шапки.
  copyOnCode?: boolean
}

// Блок «код игры»: метка сверху, ниже — кнопка(и) копирования и сам код.
// Копирование через режим Button (copyValue → буфер + «скопировано»).
// С `link` выводятся две кнопки — «ссылка» (вся ссылка для подключения) и
// «код» (только код комнаты) — чтобы к одному значению дать оба копирования.
export default function LobbyCode({
  code,
  copy,
  link,
  showLabel = true,
  align = 'end',
  reverse = false,
  copyOnCode = false,
}: LobbyCodeProps) {
  // Код и есть кнопка: буфер и «скопировано» несёт CopyButton, вид — сам код,
  // а `bare` ровно затем и существует, чтобы кнопка его не переодевала.
  if (copyOnCode) {
    return (
      <div className={`${styles.box} ${align === 'start' ? styles.start : ''}`}>
        {showLabel && <span className={styles.label}>{copy.label}</span>}
        <CopyButton
          variant="bare"
          copyValue={code}
          copiedChildren={
            <Typography base="value-lg" tk="tk-20">
              {copy.copied}
            </Typography>
          }
        >
          <Typography base="value-lg" tk="tk-20" className={styles.codeBtn}>
            {code}
          </Typography>
        </CopyButton>
      </div>
    )
  }

  const codeBtn = (
    <CopyButton variant="tech" copyValue={code} copiedChildren={copy.copied}>
      {link ? (copy.copyCode ?? copy.copy) : copy.copy}
    </CopyButton>
  )
  const buttons = link ? (
    <div className={styles.actions}>
      <CopyButton variant="tech" copyValue={link} copiedChildren={copy.copied}>
        {copy.copyLink ?? copy.copy}
      </CopyButton>
      {codeBtn}
    </div>
  ) : (
    codeBtn
  )
  const codeEl = <span className={styles.code}>{code}</span>
  return (
    <div className={`${styles.box} ${align === 'start' ? styles.start : ''}`}>
      {showLabel && <span className={styles.label}>{copy.label}</span>}
      <div className={styles.row}>
        {reverse ? (
          <>
            {codeEl}
            {buttons}
          </>
        ) : (
          <>
            {buttons}
            {codeEl}
          </>
        )}
      </div>
    </div>
  )
}

import styles from './ReleaseLogo.module.css'
import raw from './release_logo.svg?raw'

interface ReleaseLogoProps {
  className?: string
  blink?: boolean
}

// Логотип «Release» инлайном (не <img>), чтобы оживить курсор-квадрат.
// Единственный <rect> в SVG — это курсор справа от слова; CSS мигает им
// по ритму терминального курсора (чуть медленнее обычного). blink=false — статичный.
export default function ReleaseLogo({ className = '', blink = true }: ReleaseLogoProps) {
  return (
    <span
      className={`${styles.wrap} ${blink ? '' : styles.static} ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: инлайн доверенного локального SVG (импорт на этапе сборки) — нужен, чтобы анимировать курсор <rect>
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  )
}

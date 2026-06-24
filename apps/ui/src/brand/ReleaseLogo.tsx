import styles from './ReleaseLogo.module.css'
import rawEn from './release_logo.en.svg?raw'
import rawRu from './release_logo.svg?raw'

interface ReleaseLogoProps {
  className?: string
  blink?: boolean
  // вариант начертания под язык интерфейса; RU-версия содержит мигающий курсор-<rect>
  variant?: 'ru' | 'en'
}

// Логотип «Release» инлайном (не <img>), чтобы оживить курсор-квадрат.
// Единственный <rect> в RU-SVG — это курсор справа от слова; CSS мигает им
// по ритму терминального курсора (чуть медленнее обычного). blink=false — статичный.
// EN-версия начертания собрана без <rect>, поэтому мигания у неё нет.
export default function ReleaseLogo({
  className = '',
  blink = true,
  variant = 'ru',
}: ReleaseLogoProps) {
  const raw = variant === 'en' ? rawEn : rawRu
  return (
    <span
      className={`${styles.wrap} ${blink ? '' : styles.static} ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: инлайн доверенного локального SVG (импорт на этапе сборки) — нужен, чтобы анимировать курсор <rect>
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  )
}

import raw from './release_logo.svg?raw'
import styles from './ReleaseLogo.module.css'

// Логотип «Release» инлайном (не <img>), чтобы оживить курсор-квадрат.
// Единственный <rect> в SVG — это курсор справа от слова; CSS мигает им
// по ритму терминального курсора (чуть медленнее обычного).
export default function ReleaseLogo({ className = '', blink = true }) {
  return (
    <span
      className={`${styles.wrap} ${blink ? '' : styles.static} ${className}`}
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  )
}

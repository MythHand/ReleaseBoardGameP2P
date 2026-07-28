import styles from './ReleaseLogo.module.css'
import rawEn from './release_logo.en.svg?raw'
import rawRu from './release_logo.svg?raw'

interface ReleaseLogoProps {
  className?: string
  blink?: boolean
  // вариант начертания под язык интерфейса
  variant?: 'ru' | 'en'
}

// The blinking terminal cursor is the small block to the right of the wordmark.
// The exported SVGs carry no ids or layer names (just anonymous <path>s), so we
// can't hook it by name. Instead we tag the cursor path(s) by GEOMETRY — a pure
// horizontal/vertical rectangle, narrow and sitting to the right of the word —
// with `data-cursor`, and blink that via CSS. Done here, not by editing the SVG,
// so re-exported assets stay untouched and keep working. Any number of matching
// rects gets tagged (RU and EN each ship one).
function isCursorPath(d: string): boolean {
  if (/[CcSsQqTtAa]/.test(d)) return false // curves → part of a glyph, not the block cursor
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)
  const xs = nums.filter((_, i) => i % 2 === 0)
  if (xs.length === 0) return false
  const minX = Math.min(...xs)
  return Math.max(...xs) - minX < 60 && minX > 150 // narrow + right of the wordmark
}

function tagCursor(raw: string): string {
  return raw.replace(/<path\b[^>]*>/g, (tag) => {
    const d = tag.match(/\bd="([^"]*)"/)?.[1]
    return d && isCursorPath(d) ? tag.replace('<path', '<path data-cursor=""') : tag
  })
}

// tag once at module load (the raw SVGs are static build-time imports)
const SVG: Record<'ru' | 'en', string> = { ru: tagCursor(rawRu), en: tagCursor(rawEn) }

// Логотип «Release» инлайном (не <img>), чтобы оживить курсор-квадрат: CSS мигает
// помеченным data-cursor путём в ритме терминального курсора. blink=false —
// статичный (напр. в хедере лобби).
export default function ReleaseLogo({
  className = '',
  blink = true,
  variant = 'ru',
}: ReleaseLogoProps) {
  return (
    <span
      className={`${styles.wrap} ${blink ? '' : styles.static} ${className}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: инлайн доверенного локального SVG (импорт на этапе сборки) — нужен, чтобы анимировать курсор
      dangerouslySetInnerHTML={{ __html: SVG[variant] }}
    />
  )
}

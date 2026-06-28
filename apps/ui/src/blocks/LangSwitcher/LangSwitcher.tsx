import styles from './LangSwitcher.module.css'

export type SwitchLang = 'ru' | 'en'

interface LangSwitcherProps {
  value: SwitchLang
  onChange: (lang: SwitchLang) => void
  // подпись сверху (опционально); компонент i18n-agnostic
  label?: string
  // code — компактные RU/EN; full — полные имена на своём языке (Русский/English)
  variant?: 'code' | 'full'
  // выравнивание содержимого: end (по умолч., как в шапке лобби) / start
  align?: 'start' | 'end'
}

const LANGS: SwitchLang[] = ['ru', 'en']

// имя языка на самом этом языке — константа, не зависит от текущего языка UI
const NATIVE: Record<SwitchLang, string> = { ru: 'Русский', en: 'English' }

// Блок «язык»: опциональная подпись + две кнопки рядом. variant='code' даёт
// компактные RU/EN, variant='full' — полные имена. Каркас как у LobbyCode.
export default function LangSwitcher({
  value,
  onChange,
  label,
  variant = 'code',
  align = 'end',
}: LangSwitcherProps) {
  const full = variant === 'full'
  return (
    <div className={`${styles.box} ${align === 'start' ? styles.start : ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      <div className={styles.row}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className={`${styles.lang} ${full ? styles.langFull : ''} ${
              value === l ? styles.langOn : ''
            }`}
            aria-pressed={value === l}
            onClick={() => onChange(l)}
          >
            {full ? NATIVE[l] : l}
          </button>
        ))}
      </div>
    </div>
  )
}

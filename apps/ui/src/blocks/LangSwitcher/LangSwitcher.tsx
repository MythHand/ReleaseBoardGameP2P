import styles from './LangSwitcher.module.css'

export type SwitchLang = 'ru' | 'en'

interface LangSwitcherProps {
  value: SwitchLang
  onChange: (lang: SwitchLang) => void
  // подпись приходит пропсом (компонент i18n-agnostic). Дефолт — русский.
  label?: string
}

const LANGS: SwitchLang[] = ['ru', 'en']

// Блок «язык»: метка сверху, ниже — две кнопки RU / EN рядом. Тот же каркас,
// что у LobbyCode (метка + ряд), но в ряду — выбор языка вместо кода.
export default function LangSwitcher({ value, onChange, label = 'язык' }: LangSwitcherProps) {
  return (
    <div className={styles.box}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            className={`${styles.lang} ${value === l ? styles.langOn : ''}`}
            aria-pressed={value === l}
            onClick={() => onChange(l)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

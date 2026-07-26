import { useTranslation } from '@release/translation'
import { LangSwitcher, type SwitchLang } from '@release/ui'
import styles from './LanguageSwitch.module.css'

// Frontend adapter for the i18n-agnostic LangSwitcher block: binds it to
// react-i18next and fixes it to the top-right corner (position + corner shade
// ported from the ui Start screen so it matches the playground).
export default function LanguageSwitch() {
  const { i18n } = useTranslation()
  const value: SwitchLang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  return (
    <>
      <div className={styles.shade} />
      <div className={styles.corner}>
        <LangSwitcher value={value} onChange={(lang) => i18n.changeLanguage(lang)} />
      </div>
    </>
  )
}

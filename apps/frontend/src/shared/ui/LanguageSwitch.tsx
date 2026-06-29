import { useTranslation } from '@release/translation'
import { LangSwitcher, type SwitchLang } from '@release/ui'

// Frontend adapter for the i18n-agnostic LangSwitcher block: binds it to
// react-i18next and fixes it to the top-right corner.
export default function LanguageSwitch() {
  const { i18n } = useTranslation()
  const value: SwitchLang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  return (
    <div className="fixed top-4 right-4 z-10">
      <LangSwitcher value={value} onChange={(lang) => i18n.changeLanguage(lang)} />
    </div>
  )
}

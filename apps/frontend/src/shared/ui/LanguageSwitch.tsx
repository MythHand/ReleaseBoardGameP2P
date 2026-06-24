import { useTranslation } from '@release/translation'
import { ModeSelect } from '@release/ui'

const LANG_OPTIONS = [
  { value: 'en', label: 'EN' },
  { value: 'ru', label: 'RU' },
]

export default function LanguageSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="fixed top-4 right-4 z-10">
      <ModeSelect
        options={LANG_OPTIONS}
        value={i18n.resolvedLanguage ?? 'en'}
        onChange={(lng) => i18n.changeLanguage(lng)}
      />
    </div>
  )
}

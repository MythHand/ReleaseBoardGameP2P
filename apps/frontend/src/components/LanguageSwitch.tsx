import { useTranslation } from 'react-i18next'

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation()
  const langs = ['en', 'ru'] as const
  return (
    <div>
      {langs.map((lng) => (
        <button
          key={lng}
          type="button"
          aria-pressed={i18n.resolvedLanguage === lng}
          onClick={() => i18n.changeLanguage(lng)}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  )
}

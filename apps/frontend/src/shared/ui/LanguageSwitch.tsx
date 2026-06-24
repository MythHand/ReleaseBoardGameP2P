import { useTranslation } from '@release/translation'

const baseBtn =
  'rounded-md px-2.5 py-1 text-xs font-semibold tracking-base transition-[color,background,opacity] duration-150'

export default function LanguageSwitch() {
  const { i18n, t } = useTranslation()
  const langs = ['en', 'ru'] as const
  return (
    <div className="fixed top-4 right-4 z-10 inline-flex gap-0.5 rounded-lg border border-fg/10 bg-surface-1 p-0.5">
      {langs.map((lng) => {
        const selected = i18n.resolvedLanguage === lng
        return (
          <button
            key={lng}
            type="button"
            className={
              selected
                ? `${baseBtn} cursor-default bg-brand-green/12 text-brand-green`
                : `${baseBtn} cursor-pointer text-fg/50 hover:text-fg/85`
            }
            aria-pressed={selected}
            disabled={selected}
            onClick={() => i18n.changeLanguage(lng)}
          >
            {t(`language.${lng}`)}
          </button>
        )
      })}
    </div>
  )
}

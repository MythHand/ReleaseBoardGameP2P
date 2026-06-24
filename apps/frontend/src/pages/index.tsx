import { useTranslation } from '@release/translation'
import { Link } from 'react-router'

// Landing. The first screen at `/` — a thin hero linking to `/start`
// (the persistent header link in `_app` mirrors it).
export default function Index() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-bold text-5xl tracking-base">
        {t('app.titleLead')} <span className="text-brand-green">{t('app.titleSub')}</span>
      </h1>
      <p className="max-w-prose text-fg/70 text-lg">{t('start.description')}</p>
      <Link
        to="/start"
        className="rounded-lg bg-brand-green px-6 py-3 font-semibold text-bg tracking-base transition-opacity hover:opacity-90"
      >
        {t('app.enterLobby')}
      </Link>
      {/* Plain anchor: the playground is a separate app served under the app's
          base path (BASE_URL + "playground/"), outside this router. */}
      <a
        href={`${import.meta.env.BASE_URL}playground/`}
        className="text-fg/50 text-sm underline transition-colors hover:text-fg/80"
      >
        {t('app.devShowcase')}
      </a>
    </main>
  )
}

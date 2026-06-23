import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

// Landing screen. The root app (NOT the playground sandbox) — entry point that
// links into the lobby and the component showcase.
export default function HomeScreen() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center">
      <h1 className="font-bold text-4xl tracking-base">
        {t('app.titleLead')} <span className="text-brand-green">{t('app.titleSub')}</span>
      </h1>
      <p className="opacity-80">{t('app.foundationTag')}</p>
      <Link to="/lobby" className="rounded bg-brand-green px-6 py-3 font-semibold text-bg">
        {t('app.enterLobby')}
      </Link>
      <p className="text-sm opacity-60">
        {t('app.devShowcase')}{' '}
        <a className="underline" href="/playground/">
          /playground/
        </a>
      </p>
    </main>
  )
}

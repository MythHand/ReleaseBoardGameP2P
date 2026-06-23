import { useTranslation } from '@release/translation'
import { Link } from 'react-router'

const primaryBtn =
  'rounded-lg bg-brand-green px-6 py-3 font-semibold text-bg tracking-base transition-opacity hover:opacity-90'
const ghostBtn =
  'rounded-lg border border-fg/15 px-6 py-3 font-semibold text-fg/80 tracking-base transition-colors hover:bg-surface-2'

// Play chooser. The polished <Start> screen is being reimplemented; for now this
// routes into the two lobby modes: create (host) and connect (guest).
export default function StartPage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="font-bold text-4xl tracking-base">
        {t('app.titleLead')} <span className="text-brand-green">{t('app.titleSub')}</span>
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link to="/lobby?mode=create" className={primaryBtn}>
          {t('start.createGame')}
        </Link>
        <Link to="/lobby?mode=join" className={ghostBtn}>
          {t('start.joinGame')}
        </Link>
      </div>
    </main>
  )
}

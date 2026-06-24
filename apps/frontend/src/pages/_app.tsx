import { useTranslation } from '@release/translation'
import { Link, Outlet, useRouteError } from 'react-router'
import AppModals from '~/app/AppModals'
import { SessionProvider } from '~/app/providers/SessionProvider'
import ErrorScreen from '~/shared/ui/ErrorScreen'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  const { t } = useTranslation()
  return (
    <SessionProvider>
      <div className="min-h-screen bg-bg text-fg">
        <Link
          to="/start"
          className="fixed top-4 left-4 z-10 rounded-lg border border-fg/10 bg-surface-1 px-3 py-1.5 font-semibold text-brand-green text-xs tracking-base transition-opacity hover:opacity-80"
        >
          {t('app.enterLobby')}
        </Link>
        <LanguageSwitch />
        <Outlet />
        <AppModals />
      </div>
    </SessionProvider>
  )
}

/**
 * Root route error boundary. generouted wires `_app`'s `Catch` export as the
 * top-level `ErrorBoundary`, so any render/loader error in a page lands here.
 */
export function Catch() {
  const error = useRouteError()
  return <ErrorScreen error={error} />
}

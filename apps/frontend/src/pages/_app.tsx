import { useTranslation } from '@release/translation'
import { Link, Outlet, useLocation, useRouteError } from 'react-router'
import AppModals from '~/app/AppModals'
import { SessionProvider } from '~/app/providers/SessionProvider'
import ErrorScreen from '~/shared/ui/ErrorScreen'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <SessionProvider>
      <div className="min-h-screen bg-bg text-fg">
        {/* Exclude '/' too: it renders briefly before redirecting to /start, and
            the link would flash on the entry frame. */}
        {pathname !== '/start' && pathname !== '/' && (
          <Link
            to="/start"
            className="fixed top-4 left-4 z-10 rounded-lg border border-fg/10 bg-surface-1 px-3 py-1.5 font-semibold text-brand-green text-xs tracking-base transition-opacity hover:opacity-80"
          >
            {t('app.home')}
          </Link>
        )}
        {/* Only on the start screen — elsewhere (e.g. the lobby) it would
            overlay the page header. */}
        {pathname === '/start' && <LanguageSwitch />}
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

import { Outlet, useLocation, useRouteError } from 'react-router'
import AppModals from '~/app/AppModals'
import styles from '~/app/app.module.css'
import { SessionProvider } from '~/app/providers/SessionProvider'
import ErrorScreen from '~/shared/ui/ErrorScreen'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  const { pathname } = useLocation()
  return (
    <SessionProvider>
      <div className={styles.root}>
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

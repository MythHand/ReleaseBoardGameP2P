import { Outlet, useLocation, useRouteError } from 'react-router'
import AppModals from '~/app/AppModals'
import styles from '~/app/app.module.css'
import SessionActivation, { SessionRestore } from '~/app/providers/SessionActivation'
import SessionGate from '~/app/providers/SessionGate'
import ErrorScreen from '~/shared/ui/ErrorScreen'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  const { pathname } = useLocation()
  return (
    <>
      <SessionActivation />
      <div className={styles.root}>
        {/* Only on the start screen — elsewhere (e.g. the lobby) it would
            overlay the page header. */}
        <SessionRestore>
          {pathname === '/start' && <LanguageSwitch />}
          {/^\/(lobby|board)\//.test(pathname) ? (
            <SessionGate>
              <Outlet />
            </SessionGate>
          ) : (
            <Outlet />
          )}
          <AppModals />
        </SessionRestore>
      </div>
    </>
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

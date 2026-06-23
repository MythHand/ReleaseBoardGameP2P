import { Outlet, useRouteError } from 'react-router'
import { SessionProvider } from '~/app/providers/SessionProvider'
import ErrorScreen from '~/shared/ui/ErrorScreen'
import LanguageSwitch from '~/shared/ui/LanguageSwitch'

export default function App() {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-bg text-fg">
        <LanguageSwitch />
        <Outlet />
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

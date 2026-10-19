import { useLocation, useNavigate, useRouteError } from 'react-router'
import App, { Catch } from '~/pages/_app'
import NotFound from '~/pages/404'
import { classifyLoadFailure } from '~/shared/lib/loadFailure'
import LoadingStatus from '~/shared/ui/LoadingStatus'
import { buildRoutes, type PageModule } from './buildRoutes'
import type { SessionStore } from './providers/sessionStore'
import { deferredPages } from './routeModules'

function RouteLoadError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  if (classifyLoadFailure(error, navigator.onLine) === 'application') throw error
  return (
    <LoadingStatus
      error={error}
      onRetry={() => {
        void navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true })
      }}
    />
  )
}

export function createRoutes(store: SessionStore) {
  const eager = import.meta.glob<PageModule>('/src/pages/{index,start}.{jsx,tsx}', { eager: true })
  return [
    {
      Component: App,
      ErrorBoundary: Catch,
      HydrateFallback: LoadingStatus,
      children: [
        {
          ErrorBoundary: RouteLoadError,
          children: buildRoutes(eager, deferredPages, { requestSession: store.request }),
        },
        { path: '*', Component: NotFound },
      ],
    },
  ]
}

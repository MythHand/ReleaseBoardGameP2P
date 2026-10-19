import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { setRandomFavicon } from '@/assets/favicon'
import { BASE_URL } from '~/shared/config'
import { SessionProvider } from './providers/SessionProvider'
import { createSessionStore } from './providers/sessionStore'
import { createRoutes } from './routes'
import '@release/ui/global.css'
import './index.css'
import '@release/translation'

// Random favicon from the shared set — one per load (same as the playground).
setRandomFavicon()

// generouted's <Routes> builds the router with no basename, so when the app is
// served under a sub-path (GitHub Pages: /ReleaseBoardGameP2P/) react-router
// matches against the full pathname and every route except the bare base falls
// through to the 404 catch-all. Build the router from generouted's exported
// `routes` ourselves so it knows the base path. Vite guarantees BASE_URL has a
// trailing slash; react-router wants none except for the root "/".
const basename = BASE_URL === '/' ? '/' : BASE_URL.replace(/\/$/, '')
const sessionStore = createSessionStore(() => import('./providers/SessionRuntime'))
const router = createBrowserRouter(createRoutes(sessionStore), { basename })

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <SessionProvider store={sessionStore}>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
)

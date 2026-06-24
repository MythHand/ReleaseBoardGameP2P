import { routes } from '@generouted/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import '@release/ui/global.css'
import './index.css'
import '@release/translation'

// generouted's <Routes> builds the router with no basename, so when the app is
// served under a sub-path (GitHub Pages: /ReleaseBoardGameP2P/) react-router
// matches against the full pathname and every route except the bare base falls
// through to the 404 catch-all. Build the router from generouted's exported
// `routes` ourselves so it knows the base path. Vite guarantees BASE_URL has a
// trailing slash; react-router wants none except for the root "/".
const base = import.meta.env.BASE_URL
const basename = base === '/' ? '/' : base.replace(/\/$/, '')
const router = createBrowserRouter(routes, { basename })

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

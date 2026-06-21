import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Playground from './Playground'
import '@/design/global.css'

// Served under Vite's BASE_URL ('/playground/'), so the router resolves routes
// relative to it (e.g. /playground/card). basename wants no trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('playground')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <Playground />
    </BrowserRouter>
  </React.StrictMode>,
)

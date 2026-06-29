import React from 'react'
import ReactDom from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Playground from './Playground'
import '@/design/global.css'
import './favicon'

// Served under Vite's BASE_URL ('/playground/'), so the router resolves routes
// relative to it (e.g. /playground/card). basename wants no trailing slash.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

// biome-ignore lint/style/noNonNullAssertion: #playground mount node is defined in index.html
ReactDom.createRoot(document.getElementById('playground')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <Playground />
    </BrowserRouter>
  </React.StrictMode>,
)

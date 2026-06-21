import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import Playground from './Playground'
import '@/design/global.css'

// Served at root in dev/preview, so routes are /card, /combo, … with no basename.
// If deployed under a sub-path, set Vite `base` and pass a matching `basename` here.
ReactDOM.createRoot(document.getElementById('playground')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Playground />
    </BrowserRouter>
  </React.StrictMode>,
)

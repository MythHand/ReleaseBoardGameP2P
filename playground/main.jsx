import React from 'react'
import ReactDOM from 'react-dom/client'
import Playground from './Playground.jsx'
import '@/design/global.css'

ReactDOM.createRoot(document.getElementById('playground')).render(
  <React.StrictMode>
    <Playground />
  </React.StrictMode>,
)

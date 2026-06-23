import { Routes } from '@generouted/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@release/ui/global.css'
import './index.css'
import './i18n'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <Routes />
  </StrictMode>,
)

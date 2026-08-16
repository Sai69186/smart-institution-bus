import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { registerSW } from 'virtual:pwa-register'

// Auto-update service worker — silently installs new versions.
// Shows a simple confirm dialog so users can reload to get the update.
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('A new version of Campus Transit is available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('[PWA] App is ready to work offline.')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

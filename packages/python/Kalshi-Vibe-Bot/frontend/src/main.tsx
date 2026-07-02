import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DashboardDataCacheProvider } from './context/DashboardDataCache'
import { WebSocketProvider } from './context/WebSocketProvider'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

const app = (
  <WebSocketProvider>
    <DashboardDataCacheProvider>
      <App />
    </DashboardDataCacheProvider>
  </WebSocketProvider>
)

// StrictMode intentionally double-invokes effects in dev; keep it for local debugging,
// but avoid the extra render churn in production builds.
if (import.meta.env.DEV) {
  root.render(<React.StrictMode>{app}</React.StrictMode>)
} else {
  root.render(app)
}

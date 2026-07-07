import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Header from './components/Header'
import './index.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const AIAnalysis = lazy(() => import('./pages/Positions'))
const Performance = lazy(() => import('./pages/Performance'))
const Logs = lazy(() => import('./pages/Logs'))
const Settings = lazy(() => import('./pages/Settings'))

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-white text-sm">
      Loading…
    </div>
  )
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-primary text-white antialiased">
        <Header />
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/positions" element={<AIAnalysis />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </Router>
  )
}

export default App

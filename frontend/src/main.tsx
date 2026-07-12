import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import FaqPage from './FaqPage.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import AuthCallback from './auth/AuthCallback.tsx'
import ResetPasswordPage from './auth/ResetPasswordPage.tsx'
import { PrivacyPage, TermsPage } from './LegalPage.tsx'
import { RouteTracker } from './chrome/RouteTracker.tsx'
import { initGoatCounter } from './lib/goatcounter.ts'

initGoatCounter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RouteTracker />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/admin" element={<App adminMode />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/reset" element={<ResetPasswordPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

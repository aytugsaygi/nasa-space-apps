import '@fontsource-variable/manrope'
import '@fontsource-variable/sora'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { LanguageProvider } from './i18n'
import './index.css'
import { SettingsProvider } from './lib/settings.tsx'
import { HealthProvider } from './data/health.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <SettingsProvider>
        <HealthProvider>
          <App />
        </HealthProvider>
      </SettingsProvider>
    </LanguageProvider>
  </StrictMode>,
)

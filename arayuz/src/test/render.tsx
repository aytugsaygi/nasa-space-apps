import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { localBackend, type Backend } from '../data/backend'
import { HealthProvider } from '../data/health'
import { LanguageProvider, type Lang } from '../i18n'
import { en } from '../i18n/en'
import { tr } from '../i18n/tr'
import { SettingsProvider } from '../lib/settings'

/** Testte kullanılacak sözlük: metinler teste gömülmez, buradan alınır */
export const dictFor = (lang: Lang) => (lang === 'tr' ? tr : en)

/**
 * Bileşeni uygulamadaki sağlayıcılarla (dil + ayarlar + sağlık verisi) ve seçilen dilde çizer; veri tarayıcı motorundan gelir.
 * backend verilirse o kullanılır (test önce veriyi hazırlayabilir).
 */
export function renderWithProviders(ui: ReactElement, { lang = 'tr', backend }: { lang?: Lang; backend?: Backend } = {}) {
  localStorage.setItem('vitalis.lang', lang)
  return render(
    <LanguageProvider>
      <SettingsProvider>
        <HealthProvider backend={backend ?? localBackend()}>{ui}</HealthProvider>
      </SettingsProvider>
    </LanguageProvider>,
  )
}

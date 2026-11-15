import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach } from 'vitest'

// Testlerde animasyonlar anında biter: geçişler (ör. AnimatePresence mode="wait") sonucu değiştirmez, yalnızca beklemeyi uzatır
MotionGlobalConfig.skipAnimations = true

/*
 * jsdom'da olmayan tarayıcı API'leri.
 * Uygulama hareket tercihini matchMedia ile okur (usePrefersReducedMotion), boyutları ResizeObserver ile izler.
 */
/* Sunucu testleri (node ortamı) bu ayarları kullanmaz */
const browser = typeof window !== 'undefined'
if (browser && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// Her test temiz başlar: çizilen bileşenler ve kayıtlı ayarlar (dil, düzen, ayarlar) silinir
afterEach(() => {
  if (!browser) return
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})

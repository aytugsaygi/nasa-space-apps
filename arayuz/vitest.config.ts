import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/*
 * Birim ve bileşen testleri. Uygulamanın Vite ayarlarını kullanır, tarayıcı yerine jsdom'da çalışır.
 * 3D sahne (WebGL) jsdom'da çizilemez; hologramın davranışı Playwright testlerinde (e2e/) denenir.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
      css: false,
    },
  }),
)

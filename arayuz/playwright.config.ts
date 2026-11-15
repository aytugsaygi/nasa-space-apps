import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

/** Her ekran boyutunda çalışan testler (duyarlı yerleşim ve görsel karşılaştırma); diğerleri yalnızca masaüstünde çalışır */
const ALL_SIZES = /(duyarli|gorsel)\.spec\.ts/

/*
 * Uçtan uca testler. Uygulama geliştirme sunucusunda (5173) açılır; sunucu çalışıyorsa o kullanılır.
 * Metinler teste gömülmez, src/i18n sözlüklerinden alınır (e2e/fixtures.ts).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    /*
     * Görsel karşılaştırma sıkıdır: aynı makinede iki çekim arasında fark 0 pikseldir. Durum renginin yeşilden sarıya
     * dönmesi ~1700, üst bar düğmesinin köşesinin bir kademe küçülmesi ~1000 piksel fark eder. Soluk kenarlık değişikliği de
     * sayılsın diye piksel başına renk toleransı düşüktür (0.05); ikisi de bu ayarla yakalanır.
     */
    toHaveScreenshot: { maxDiffPixels: 150, threshold: 0.05, animations: 'disabled' },
  },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // 3D sahne ekran kartını yorar; aynı anda çok fazla tarayıcı açılmaz
  workers: CI ? 2 : 4,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    // Tam Chromium (yeni headless): ekran kartı varsa 3D sahneyi onunla çizer; yoksa yazılımla
    channel: 'chromium',
    baseURL: 'http://localhost:5173',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    /*
     * Bölümler ekranda yavaşça salınır; hareket eden öğeye Playwright "sabit değil" diye tıklamaz.
     * Testler "hareketi azalt" ayarıyla çalışır (uygulama bu ayarda salınımı kapatır, kullanıcıların da seçebildiği bir mod).
     */
    reducedMotion: 'reduce',
    // Ekran kartı olmayan CI makinesinde WebGL yazılımla çizilir
    launchOptions: CI ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
  },
  projects: [
    { name: 'masaustu-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'laptop-1280', testMatch: ALL_SIZES, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'tablet-768', testMatch: ALL_SIZES, use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    {
      name: 'mobil-390',
      testMatch: ALL_SIZES,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})

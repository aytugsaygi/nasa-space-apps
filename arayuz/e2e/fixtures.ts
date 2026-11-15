import { test as base, expect, type Page } from '@playwright/test'
import { en } from '../src/i18n/en'
import { tr } from '../src/i18n/tr'

export type Lang = 'tr' | 'en'
export type Dict = typeof en

/**
 * Bütün e2e testlerinin ortak başlangıcı:
 * - açılış videosu atlanır (oturumda görülmüş sayılır), dil sabitlenir
 * - testin sonunda konsolda hata kalmadığı ve sayfanın yatayda taşmadığı denetlenir
 * Her test temiz bir tarayıcı bağlamında başlar: kayıtlı düzen, dil ve ayarlar boştur.
 */
export const test = base.extend<{ lang: Lang; t: Dict; skipIntro: boolean; allowOfflineErrors: boolean; guard: void }>({
  lang: ['tr', { option: true }],
  // Çevrimdışı testlerde ağ hataları beklenir: yalnızca bağlantı kopukluğundan doğan konsol hataları yok sayılır
  allowOfflineErrors: [false, { option: true }],
  skipIntro: [true, { option: true }],
  t: async ({ lang }, provide) => provide(lang === 'tr' ? tr : en),
  page: async ({ page, lang, skipIntro }, provide) => {
    await page.addInitScript(
      ({ l, skip }) => {
        if (skip) sessionStorage.setItem('vitalis.introSeen', '1')
        // Dil yalnızca ilk açılışta ayarlanır: testte dil değiştirip yenileyince seçim korunur
        if (!localStorage.getItem('vitalis.lang')) localStorage.setItem('vitalis.lang', l)
        // Tarayıcının meşgul kaldığı uzun görevlerin bittiği an (waitForHologram bunu bekler)
        const w = window as Window & { __longTaskEnd?: number }
        w.__longTaskEnd = 0
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.__longTaskEnd = Math.max(w.__longTaskEnd ?? 0, e.startTime + e.duration)
        }).observe({ type: 'longtask', buffered: true })
      },
      { l: lang, skip: skipIntro },
    )
    await provide(page)
  },
  guard: [
    async ({ page, allowOfflineErrors }, run) => {
      const errors: string[] = []
      const expected = (m: string) => allowOfflineErrors && /ERR_INTERNET_DISCONNECTED|Failed to fetch dynamically imported module/.test(m)
      page.on('console', (m) => {
        if (m.type() === 'error' && !expected(m.text())) errors.push(m.text())
      })
      page.on('pageerror', (e) => !expected(e.message) && errors.push(e.message))
      await run()
      expect(errors, 'konsolda hata olmamalı').toEqual([])
      if (!page.isClosed()) {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, 'sayfa yatayda taşmamalı').toBeLessThanOrEqual(0)
      }
    },
    { auto: true },
  ],
})
export { expect }

/** Açık olan sayfa (yan sayfalar inert) */
export const activePage = (page: Page) => page.locator('[data-page]:not([inert])')

/** Açık sayfadaki bir bölüm */
export const tool = (page: Page, id: string) => activePage(page).locator(`[data-tool="${id}"]`)

/** Hologram bölümü ve 3D alanı */
export const hologram = (page: Page) => activePage(page).locator('#tour-hologram')

/**
 * Hologramın 3D modeli yüklenip hazır olana kadar bekler.
 * Yükleniyor halkası kaybolduktan sonra da tarayıcı yaklaşık 3 saniye meşgul kalır (model tıklamaya hazırlanır);
 * bu sırada yapılan tıklama, basılı tutma ve zamanlayıcılar gecikir. Tarayıcı 1,5 saniye boyunca boşta kalınca devam edilir.
 */
export async function waitForHologram(page: Page) {
  const holo = hologram(page)
  await expect(holo.locator('canvas').first()).toBeVisible()
  await expect(holo.getByRole('status')).toHaveCount(0, { timeout: 30_000 })
  const loadedAt = await page.evaluate(() => performance.now())
  await page.waitForFunction(
    (since) => {
      const end = (window as Window & { __longTaskEnd?: number }).__longTaskEnd ?? 0
      return performance.now() - Math.max(end, since) > 1500
    },
    loadedAt,
    { polling: 200, timeout: 30_000 },
  )
}

/**
 * Uygulamayı açar ve arayüzün çizilmesini bekler. Açık sayfada hologram varsa 3D modelin hazır olması da beklenir.
 * Veri tarayıcı motorundan gelir (?backend=local): her test kendi temiz verisiyle başlar, geliştirme sunucusunun
 * veritabanına dokunulmaz. Sunucu API'si ayrıca server/server.test.ts'de denenir.
 * Açılıştaki otomatik check-in formu kapalıdır (?checkin=off); açmak için path'e ?checkin=on yazılır.
 */
export async function open(page: Page, path = '/') {
  const url = new URL(path, 'http://x')
  if (!url.searchParams.has('backend')) url.searchParams.set('backend', 'local')
  // Açılıştaki otomatik check-in formu varsayılan olarak kapalı (her testin önüne çıkmasın); check-in testleri ?checkin=on verir
  if (!url.searchParams.has('checkin')) url.searchParams.set('checkin', 'off')
  await page.goto(`${url.pathname}${url.search}${url.hash}`)
  await expect(page.locator('[data-page="0"]')).toBeVisible()
  if (await hologram(page).count()) await waitForHologram(page)
}

/** Demo menüsünden hazır bir senaryo tetikler (menü seçimden sonra kapanır) */
export async function triggerScenario(page: Page, id: string) {
  await page.locator('#tour-demo').click()
  await page.locator(`#demo-panel [data-scenario="${id}"]`).click()
}

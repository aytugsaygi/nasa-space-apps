import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, open, test } from './fixtures'

/*
 * Görsel karşılaştırma: ana sayfanın her ekran boyutunda, TR ve EN görüntüsü onaylı tabanla karşılaştırılır.
 * Tasarım istemeden değişirse bu test kırmızı olur.
 *
 * - Değişken öğeler gizlenir: 3D sahne (üstündeki başlık, açı, zoom ve ipuçları karşılaştırılır), görev saati ve
 *   canlı dalgalanan nabız değeri.
 * - Font çizimi işletim sistemine göre değiştiği için tabanlar platforma özeldir (dosya adında win32, linux, darwin).
 *   Bu platform için taban yoksa test atlanır. Taban üretmek ya da onaylı bir değişiklikten sonra güncellemek için:
 *   npm run test:e2e:update -- e2e/gorsel.spec.ts
 */

/** Değişken öğeleri gizleyen stil dosyası */
const HIDE_VOLATILE = fileURLToPath(new URL('./gorsel.css', import.meta.url))

test.use({ reducedMotion: 'reduce' })

/** Görüntünün alındığı sabit an: uyarı olmayan sakin bir saat (simülasyon ve görev saati buna göre hesaplanır) */
const FIXED_TIME = new Date('2026-11-09T18:45:00+03:00')

for (const lang of ['tr', 'en'] as const) {
  test.describe(lang.toUpperCase(), () => {
    test.use({ lang })

    test(`ana sayfa görünümü (${lang})`, async ({ page }) => {
      const name = `ana-sayfa-${lang}.png`
      const updating = ['all', 'changed'].includes(test.info().config.updateSnapshots)
      test.skip(!updating && !existsSync(test.info().snapshotPath(name)), 'Bu platform için onaylı görsel taban yok')

      // Simülasyon saate bağlıdır (gün içinde egzersiz saatlerinde nabız yükselir, uyarı çıkar); saat sabitlenir
      await page.clock.setFixedTime(FIXED_TIME)
      await open(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(name, {
        fullPage: true,
        stylePath: HIDE_VOLATILE,
      })
    })
  })
}

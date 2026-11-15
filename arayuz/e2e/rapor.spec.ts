import { activePage, expect, open, test } from './fixtures'

/* Yazdırılan (PDF) sağlık raporu: yazdırırken sayfanın tek içeriği, renkli durum etiketleri ve referans çubukları */
test('PDF raporu: yazdırma görünümünde yalnızca tasarlanmış rapor görünür; renkler korunur', async ({ page, t }) => {
  await open(page)
  for (let i = 0; i < 3; i++) await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')
  const report = page.locator('#print-report')
  // Ekranda görünmez
  await expect(report).toBeHidden()
  await expect(report.locator('tbody tr').first()).toBeAttached({ timeout: 15_000 })
  await page.emulateMedia({ media: 'print' })
  await expect(report).toBeVisible()
  await expect(report.locator('h1')).toContainText('E. Yıldız')
  await expect(report.locator('.pr-pill').first()).toHaveText(t.status.normal)
  expect(await report.locator('.pr-band').evaluate((el) => getComputedStyle(el).printColorAdjust || getComputedStyle(el).getPropertyValue('-webkit-print-color-adjust'))).toBe('exact')
  // Uygulamanın geri kalanı yazdırılmaz
  await expect(page.locator('#tour-report')).toBeHidden()
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  expect(pdf.byteLength).toBeGreaterThan(20_000)
})

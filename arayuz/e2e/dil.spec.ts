import { en } from '../src/i18n/en'
import { tr } from '../src/i18n/tr'
import { expect, open, test } from './fixtures'

test('dil İngilizceye geçer, yenilemede korunur ve Türkçeye döner', async ({ page }) => {
  await open(page)
  await expect(page).toHaveTitle(tr.meta.title)
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')

  const langs = page.getByRole('group', { name: tr.lang.label })
  await langs.getByRole('button', { name: 'English' }).click()
  await expect(page).toHaveTitle(en.meta.title)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('region', { name: en.hologram.section })).toBeVisible()
  await expect(page.getByRole('region', { name: en.panel.label })).toBeVisible()
  await expect(page.getByRole('button', { name: en.topbar.startTour })).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await page.getByRole('group', { name: en.lang.label }).getByRole('button', { name: 'Türkçe' }).click()
  await expect(page).toHaveTitle(tr.meta.title)
  await expect(page.getByRole('region', { name: tr.hologram.section })).toBeVisible()
})

test.describe('İngilizce arayüz', () => {
  test.use({ lang: 'en' })

  test('sayılar İngilizce biçimde, bölümler İngilizce adla görünür', async ({ page, t }) => {
    await open(page)
    // Ondalık ayırıcı nokta (Türkçede virgül)
    await expect(page.locator('[data-tool="temp"] [data-vital-card]')).toContainText(/\b3\d\.\d\b/)
    await expect(page.locator('[data-tool="hr"]')).toContainText('Heart rate')
    await expect(page.locator('[data-tool="bp"]')).toContainText('Blood pressure')
    await expect(page.getByRole('button', { name: t.hologram.zoomReset })).toHaveText('100%')
  })
})

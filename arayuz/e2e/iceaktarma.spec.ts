import { fileURLToPath } from 'node:url'
import { activePage, expect, open, test, tool } from './fixtures'

/*
 * Veri içe aktarma (mentör gösterimi): örnek nabız dosyası yüklenir → gezgin nabza ve verinin günlerine geçer →
 * dökümde "içe aktarma" görünür → Kaynaklar listesinde veri setinin adı. Bozuk dosya anlaşılır hata verir.
 * Örnek dosya kurgusaldır (adında "synthetic" yazar); NASA verisi gibi sunulmaz.
 */

const SAMPLE = fileURLToPath(new URL('../public/samples/heart-rate-synthetic-sample.csv', import.meta.url))

const toRecords = async (page: import('@playwright/test').Page) => {
  for (let i = 0; i < 3; i++) await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')
}

test('örnek CSV içe aktarılır: gezgin nabza geçer, dökümde içe aktarma, Kaynaklar listesinde veri seti', async ({ page, t }) => {
  const im = t.importer
  await open(page)
  await toRecords(page)
  await tool(page, 'explorer').locator('#explorer-import').click()
  const dialog = page.getByRole('dialog', { name: im.title })
  await expect(dialog).toBeVisible()
  await dialog.locator('#import-file').setInputFiles(SAMPLE)
  await expect(dialog.locator('#import-indicator')).toHaveValue('hr')
  await dialog.locator('#import-dataset').fill('Sentetik nabız örneği')
  await dialog.locator('#import-provider').fill('Health Atlas (synthetic)')
  // Yalnızca klavye: Devam ve İçe aktar düğmelerine Enter ile basılır
  await dialog.getByRole('button', { name: im.next }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog.locator('[data-import-counts]')).toContainText(im.valid(432))
  await expect(dialog.locator('[data-import-counts]')).toContainText(im.invalid(2))
  await dialog.locator('#import-submit').focus()
  await page.keyboard.press('Enter')

  await expect(dialog).toBeHidden()
  await expect(page.getByText(im.done(432, 2))).toBeVisible()
  const explorer = tool(page, 'explorer')
  await expect(explorer.locator('[data-explore="hr"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(explorer.getByRole('button', { name: t.drawer.periods.custom })).toHaveAttribute('aria-pressed', 'true')
  await expect(explorer).toContainText(t.drawer.origins.import)

  await page.getByRole('button', { name: t.topbar.sources }).click()
  const sources = page.getByRole('dialog', { name: t.sources.title })
  await expect(sources.locator('[data-imports]')).toContainText('Sentetik nabız örneği')
  await expect(sources.locator('[data-imports]')).toContainText(im.by.astronaut)
})

test('bozuk dosya anlaşılır hata verir; Kaynaklar penceresinden de açılır', async ({ page, t }) => {
  const im = t.importer
  await open(page)
  await page.getByRole('button', { name: t.topbar.sources }).click()
  await page.getByRole('dialog', { name: t.sources.title }).getByRole('button', { name: im.open }).click()
  const dialog = page.getByRole('dialog', { name: im.title })
  await expect(dialog).toBeVisible()
  await dialog.locator('#import-file').setInputFiles({ name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from('{bozuk') })
  await expect(dialog.getByRole('alert')).toHaveText(im.parseError)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

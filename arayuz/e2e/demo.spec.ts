import { bodyPart } from '../src/core/coach'
import { regionsFor } from '../src/data/regions'
import { resolve } from '../src/i18n'
import { expect, hologram, open, test, tool, triggerScenario } from './fixtures'

/**
 * Demo: "Başlangıç durumuna dön" bütün değerleri, şikayetleri ve hologramı normale döndürür; ardından demo menüsünden
 * seçilen bölgede seçilen sorun oluşturulur ve sistem (hologram, uyarı, bilgi kartı) buna tepki verir.
 */
test('başlangıç durumuna dönünce her şey normal olur; seçilen bölgede sorun oluşturulur', async ({ page, t, lang }) => {
  // Saat sabit: simülasyon sakin bir saatte (gün içindeki olağan bilgi notları dışında uyarı yok)
  await page.clock.setFixedTime(new Date('2026-11-09T18:45:00+03:00'))
  await open(page)
  const panel = tool(page, 'panel')
  const demo = page.locator('#demo-panel')

  // Ortalığı karıştır: sağ elde darbe ve ateş
  await triggerScenario(page, 'impactHand')
  await page.locator('#tour-demo').click()
  await demo.locator('[data-scenario="fever"]').click()
  await expect(tool(page, 'temp').locator('[data-vital-card]')).not.toHaveAttribute('data-status', 'normal', { timeout: 15_000 })
  await expect(panel).not.toContainText(t.panel.allGood)

  // Başlangıç durumuna dön
  await page.locator('#tour-demo').click()
  await demo.getByRole('button', { name: t.demo.reset }).click()
  await expect(page.getByText(t.demo.resetDone)).toBeVisible()
  await expect(panel).toContainText(t.panel.allGood, { timeout: 15_000 })
  for (const card of await page.locator('[data-page="0"] [data-vital-card]').all()) await expect(card).toHaveAttribute('data-status', 'normal')
  await expect(hologram(page).getByRole('list', { name: t.hologram.regionsList })).not.toContainText(t.status.dikkat)
  await expect(hologram(page).getByRole('list', { name: t.hologram.regionsList })).not.toContainText(t.status.kritik)

  // Seçilen bölgede sorun: sol ayakta darbe, şiddet 9
  await page.locator('#tour-demo').click()
  const section = demo.locator('[data-region-problem]')
  await section.getByLabel(t.demo.region, { exact: true }).selectOption('ayaklar')
  await section.getByRole('radio', { name: t.demo.sides.left }).click()
  await section.getByLabel(t.demo.problem, { exact: true }).selectOption('impact')
  await section.getByRole('slider').fill('9')
  await section.getByRole('button', { name: t.demo.create }).click()

  const part = resolve(bodyPart('ayaklar', 'left'), lang)
  const title = lang === 'tr' ? `${part.charAt(0).toLocaleUpperCase('tr-TR')}${part.slice(1)}: darbe bildirildi` : null
  const alert = page.locator('[data-alert-level="kritik"]').first()
  await expect(alert).toBeVisible({ timeout: 15_000 })
  if (title) await expect(alert).toContainText(title)
  // Tek açıklama kutusu: uyarının yanında ayrıca bir onay bildirimi ("Senaryo: …" vb.) çıkmaz
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: new RegExp(part, 'i') })).toHaveCount(1)
  const feet = regionsFor(lang).ayaklar.name
  await expect(panel).toContainText(feet)
  await expect(panel).toContainText(t.status.kritik)
  await expect(hologram(page).getByRole('list', { name: t.hologram.regionsList }).getByRole('button', { name: new RegExp(feet) })).toContainText(t.status.kritik)
})

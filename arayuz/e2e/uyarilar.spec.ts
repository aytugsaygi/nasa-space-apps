import { Engine } from '../src/core/engine'
import type { Finding } from '../src/core/model'
import { SCENARIOS, type ScenarioId } from '../src/core/scenarios'
import { MemoryStore } from '../src/core/store'
import { regionsFor } from '../src/data/regions'
import type { RegionId } from '../src/data/types'
import { expect, open, test, tool, triggerScenario } from './fixtures'

/**
 * Senaryonun üreteceği uyarı: aynı motor Node'da çalıştırılır (metinler teste gömülmez).
 * Tarayıcı da bu motoru kullanır (?backend=local), bu yüzden başlık ve seviye birebir aynıdır.
 */
function expected(id: ScenarioId): Finding {
  const engine = new Engine(new MemoryStore())
  engine.tick('yildiz')
  engine.triggerScenario('yildiz', id)
  return engine.tick('yildiz').fresh[0]
}

test('demo senaryoları (su, nabız, sağ elde darbe): uyarı nedeni ve bölgesiyle gelir', async ({ page, t, lang }) => {
  await open(page)
  const toasts = page.locator('[data-sonner-toast]')

  const water = expected('waterMissed')
  await triggerScenario(page, 'waterMissed')
  await expect(toasts.filter({ hasText: water.title[lang] })).toBeVisible()
  await expect(toasts.filter({ hasText: water.title[lang] })).toContainText(water.action[lang])

  // Nabız kartı yükselir ve durumu "Dikkat" olur
  const hr = expected('hrHigh')
  await triggerScenario(page, 'hrHigh')
  await expect(toasts.filter({ hasText: hr.title[lang] })).toBeVisible()
  await expect(tool(page, 'hr').locator('[data-vital-card]')).toHaveAttribute('data-status', 'dikkat', { timeout: 15_000 })
  await expect(tool(page, 'hr')).toContainText(t.status.dikkat)

  // Kritik: bölge kritik olur, bildirimden bölge kartı uyarıyla açılır; hekime bildirildiği yazılır
  const impact = expected('impactHand')
  expect(impact.level).toBe('kritik')
  await triggerScenario(page, 'impactHand')
  const critical = toasts.filter({ hasText: impact.title[lang] })
  await expect(critical).toBeVisible()
  await expect(critical).toContainText(t.alerts.notified)
  await critical.getByRole('button', { name: t.toast.openRegion }).click()
  const panel = tool(page, 'panel')
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(regionsFor(lang)[impact.region as RegionId].name)
  await expect(panel.getByRole('alert')).toContainText(impact.title[lang])
  await expect(panel).toContainText(t.status.kritik)

  // Bildirim geçmişi üç uyarıyı da listeler (günün saatine göre su uyarısı önce bilgi seviyesinde gelmiş olabilir;
  // seviye yükselince yeniden bildirilir, bu yüzden aynı başlık iki kez görünebilir)
  await page.locator('#tour-alerts').click()
  const history = page.getByRole('dialog', { name: t.topbar.notifications })
  for (const f of [water, hr, impact]) await expect(history.getByText(f.title[lang], { exact: true }).first()).toBeVisible()
})

test('demo menüsünden senaryo tetiklenir ve demo sıfırlanır', async ({ page, t, lang }) => {
  await open(page)
  const bpLow = SCENARIOS.find((s) => s.id === 'bpLow')!
  const finding = expected('bpLow')
  await page.locator('#tour-demo').click()
  await page.locator('#demo-panel').getByRole('button', { name: bpLow.label[lang] }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: finding.title[lang] })).toBeVisible()
  await expect(tool(page, 'bp').locator('[data-vital-card]')).not.toHaveAttribute('data-status', 'normal', { timeout: 15_000 })

  await page.locator('#tour-demo').click()
  await page.locator('#demo-panel').getByRole('button', { name: t.demo.reset }).click()
  await expect(page.getByText(t.demo.resetDone)).toBeVisible()
  await expect(tool(page, 'bp').locator('[data-vital-card]')).toHaveAttribute('data-status', 'normal', { timeout: 15_000 })
})

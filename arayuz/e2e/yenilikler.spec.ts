import { ENV_PLANS } from '../src/core/coach'
import { SOURCES } from '../src/core/sources'
import { activePage, expect, open, test, tool, triggerScenario } from './fixtures'

/*
 * Denetim sonrası eklenenler: ortama göre program (R-02, R-06), kişisel bilgiler ve kişisel normal (U-04),
 * kontrol takvimi (R-05), kan tahlili geçmişi, rapor referans sütunu (D-02), mürettebat uyarısı (D-06),
 * içe aktarılan veri setleri (VM-10), veri kaynağı (VM-04) ve asistan kaynakları (P-04).
 */

const goTo = async (page: import('@playwright/test').Page, n: number) => {
  for (let i = 0; i < n; i++) await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', String(n))
}

test('spor programı istasyon programıdır (~120 dk ARED/T2/CEVIS); ortam seçici yok, kaynakları görünür', async ({ page, t, lang }) => {
  await open(page)
  await goTo(page, 2)
  const program = tool(page, 'program')
  await expect(program).toContainText(t.sport.programSub(0, 120))
  await expect(program).toContainText(t.sport.stationProgram)
  await expect(page.locator('#program-environment')).toHaveCount(0)
  await expect(program.locator('[data-exercise^="fly"]')).toHaveCount(0)
  // Program notu ve kaynaklar kartta yazılı durmaz; "i" düğmesinde açılır, Escape kapatır
  await expect(program.locator('[data-env-note]')).toHaveCount(0)
  await program.locator('#program-info').click()
  await expect(program.locator('[data-env-note]')).toHaveText(ENV_PLANS.iss.note[lang])
  await expect(program.getByRole('link', { name: /Astronaut Exercise/ })).toHaveAttribute('href', SOURCES.nasaExercise.url)
  await page.keyboard.press('Escape')
  await expect(program.locator('#program-info-panel')).toHaveCount(0)
})

test('kişisel bilgiler değiştirilebilir; vücut kitle indeksi ve kişisel normal güncellenir', async ({ page, t }) => {
  await open(page)
  await page.locator('#tour-profile').click()
  await page.locator('#personal-info-button').click()
  const sheet = page.locator('#personal-info')
  await expect(sheet.locator('input[name="age"]')).toHaveValue('36')
  await expect(sheet.locator('[data-bmi]')).toHaveText('21,6')
  await expect(sheet.locator('[data-personal-normal]')).toContainText(t.personal.basisData(14))

  await sheet.locator('input[name="weightKg"]').fill('70')
  await sheet.getByRole('button', { name: t.personal.save }).click()
  await expect(sheet.getByRole('status')).toHaveText(t.personal.saved)
  await expect(sheet.locator('[data-bmi]')).toHaveText('24,8')
  await expect(sheet.locator('[data-personal-normal]')).toContainText(t.personal.basisBaseline)

  // Sınır dışı değerde kaydet düğmesi pasif
  await sheet.locator('input[name="age"]').fill('12')
  await expect(sheet.getByRole('button', { name: t.personal.save })).toBeDisabled()

  // Yenilemede korunur
  await page.keyboard.press('Escape')
  await page.reload()
  await page.locator('#tour-profile').click()
  await page.locator('#personal-info-button').click()
  await expect(page.locator('#personal-info input[name="weightKg"]')).toHaveValue('70')
})

test('kontrol takvimi geciken, bugünkü ve planlı kontrolleri gösterir; satır ilgili sayfaya götürür', async ({ page, t }) => {
  await open(page)
  await page.locator('#schedule-button').click()
  const sheet = page.locator('#schedule-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('[data-status="upcoming"]').first()).toBeVisible()
  await expect(sheet.locator('[data-check="blood"]').first()).toContainText(t.schedule.status.upcoming)
  // Panel ekranın sağında (kartın içinde değil)
  const box = (await sheet.boundingBox())!
  expect(box.x + box.width).toBeGreaterThan(page.viewportSize()!.width - 30)
  await sheet.locator('[data-check="blood"]').first().getByRole('button').click()
  await expect(sheet).toBeHidden()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')
})

test('gösterge ayrıntısı verinin kaynağını ve nabızda kişisel normali gösterir', async ({ page, t }) => {
  await open(page)
  await tool(page, 'hr').locator('[data-vital-card]').click()
  await expect(page.locator('[data-latest-source="sim"]')).toContainText(t.vital.sourceSim)
  await expect(page.locator('[data-composition]')).toContainText(t.drawer.origins.sim)
  await expect(page.locator('[data-personal-normal]')).toContainText(t.drawer.personal('').trim())
})

test('kan tahlilleri son analiz edilen örnekle açılır; tüm tahliller tablosu geçmişi gösterir', async ({ page, t }) => {
  await open(page)
  await goTo(page, 3)
  const labs = tool(page, 'labs')
  await expect(labs.getByRole('button', { name: t.doctor.draw(90) })).toHaveAttribute('aria-pressed', 'true')
  await expect(labs.locator('tbody tr').first()).toBeVisible()
  await labs.getByRole('button', { name: t.doctor.labsHistory }).click()
  const hist = labs.locator('[data-lab-history]')
  await expect(hist.locator('thead th')).toHaveCount(2 + 6)
  // Tablo karta sığar
  const fits = await hist.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  expect(fits).toBe(true)
})

test('hekim raporunda her göstergenin referans aralığı var', async ({ page, t }) => {
  await open(page)
  await goTo(page, 3)
  const report = tool(page, 'report')
  await expect(report.getByRole('columnheader', { name: t.doctor.colRef })).toBeVisible()
  await expect(report.locator('[data-ref]').first()).toHaveText('60–100')
  await expect(report).toContainText(t.doctor.todaySoFar)
})

test('kritik uyarı mürettebat arkadaşına gider; arkadaş kendi ekranında görür', async ({ page }) => {
  // Saat sabitlenir: günün bazı saatlerinde simülasyonun kendi uyarıları bildirimleri doldurur ve bu bildirim görünmeyebilir
  await page.clock.setFixedTime(new Date('2026-11-09T18:45:00+03:00'))
  await open(page)
  await triggerScenario(page, 'impactHand')
  await expect(page.locator('[data-alert-level="kritik"]').first()).toBeVisible()
  await page.locator('#tour-profile').click()
  await page.locator('[data-profile="okafor"]').click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Mürettebat uyarısı: E\. Yıldız/ })).toBeVisible({ timeout: 15_000 })
})

test('kaynaklar ekranında içe aktarılan veri setleri bölümü var', async ({ page, t }) => {
  await open(page)
  await page.getByRole('button', { name: t.topbar.sources }).click()
  const section = page.locator('[data-imports]')
  await expect(section).toContainText(t.sources.imported)
  await expect(section).toContainText(t.sources.noImports)
  await expect(page.getByRole('dialog')).toContainText(SOURCES.orionLife.title)
})

test('asistanın bilgi veren cevabında kaynak bağlantısı olur', async ({ page, t }) => {
  await open(page)
  await page.locator('#tour-assistant').click()
  const input = page.getByLabel(t.chat.inputLabel)
  await input.fill('Elim kanıyor, ne yapabilirim?')
  await input.press('Enter')
  const src = page.locator('[data-sources]').last()
  await expect(src).toBeVisible({ timeout: 20_000 })
  await expect(src.getByRole('link').first()).toHaveAttribute('href', SOURCES.mpBleeding.url)
})

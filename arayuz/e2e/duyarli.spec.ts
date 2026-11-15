import { MIND_PAGE, PAGE_TOOLS } from '../src/lib/layout'
import { activePage, expect, open, test } from './fixtures'

/*
 * Bütün ekran boyutlarında çalışır (playwright.config.ts → ALL_SIZES):
 * 1440, 1280, 768 ve 390 piksel genişlikte arayüzün taşmadan ve eksiksiz göründüğünü denetler.
 */

test('bütün bölümler ekrana sığar; hiçbir bölüm yatayda taşmaz', async ({ page }) => {
  await open(page)
  const vw = page.viewportSize()!.width
  const tools = activePage(page).locator('[data-tool]')
  await expect(tools).toHaveCount(PAGE_TOOLS[0].length)
  for (const item of await tools.all()) {
    await item.scrollIntoViewIfNeeded()
    const box = (await item.boundingBox())!
    expect(box.width).toBeGreaterThan(100)
    expect(box.height).toBeGreaterThan(40)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vw)
  }
})

test('zihinsel sağlık sayfası her genişlikte sığar; eylem düğmeleri en az 44 piksel', async ({ page, t }) => {
  await open(page)
  await page.locator('#page-next').click()
  const mind = activePage(page)
  await expect(mind).toHaveAttribute('data-page', String(MIND_PAGE))
  const vw = page.viewportSize()!.width
  const tools = mind.locator('[data-tool]')
  await expect(tools).toHaveCount(PAGE_TOOLS[MIND_PAGE].length)
  for (const item of await tools.all()) {
    await item.scrollIntoViewIfNeeded()
    const box = (await item.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(vw)
  }
  await expect(mind.getByRole('list', { name: t.mindPage.windowsLabel }).getByRole('article')).toHaveCount(3)
  const l = t.mindPage.library
  for (const name of [t.mindPage.records, l.open(l.journal.title), l.open(t.reaction.title)]) {
    const box = (await mind.getByRole('button', { name, exact: true }).boundingBox())!
    expect(box.x + box.width, name).toBeLessThanOrEqual(vw)
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
  }
})

test('check-in formu her genişlikte ekrana sığar', async ({ page, t }) => {
  await open(page)
  await page.locator('#page-next').click()
  const mind = activePage(page)
  await mind.locator('article[aria-current="time"]').getByRole('button', { name: new RegExp(`^${t.mindPage.start}`) }).click()
  const dialog = page.locator('#checkin-dialog')
  await expect(dialog.getByRole('group', { name: t.mindPage.form.questions.physical.label })).toBeVisible()
  const { width: vw, height: vh } = page.viewportSize()!
  // Panel ortada açılır: yerine oturunca ölçülür
  const fits = () =>
    expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!
        return box.x >= 0 && box.x + box.width <= vw && box.y >= 0 && box.y + box.height <= vh + 1
      })
      .toBe(true)
  await fits()
  expect((await dialog.getByRole('button', { name: t.mindPage.form.next }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // Özet ve Kaydet de ekrana sığar
  const next = dialog.getByRole('button', { name: t.mindPage.form.next })
  for (let i = 0; i < 40 && !(await dialog.locator('[data-summary]').count()); i++) {
    if (await next.count()) await next.click()
    await page.waitForTimeout(150)
  }
  const save = dialog.getByRole('button', { name: t.mindPage.form.save })
  await expect(save).toBeVisible()
  await fits()
  const s = (await save.boundingBox())!
  expect(s.height).toBeGreaterThanOrEqual(44)
  expect(s.y + s.height).toBeLessThanOrEqual(vh)
})

test('hekimle iletişim penceresi her genişlikte ekrana sığar', async ({ page, t }) => {
  await open(page)
  await page.locator('#page-next').click()
  await page.locator('#emergency-button').click()
  await page.locator('#emergency-dialog').getByRole('button', { name: t.mindPage.sos.notUrgent }).click()
  const dialog = page.locator('#doctor-contact')
  await expect(dialog.getByRole('group', { name: t.mindPage.contact.recipient })).toBeVisible()
  const vw = page.viewportSize()!.width
  await expect.poll(async () => {
    const box = (await dialog.boundingBox())!
    return box.x >= 0 && box.x + box.width <= vw
  }).toBe(true)
})

test('üst bar düğmeleri ekranda ve en az 36 piksel', async ({ page, t }) => {
  await open(page)
  const vw = page.viewportSize()!.width
  for (const name of [t.layout.openMenu, t.topbar.startTour, t.topbar.sources, t.topbar.soundLabel]) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
    expect(box.x + box.width, name).toBeLessThanOrEqual(vw)
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(36)
  }
})

test('bölge kartı ve hologram dar ekranda da açılır', async ({ page, t }) => {
  await open(page)
  const holo = activePage(page).locator('#tour-hologram')
  await expect(holo.locator('canvas').first()).toBeVisible()
  await holo.getByRole('button', { name: /^Göğüs/ }).click()
  const panel = activePage(page).locator('#tour-panel')
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText(/Göğüs/)
  await expect(panel.getByRole('button', { name: t.panel.close })).toBeVisible()
})

test('zihin egzersizleri penceresi her genişlikte sığar; kartlar, başlat ve cevap düğmeleri en az 44 piksel', async ({ page, t }) => {
  const m = t.mindTraining
  const l = t.mindPage.library
  await open(page)
  await page.locator('#page-next').click()
  await activePage(page).getByRole('button', { name: l.open(l.mindGames.title) }).click()
  const dialog = page.locator('#mind-training')
  const vw = page.viewportSize()!.width
  const fits = async (el: import('@playwright/test').Locator, name: string) => {
    await el.scrollIntoViewIfNeeded()
    const box = (await el.boundingBox())!
    expect(box.x, name).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, name).toBeLessThanOrEqual(vw)
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
  }
  for (const ex of ['speed', 'memory', 'spatial'] as const) await fits(dialog.getByRole('button', { name: m.open(m.names[ex]) }), ex)
  await dialog.getByRole('button', { name: m.open(m.names.spatial) }).click()
  await fits(dialog.locator('#mind-start'), 'start')
  await dialog.locator('#mind-start').click()
  for (const a of ['same', 'mirror']) await fits(dialog.locator(`[data-spatial-answer="${a}"]`), a)
  await expect.poll(async () => {
    const box = (await dialog.boundingBox())!
    return box.x >= 0 && box.x + box.width <= vw
  }).toBe(true)
})

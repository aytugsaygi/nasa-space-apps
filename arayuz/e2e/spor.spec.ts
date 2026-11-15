import { activePage, expect, open, test, tool } from './fixtures'

/*
 * Hologram antrenörün oynatma durumu: programdaki düğme gösterilen harekette duraklat/sürdür olur, başka sayfaya
 * geçince hareket duraklar.
 */

const goTo = async (page: import('@playwright/test').Page, n: number) => {
  const now = Number(await activePage(page).getAttribute('data-page'))
  const dir = n > now ? '#page-next' : '#page-prev'
  for (let i = 0; i < Math.abs(n - now); i++) await page.locator(dir).click()
  await expect(activePage(page)).toHaveAttribute('data-page', String(n))
}

test('gösterilen harekette program düğmesine tekrar basınca hareket duraklar, bir daha basınca sürer', async ({ page, t }) => {
  // Antrenör modeli ve çözücüsü yereldir: dış sunucuya istek gitmez
  const external: string[] = []
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname
    if (r.url().startsWith('http') && host !== 'localhost' && host !== '127.0.0.1') external.push(host)
  })
  await open(page)
  await goTo(page, 2)
  const button = tool(page, 'program').locator('li').first().getByRole('button', { name: /hologram/ })
  await expect(button).toHaveAttribute('data-state', 'idle')

  const trainer = tool(page, 'trainer')
  const stop = tool(page, 'program').locator('li').first().locator('[data-stop]')
  await expect(stop).toHaveCount(0)

  await button.click()
  await expect(button).toHaveAttribute('data-state', 'playing')
  await expect(button).toHaveText(t.sport.showing)
  // Antrenör penceresinde oynatma düğmesi yok; bitir düğmesi programda, Göster'in yanında açılır
  await expect(trainer.locator('#tour-trainer').getByRole('button')).toHaveCount(0)
  await expect(stop).toBeVisible()

  await button.click()
  await expect(button).toHaveAttribute('data-state', 'paused')
  await expect(button).toHaveText(t.sport.paused)
  await expect(stop).toBeVisible()

  await button.click()
  await expect(button).toHaveAttribute('data-state', 'playing')
  await expect(trainer.locator('canvas')).toBeVisible()

  // Bitir: hareket kapanır, düğme Göster'e döner ve bitir düğmesi kaybolur
  await stop.click()
  await expect(button).toHaveAttribute('data-state', 'idle')
  await expect(stop).toHaveCount(0)
  await expect(trainer).toContainText(t.sport.idle)
  expect(external).toEqual([])
})

test('hareket oynarken başka sayfaya geçilince hareket bırakılır; dönünce hologram normal görünümdedir', async ({ page, t }) => {
  await open(page)
  await goTo(page, 2)
  const button = tool(page, 'program').locator('li').first().getByRole('button', { name: /hologram/ })
  await button.click()
  await expect(button).toHaveAttribute('data-state', 'playing')
  await expect(tool(page, 'trainer')).not.toContainText(t.sport.idle)

  await goTo(page, 1)
  await goTo(page, 2)
  await expect(button).toHaveAttribute('data-state', 'idle')
  await expect(tool(page, 'trainer')).toContainText(t.sport.idle)
  // Yeniden başlatılabilir
  await button.click()
  await expect(button).toHaveAttribute('data-state', 'playing')
})

test('demo sıfırlanınca hareket bırakılır ve antrenör hologramı ilk görünümüne döner', async ({ page, t }) => {
  await open(page)
  await goTo(page, 2)
  const button = tool(page, 'program').locator('li').first().getByRole('button', { name: /hologram/ })
  await button.click()
  await expect(button).toHaveAttribute('data-state', 'playing')
  const canvas = tool(page, 'trainer').locator('canvas')
  await canvas.evaluate((el) => el.setAttribute('data-before-reset', '1'))

  await page.locator('#tour-demo').click()
  await page.locator('#demo-panel').getByRole('button', { name: t.demo.reset }).click()
  await expect(page.getByText(t.demo.resetDone)).toBeVisible()
  await expect(button).toHaveAttribute('data-state', 'idle')
  await expect(tool(page, 'trainer')).toContainText(t.sport.idle)
  // Sahne yeniden kuruldu: kamera ve açı baştan başlar
  await expect(tool(page, 'trainer').locator('canvas[data-before-reset]')).toHaveCount(0)
})

test('spor koçundaki halkaya basınca gösterge gezgininde Spor grafiği açılır; üstüne gelince ipucu görünür', async ({ page, t }) => {
  await open(page)
  await goTo(page, 2)
  const ring = tool(page, 'coach').locator('[data-coach-ring]')
  await ring.hover()
  await expect(page.getByText(t.sport.ringTip, { exact: true })).toBeVisible()
  await ring.click()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')
  const explorer = tool(page, 'explorer')
  await expect(explorer.locator('[data-explore-sport]')).toHaveAttribute('aria-pressed', 'true')
  await expect(explorer.locator('[data-sport-summary]')).toContainText(t.sport.sportSummary.target(120))
})

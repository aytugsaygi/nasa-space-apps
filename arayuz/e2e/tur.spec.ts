import type { Page } from '@playwright/test'
import { tourFor } from '../src/data/content'
import { expect, open, test, type Dict, type Lang } from './fixtures'

// Her adım menü, sayfa geçişi ve kayma animasyonlarını bekler
test.describe.configure({ timeout: 240_000 })

/** Turu baştan sona oynatır; her adımda hedefin ekranda olduğunu ve sayfanın yana kaymadığını denetler */
async function playTour(page: Page, t: Dict, lang: Lang) {
  const steps = tourFor(lang)
  await page.getByRole('button', { name: t.topbar.startTour }).click()
  const popover = page.locator('.driver-popover')
  const ring = page.locator('#tour-ring')

  for (const [i, step] of steps.entries()) {
    await expect(popover.locator('.driver-popover-title')).toHaveText(step.title)
    // Adım başka bir sayfadaysa tur o sayfaya geçer
    await expect(page.locator('[data-page]:not([inert])')).toHaveAttribute('data-page', String(step.page ?? 0))
    await expect(popover.locator('.driver-popover-progress-text')).toHaveText(`${i + 1} / ${steps.length}`)
    await expect(ring).toHaveCSS('opacity', '1')

    const box = (await ring.boundingBox())!
    const vw = page.viewportSize()!.width
    expect(box.width, `${i + 1}. adımın vurgusu ekran genişliğinde bir şerit olmamalı`).toBeLessThan(vw - 40)
    expect(box.x, `${i + 1}. adım`).toBeGreaterThanOrEqual(-1)
    expect(box.x + box.width, `${i + 1}. adım`).toBeLessThanOrEqual(vw + 1)
    expect(await page.evaluate(() => window.scrollX), `${i + 1}. adımda sayfa yana kaymamalı`).toBe(0)

    const last = i === steps.length - 1
    await popover.getByRole('button', { name: last ? t.tour.done : t.tour.next }).click()
  }
  await expect(popover).toHaveCount(0)
  // Tur bitince halka sayfadan kaldırılır
  await expect(ring).toHaveCount(0)
}

test('rehber tur dört sayfayı gezerek bütün arayüzü gösterir', async ({ page, t, lang }) => {
  await open(page)
  await playTour(page, t, lang)
})

test('başka bir sayfadayken başlatılan tur ana sayfadan başlar', async ({ page, t, lang }) => {
  await open(page)
  await page.locator('#page-next').click()
  await page.locator('#page-next').click()
  await expect(page.locator('[data-page]:not([inert])')).toHaveAttribute('data-page', '2')
  await playTour(page, t, lang)
})

test.describe('İngilizce', () => {
  test.use({ lang: 'en' })

  test('tur İngilizce metinlerle oynar', async ({ page, t, lang }) => {
    await open(page)
    await playTour(page, t, lang)
  })
})

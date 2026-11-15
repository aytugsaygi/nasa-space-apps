import { expect, open, test } from './fixtures'

test.describe('açılış', () => {
  test.use({ skipIntro: false })

  test('ilk açılışta açılış ekranı gelir, atlanınca arayüz açılır ve oturumda bir daha gelmez', async ({ page, t }) => {
    await page.goto('/')
    const skip = page.getByRole('button', { name: t.intro.skip }).first()
    await expect(page.getByRole('button', { name: t.intro.start })).toBeVisible()
    await skip.click()
    await expect(page.getByRole('button', { name: t.intro.start })).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('#tour-hologram')).toBeVisible()
    // Kayıt, açılış animasyonu bitince yazılır
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vitalis.introSeen'))).toBe('1')

    await page.reload()
    await expect(page.locator('#tour-hologram')).toBeVisible()
    await expect(page.getByRole('button', { name: t.intro.start })).toHaveCount(0)
  })
})

test('?intro ile açılış zorla oynatılır', async ({ page, t }) => {
  await page.goto('/?intro')
  await expect(page.getByRole('button', { name: t.intro.start })).toBeVisible()
})

test('kaynaklar penceresinde lisanslar görünür; açılış tekrar oynatılabilir', async ({ page, t }) => {
  await open(page)
  await page.getByRole('button', { name: t.topbar.sources }).click()
  const dialog = page.getByRole('dialog', { name: t.sources.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Z-Anatomy')
  await expect(dialog).toContainText('CC BY-SA 4.0')
  await expect(dialog).toContainText(t.sources.fictional)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: t.topbar.sources }).click()
  await dialog.getByRole('button', { name: t.sources.replayIntro }).click()
  await expect(page.getByRole('button', { name: t.intro.start })).toBeVisible()
})

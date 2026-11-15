import { expect, hologram, open, test, tool } from './fixtures'

test.describe('hologram', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('tekerlek yalnızca 3D alanda yakınlaştırır; sıfırlama geri alır', async ({ page, t }) => {
    const holo = hologram(page)
    const area = holo.getByRole('application')
    const reset = holo.getByRole('button', { name: t.hologram.zoomReset })
    await expect(reset).toBeDisabled()
    await expect(reset).toHaveText('%100')

    const box = (await area.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    await expect(reset).toBeEnabled()
    await expect(reset).not.toHaveText('%100')
    // Sayfa kaymaz
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await reset.click()
    await expect(reset).toBeDisabled()
    await expect(reset).toHaveText('%100')
  })

  test('yakınlaştırma düğmeleri ve klavye kısayolları çalışır', async ({ page, t }) => {
    const holo = hologram(page)
    const zoomIn = holo.getByRole('button', { name: t.hologram.zoomIn, exact: true })
    const zoomOut = holo.getByRole('button', { name: t.hologram.zoomOut, exact: true })
    const reset = holo.getByRole('button', { name: t.hologram.zoomReset })

    await expect(zoomOut).toBeDisabled()
    await zoomIn.click()
    await expect(reset).toHaveText('%125')
    await zoomOut.click()
    await expect(reset).toHaveText('%100')

    // Klavye: + yakınlaştırır, 0 sıfırlar
    await holo.getByRole('application').focus()
    await page.keyboard.press('+')
    await page.keyboard.press('+')
    await expect(reset).toBeEnabled()
    await page.keyboard.press('0')
    await expect(reset).toHaveText('%100')

    // Üst sınır %500
    for (let i = 0; i < 10; i++) await page.keyboard.press('+')
    await expect(reset).toHaveText('%500')
    await expect(zoomIn).toBeDisabled()
  })

  test('sabitlenmemiş hologramda tekerlek yakınlaştırmaz', async ({ page, t }) => {
    await tool(page, 'hologram').hover()
    await page.getByRole('button', { name: t.layout.unpinLabel(t.hologram.bodyMap) }).click()
    const box = (await hologram(page).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    await expect(hologram(page).getByRole('button', { name: t.hologram.zoomReset })).toHaveText('%100')
  })

  test('katmanlara ayırınca tek katman seçilebilir, "Tümü" iki katmana döner', async ({ page, t }) => {
    const holo = hologram(page)
    const explode = holo.getByRole('button', { name: t.hologram.explode })
    await explode.click()
    await expect(holo.getByRole('button', { name: t.hologram.merge })).toHaveAttribute('aria-pressed', 'true')
    await expect(holo.getByText(t.hologram.modeLayers)).toBeVisible()

    const layers = holo.getByRole('group', { name: t.hologram.layersList })
    const all = layers.getByRole('button', { name: t.hologram.all, exact: true })
    await expect(all).toHaveAttribute('aria-pressed', 'true')

    const muscles = layers.getByRole('button', { name: /Kas sistemi/ })
    await muscles.click()
    await expect(muscles).toHaveAttribute('aria-pressed', 'true')
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await expect(holo.getByText(t.hologram.modeFocus)).toBeVisible()

    // Tek katmanda yakınlaştırma, katman değişince korunur; "Tümü"de sıfırlanır
    await holo.getByRole('button', { name: t.hologram.zoomIn, exact: true }).click()
    await layers.getByRole('button', { name: /İskelet sistemi/ }).click()
    await expect(holo.getByRole('button', { name: t.hologram.zoomReset })).toHaveText('%125')
    await all.click()
    await expect(holo.getByRole('button', { name: t.hologram.zoomReset })).toHaveText('%100')

    // Birleştir: bölge listesi geri gelir
    await holo.getByRole('button', { name: t.hologram.merge }).click()
    await expect(holo.getByRole('list', { name: t.hologram.regionsList })).toBeVisible()
  })

  test('bölge listesinden seçilen bölgenin kartı bilgi panelinde açılır', async ({ page, t }) => {
    const holo = hologram(page)
    const chest = holo.getByRole('list', { name: t.hologram.regionsList }).getByRole('button', { name: /^Göğüs/ })
    await chest.click()
    await expect(chest).toHaveAttribute('aria-pressed', 'true')
    const panel = tool(page, 'panel')
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(/Göğüs/)
    await panel.getByRole('button', { name: t.panel.close }).click()
    await expect(chest).toHaveAttribute('aria-pressed', 'false')
  })

  test('ön ve arka görünüm düğmeleri figürü döndürür', async ({ page, t }) => {
    const holo = hologram(page)
    const angle = holo.locator('span.tabular').first()
    await holo.getByRole('button', { name: t.hologram.back, exact: true }).click()
    await expect(angle).toHaveText('180°')
    await holo.getByRole('button', { name: t.hologram.front, exact: true }).click()
    await expect(angle).toHaveText('000°')
  })
})

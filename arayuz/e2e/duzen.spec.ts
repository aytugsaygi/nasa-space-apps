import { INDICATORS, MAIN_INDICATORS } from '../src/core/catalog'
import { PAGE_TOOLS } from '../src/lib/layout'
import { activePage, expect, open, test, tool } from './fixtures'

const MAIN_COUNT = PAGE_TOOLS[0].length

test.describe('pano düzeni', () => {
  test.beforeEach(async ({ page }) => {
    await open(page)
  })

  test('ana sayfa varsayılan düzende: 8 gösterge kartı, hologram, bilgi kartı ve yapılacaklar, hepsi sabit', async ({ page, t }) => {
    const p = activePage(page)
    await expect(p).toHaveAttribute('data-page', '0')
    await expect(p.locator('[data-vital-card]')).toHaveCount(MAIN_INDICATORS.length)
    await expect(p.locator('#tour-hologram')).toBeVisible()
    await expect(p.locator('#tour-panel')).toBeVisible()
    await expect(p.locator('#tour-todo')).toBeVisible()
    await expect(p.locator('[data-tool]')).toHaveCount(MAIN_COUNT)
    await expect(p.locator('[data-tool][data-pinned]')).toHaveCount(MAIN_COUNT)
    await expect(p.getByRole('button', { name: t.layout.unpinLabel(t.tools.hologram) })).toHaveAttribute('aria-pressed', 'true')

    // Geniş ekranda gösterge kartları üstte iki sıra; altta soldan sağa hologram, bilgi kartı, yapılacaklar
    const holo = (await tool(page, 'hologram').boundingBox())!
    const panel = (await tool(page, 'panel').boundingBox())!
    const todo = (await tool(page, 'todo').boundingBox())!
    const mood = (await tool(page, 'mood').boundingBox())!
    expect(mood.y + mood.height).toBeLessThanOrEqual(holo.y)
    expect(holo.x + holo.width).toBeLessThanOrEqual(panel.x)
    expect(panel.x + panel.width).toBeLessThanOrEqual(todo.x)
    expect(Math.abs(holo.y - panel.y)).toBeLessThan(2)
    expect(Math.abs(panel.y - todo.y)).toBeLessThan(2)
  })

  test('sayfa okları dört sayfayı gezer; her sayfa kendi bölümleriyle gelir, açık olmayan sayfa etkileşime kapalıdır', async ({ page, t }) => {
    const next = page.locator('#page-next')
    for (let i = 1; i < 4; i++) {
      await expect(next).toHaveAttribute('aria-label', t.layout.goToPage(t.layout.pageNames[i]))
      await next.click()
      await expect(activePage(page)).toHaveAttribute('data-page', String(i))
      await expect(page.locator('[data-page="0"]')).toHaveAttribute('inert', '')
      for (const id of PAGE_TOOLS[i]) await expect(tool(page, id)).toHaveCount(1)
    }
    await expect(page.locator('#page-next')).toHaveCount(0)

    for (let i = 0; i < 3; i++) await page.locator('#page-prev').click()
    await expect(activePage(page)).toHaveAttribute('data-page', '0')
    await expect(page.locator('#page-prev')).toHaveCount(0)
  })

  test('menüden gizlenen bölüm kaybolur, yenilemede gizli kalır; yeniden gösterilince sabitlenmemiş gelir', async ({ page, t, lang }) => {
    const pulse = INDICATORS.hr.name[lang]
    await page.locator('#tools-menu-button').click()
    const menu = page.getByRole('dialog', { name: t.layout.title })
    await menu.getByRole('button', { name: t.layout.hideTool(pulse) }).click()
    await expect(tool(page, 'hr')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()

    await page.reload()
    await expect(activePage(page).locator('[data-vital-card]')).toHaveCount(MAIN_INDICATORS.length - 1)

    await page.locator('#tools-menu-button').click()
    await menu.getByRole('button', { name: t.layout.showTool(pulse) }).click()
    await expect(menu.getByText(t.layout.stateLoose)).toBeVisible()
    await page.keyboard.press('Escape')

    // Sabitlenmemiş bölüm kesik çizgili çerçeveyle gelir; iğneyle sabitlenir
    const item = tool(page, 'hr')
    await expect(item).not.toHaveAttribute('data-pinned', '')
    await expect(item.locator('.tool-move')).toBeVisible()
    await item.hover()
    await item.getByRole('button', { name: t.layout.pinLabel(pulse) }).click()
    await expect(item).toHaveAttribute('data-pinned', 'true')
  })

  test('X düğmesi 1 saniye basılı tutulunca bölüm kalkar; kısa basışta ipucu çıkar', async ({ page, t, lang }) => {
    const item = tool(page, 'spo2')
    await item.hover()
    const remove = item.getByRole('button', { name: t.layout.removeLabel(INDICATORS.spo2.name[lang]) })

    await remove.click()
    await expect(item.getByText(t.layout.removeHint)).toBeVisible()
    await expect(item).toBeVisible()

    const box = (await remove.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(remove).toHaveAttribute('data-holding', 'true')
    // Süre dolunca bölüm, fare bırakılmadan kalkar (fare erken bırakılırsa meşgul tarayıcıda süre kayabilir)
    await expect(tool(page, 'spo2')).toHaveCount(0, { timeout: 5000 })
    await page.mouse.up()
    await expect(activePage(page).locator('[data-vital-card]')).toHaveCount(MAIN_INDICATORS.length - 1)
  })

  test('profiller ayrı düzen tutar; sıfırlama onayla ilk hale döner ve geri alınabilir', async ({ page, t }) => {
    await page.locator('#tools-menu-button').click()
    const menu = page.getByRole('dialog', { name: t.layout.title })
    const resetBtn = menu.getByRole('button', { name: t.layout.reset })
    await expect(resetBtn).toBeDisabled()

    await menu.getByRole('button', { name: t.layout.hideTool(t.tools.hologram) }).click()
    await expect(tool(page, 'hologram')).toHaveCount(0)
    await expect(resetBtn).toBeEnabled()

    // 2. profil kendi (ilk halindeki) düzeniyle açılır
    await menu.getByRole('button', { name: t.layout.switchProfile(2) }).click()
    await expect(tool(page, 'hologram')).toBeVisible()
    await menu.getByRole('button', { name: t.layout.switchProfile(1) }).click()
    await expect(tool(page, 'hologram')).toHaveCount(0)

    await resetBtn.click()
    const confirm = page.getByRole('alertdialog', { name: t.layout.resetConfirmTitle })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: t.layout.resetConfirm, exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(tool(page, 'hologram')).toBeVisible()
    await expect(page.getByText(t.layout.resetDone(1))).toBeVisible()

    await page.getByRole('button', { name: t.layout.undo }).click()
    await expect(tool(page, 'hologram')).toHaveCount(0)
  })

  test('sıfırlama onayı Esc ile iptal edilir', async ({ page, t }) => {
    await page.locator('#tools-menu-button').click()
    const menu = page.getByRole('dialog', { name: t.layout.title })
    await menu.getByRole('button', { name: t.layout.hideTool(t.tools.panel) }).click()
    await menu.getByRole('button', { name: t.layout.reset }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toBeHidden()
    // Menü açık kalır, düzen değişmez
    await expect(menu).toBeVisible()
    await expect(tool(page, 'panel')).toHaveCount(0)
  })

  test('bir sayfanın bütün bölümleri kaldırılıp standart düzenle geri getirilebilir; diğer sayfalar etkilenmez', async ({ page, t }) => {
    await page.locator('#page-next').click()
    await page.locator('#tools-menu-button').click()
    const menu = page.getByRole('dialog', { name: t.layout.title })
    await menu.locator('#tools-remove-all').click()
    await page.keyboard.press('Escape')
    await expect(activePage(page).locator('[data-tool]')).toHaveCount(0)
    await expect(activePage(page).getByText(t.layout.pageEmpty(t.layout.pageNames[1]))).toBeVisible()

    await page.locator('#tools-menu-button').click()
    await menu.locator('#tools-add-all').click()
    await page.keyboard.press('Escape')
    await expect(activePage(page).locator('[data-tool]')).toHaveCount(PAGE_TOOLS[1].length)
    // Ana sayfa etkilenmez
    await expect(page.locator('[data-page="0"] [data-tool]')).toHaveCount(MAIN_COUNT)
  })
})

import type { Locator, Page } from '@playwright/test'
import { SPATIAL, SPEED } from '../src/core/mindTraining'
import { MIND_PAGE } from '../src/lib/layout'
import { activePage, expect, open, test, type Dict } from './fixtures'

/*
 * Zihin egzersizleri penceresi (Kendini tanı → Zihin egzersizleri): liste, Zihinde döndür egzersizinin yalnızca klavyeyle
 * baştan sona yapılması, sonucun kaydı ve sayfa yenilenince durması, Hızlı bakışta denemelerin sırayla ilerlemesi,
 * kayıt yapılamayınca sakin hata mesajı, İngilizce metinler.
 */

async function openTraining(page: Page, t: Dict) {
  await page.locator('#page-next').click()
  const mind = activePage(page)
  await expect(mind).toHaveAttribute('data-page', String(MIND_PAGE))
  const l = t.mindPage.library
  const tile = mind.getByRole('button', { name: l.open(l.mindGames.title) })
  await tile.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: t.mindTraining.title })
  await expect(dialog).toBeVisible()
  return dialog
}

/**
 * Zihinde döndür: her denemede doğru cevabı (ya da ilk `wrong` denemede yanlışı) klavyeyle verir. Deneme sıra numarasıyla
 * beklenir: yeni deneme gelirken bir önceki kısa bir an ekranda kalır (çıkış geçişi), onun bilgisi okunmamalı.
 */
async function playSpatial(page: Page, dialog: Locator, m: Dict['mindTraining'], wrong = 0) {
  await dialog.getByRole('button', { name: m.open(m.names.spatial) }).focus()
  await page.keyboard.press('Enter')
  await dialog.locator('#mind-start').focus()
  await page.keyboard.press('Enter')
  for (let k = 0; k < SPATIAL.trials; k++) {
    const current = dialog.locator(`[data-spatial-index="${k}"]`)
    await expect(current).toBeVisible()
    await expect(dialog.locator('[data-spatial-answer="same"]')).toBeEnabled()
    const kind = await current.getAttribute('data-spatial-trial')
    const mirror = (kind === 'mirror') !== k < wrong
    await page.keyboard.press(mirror ? 'ArrowRight' : 'ArrowLeft')
    // Cevap alındı: deneme ilerler (son denemede sonuç açılır); doğruluk sonuç puanıyla denetlenir
    await expect(dialog.getByText(m.spatial.trial(Math.min(SPATIAL.trials, k + 2), SPATIAL.trials))).toBeVisible()
    if (k < SPATIAL.trials - 1) await expect(dialog.locator(`[data-spatial-index="${k + 1}"]`)).toBeVisible()
  }
  const result = dialog.locator('[data-mind-result="spatial"]')
  await expect(result).toBeVisible()
  return result
}

test('Zihinde döndür yalnızca klavyeyle yapılır; sonuç kaydedilir, listede görünür ve sayfa yenilenince durur', async ({ page, t }) => {
  // İki tam oturum (24 deneme) ve bir sayfa yenilemesi: varsayılan sürenin üç katı
  test.slow()
  const m = t.mindTraining
  await open(page)
  const dialog = await openTraining(page, t)
  for (const ex of ['speed', 'memory', 'spatial'] as const) await expect(dialog.getByRole('button', { name: m.open(m.names[ex]) })).toContainText(m.notTried)
  await expect(dialog.getByText(m.recentEmpty)).toBeVisible()

  const result = await playSpatial(page, dialog, m, 2)
  await expect(result.locator('[data-mind-score]')).toHaveText(`${SPATIAL.trials - 2}/${SPATIAL.trials}`)
  await expect(result.getByText(m.firstResult)).toBeVisible()
  await expect(result.getByText(m.saved)).toBeVisible()

  // Listeye dön: en iyi sonuç kartta, oturum son oturumlarda
  await result.getByRole('button', { name: m.back }).click()
  const best = m.best.spatial(SPATIAL.trials - 2, SPATIAL.trials)
  await expect(dialog.getByRole('button', { name: m.open(m.names.spatial) })).toContainText(best)
  await expect(dialog.locator('[data-mind-recent] li')).toHaveCount(1)

  // Esc kapatır; yenileyince kayıt durur
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.reload()
  await expect(page.locator('[data-page="0"]')).toBeVisible()
  const again = await openTraining(page, t)
  await expect(again.locator('[data-mind-recent] li')).toHaveCount(1)
  await expect(again.getByRole('button', { name: m.open(m.names.spatial) })).toContainText(best)
  // Daha iyi bir oturum "yeni en iyi" olarak işaretlenir
  const second = await playSpatial(page, again, m, 0)
  await expect(second.getByText(m.newBest)).toBeVisible()
})

test('Hızlı bakış: her denemede gösterim, maske ve iki soru gelir; cevaptan sonra sıradaki deneme başlar', async ({ page, t }) => {
  const m = t.mindTraining
  await open(page)
  const dialog = await openTraining(page, t)
  await dialog.getByRole('button', { name: m.open(m.names.speed) }).click()
  await expect(dialog.getByRole('heading', { name: m.spaceTitle })).toBeVisible()
  await dialog.locator('#mind-start').click()
  const stage = dialog.locator('[data-speed-step]')
  for (let k = 0; k < 3; k++) {
    await expect(dialog.getByText(m.speed.trial(k + 1, SPEED.trials))).toBeVisible()
    await expect(stage).toHaveAttribute('data-speed-step', 'center')
    await page.keyboard.press('2')
    await expect(stage).toHaveAttribute('data-speed-step', 'where')
    await expect(dialog.locator('[data-speed-slot]')).toHaveCount(SPEED.slots)
    await dialog.getByRole('button', { name: m.speed.slot(k + 1) }).click()
    await expect(stage).toHaveAttribute('data-speed-step', 'feedback')
  }
  await expect(dialog.getByText(m.speed.trial(4, SPEED.trials))).toBeVisible()
  // Geri: egzersiz listesine döner
  await dialog.getByRole('button', { name: m.backLabel }).click()
  await expect(dialog.getByRole('button', { name: m.open(m.names.speed) })).toBeVisible()
})

test('kayıt yapılamazsa egzersiz yine tamamlanır ve sakin bir mesaj görünür', async ({ page, t }) => {
  const m = t.mindTraining
  // Tarayıcı deposu dolu: uygulama verisi yazılamaz (kesin kayıt bunu fark eder)
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'vitalis.db' && (window as Window & { __fullDisk?: boolean }).__fullDisk) throw new DOMException('dolu', 'QuotaExceededError')
      return set.call(this, key, value)
    }
  })
  await open(page)
  const dialog = await openTraining(page, t)
  await page.evaluate(() => ((window as Window & { __fullDisk?: boolean }).__fullDisk = true))
  const result = await playSpatial(page, dialog, m)
  await expect(result.locator('[data-mind-score]')).toHaveText(`${SPATIAL.trials}/${SPATIAL.trials}`)
  await expect(result.getByText(m.notSaved)).toBeVisible()
})

test.describe('İngilizce', () => {
  test.use({ lang: 'en' })
  test('liste, gerekçe ve egzersiz sayfası İngilizce', async ({ page, t }) => {
    const m = t.mindTraining
    await open(page)
    const dialog = await openTraining(page, t)
    await expect(dialog.getByRole('heading', { name: m.whyTitle })).toBeVisible()
    await expect(dialog.getByText(m.why)).toBeVisible()
    await dialog.getByRole('button', { name: m.open(m.names.memory) }).click()
    await expect(dialog.getByText(m.memory.startsAt(1))).toBeVisible()
    for (const step of m.how.memory(1)) await expect(dialog.getByText(step)).toBeVisible()
    await dialog.locator('#mind-start').click()
    await expect(dialog.locator('[data-memory-level]')).toHaveText(m.memory.level(1))
    await expect(dialog.getByRole('button', { name: new RegExp(m.memory.match) })).toBeVisible()
  })
})

import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, open, test } from './fixtures'

/*
 * Bilinen, henüz düzeltilmemiş ihlal (WCAG 2.5.3, görünen yazı erişilebilir adın içinde olmalı):
 * dil düğmeleri "TR/EN" görünür ama "Türkçe/English" diye okunur; zoom yüzdesi ("%100") ve bölüm menüsündeki
 * sayfa düğmeleri ("2. Sayfa" → "2. Sayfaya geç") de böyle. Düzeltilince bu liste boşaltılmalı.
 */
const KNOWN_ISSUES = ['label-content-name-mismatch']

/** Ciddi ve kritik erişilebilirlik ihlallerini listeler (3D çizim alanı taranmaz) */
async function seriousViolations(page: Page) {
  // Açılış animasyonu sürerken yarı saydam yazı düşük kontrastlı ölçülür: sonlu animasyonların bitmesi beklenir
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
  const result = await new AxeBuilder({ page }).exclude('canvas').disableRules(KNOWN_ISSUES).analyze()
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

test('ana sayfada ciddi erişilebilirlik ihlali yok', async ({ page }) => {
  await open(page)
  expect(await seriousViolations(page)).toEqual([])
})

test('bölüm menüsü, asistan ve kaynaklar penceresinde ciddi erişilebilirlik ihlali yok', async ({ page, t }) => {
  await open(page)
  await page.locator('#tools-menu-button').click()
  await expect(page.getByRole('dialog', { name: t.layout.title })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await page.locator('#tour-assistant').click()
  await expect(page.getByRole('dialog', { name: t.chat.label })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: t.topbar.sources }).click()
  await expect(page.getByRole('dialog', { name: t.sources.title })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('Kaynaklar penceresinin dört sekmesinde ve veri içe aktarma penceresinde ciddi erişilebilirlik ihlali yok', async ({ page, t }) => {
  await open(page)
  await page.getByRole('button', { name: t.topbar.sources }).click()
  const dialog = page.getByRole('dialog', { name: t.sources.title })
  for (const tab of ['nasa', 'feasibility', 'roadmap', 'sources'] as const) {
    await dialog.getByRole('tab', { name: t.about.tabs[tab] }).click()
    await expect(dialog.getByRole('tab', { name: t.about.tabs[tab] })).toHaveAttribute('aria-selected', 'true')
    expect(await seriousViolations(page), tab).toEqual([])
  }
  await dialog.getByRole('button', { name: t.importer.open }).click()
  const imp = page.getByRole('dialog', { name: t.importer.title })
  await expect(imp).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await imp.locator('#import-file').setInputFiles({ name: 'nabiz.csv', mimeType: 'text/csv', buffer: Buffer.from('timestamp,bpm\n2026-11-10T08:00:00Z,62\n2026-11-10T08:10:00Z,70\n') })
  await expect(imp.locator('#import-indicator')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await imp.getByRole('button', { name: t.importer.next }).click()
  await expect(imp.locator('[data-import-preview]')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('zihinsel sağlık sayfasında, Kayıtlarım ve check-in penceresinde ciddi erişilebilirlik ihlali yok', async ({ page, t }) => {
  await open(page)
  await page.locator('#page-next').click()
  await expect(page.locator('[data-page="1"]:not([inert])')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.locator('[data-page="1"]').getByRole('button', { name: t.mindPage.records }).click()
  await expect(page.getByRole('dialog', { name: t.mindPage.records })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await page.locator('[data-page="1"] article[aria-current="time"]').getByRole('button').click()
  await expect(page.locator('#checkin-dialog').getByRole('group', { name: t.mindPage.form.questions.physical.label })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await page.locator('#emergency-button').click()
  await page.locator('#emergency-dialog').getByRole('button', { name: t.mindPage.sos.notUrgent }).click()
  const contact = page.locator('#doctor-contact')
  await contact.getByRole('checkbox', { name: 'Nabız' }).check()
  await expect(contact.locator('[data-category="hr"]')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await page.locator('#emergency-button').click()
  await expect(page.locator('#emergency-dialog').getByRole('button', { name: t.mindPage.sos.hold })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('zihin egzersizleri penceresinde (liste, egzersiz girişi ve egzersiz) ciddi erişilebilirlik ihlali yok', async ({ page, t }) => {
  const m = t.mindTraining
  const l = t.mindPage.library
  await open(page)
  await page.locator('#page-next').click()
  await page.locator('[data-page="1"]').getByRole('button', { name: l.open(l.mindGames.title) }).click()
  const dialog = page.locator('#mind-training')
  await expect(dialog.getByRole('heading', { name: m.whyTitle })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  for (const ex of ['speed', 'memory', 'spatial'] as const) {
    await dialog.getByRole('button', { name: m.open(m.names[ex]) }).click()
    await expect(dialog.getByRole('heading', { name: m.spaceTitle })).toBeVisible()
    expect(await seriousViolations(page), `${ex} giriş`).toEqual([])
    await dialog.locator('#mind-start').click()
    await expect(dialog.locator('[role="group"]').first()).toBeVisible()
    expect(await seriousViolations(page), `${ex} egzersiz`).toEqual([])
    await dialog.getByRole('button', { name: m.backLabel }).click()
  }
})

test('klavyeyle bölüm menüsü açılıp kapanır, odak görünür', async ({ page, t }) => {
  await open(page)
  await page.keyboard.press('Tab')
  const focused = page.locator(':focus-visible')
  await expect(focused).toHaveCount(1)
  await expect(focused).toHaveCSS('outline-style', 'solid')

  await page.locator('#tools-menu-button').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: t.layout.title })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: t.layout.title })).toBeHidden()
})

test('destek kütüphanesi ve sonuç ekranlarında ciddi erişilebilirlik ihlali yok (görev 12)', async ({ page, t }) => {
  await open(page)
  await page.locator('#page-next').click()
  const l = t.mindPage.library
  const mind = page.locator('[data-page="1"]')

  await mind.getByRole('button', { name: t.journal.write }).click()
  const journal = page.locator('#journal-dialog')
  await journal.getByLabel(t.journal.placeholder).fill('Erişilebilirlik denemesi')
  await journal.getByRole('button', { name: t.journal.save }).click()
  await expect(journal.getByRole('status')).toHaveText(t.journal.saved)
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')
  await mind.getByRole('button', { name: t.mindPage.records }).click()
  const records = page.locator('#my-records')
  await records.getByRole('button', { name: t.journal.remove }).first().click()
  await expect(records.getByRole('alertdialog')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await mind.getByRole('button', { name: l.open(l.breathing.title) }).click()
  const breathing = page.locator('#breathing-sheet')
  const br = t.mindPage.breath
  await breathing.getByRole('radio', { name: br.minutes(3) }).click()
  // Soru adımları ve hazır ekranı da taranır
  await expect(breathing.getByRole('heading', { name: br.askSound })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await breathing.getByRole('radio', { name: br.soundNo }).click()
  await breathing.getByRole('radio', { name: br.clickNo }).click()
  await expect(breathing.getByRole('heading', { name: br.readyTitle })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await breathing.getByRole('button', { name: br.start }).click()
  await expect(page.locator('#breathing-sheet').getByRole('timer')).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await mind.getByRole('button', { name: l.open(l.cupola.title) }).click()
  await page.locator('#cupola-sheet').getByRole('radio', { name: t.mindPage.cupola.modes.still }).check()
  expect(await seriousViolations(page)).toEqual([])
  await page.keyboard.press('Escape')

  await mind.getByRole('button', { name: l.open(l.gallery.title) }).click()
  const gallery = page.locator('#gallery-sheet')
  await gallery.getByRole('list').getByRole('button').first().click()
  await expect(gallery.getByRole('region', { name: t.mindPage.gallery.viewer.label })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

import { CREW, FLIGHT_SURGEON } from '../src/core/crew'
import { resolve } from '../src/i18n'
import { activePage, expect, open, test } from './fixtures'

/**
 * Astronot ile uçuş hekimi arasındaki mesajlaşma: rapor hekime ulaşınca sağ altta hekimin bildirimi çıkar; bildirime basınca
 * hekim hesabına geçilir ve rapor açılır. Hekimin cevabı astronota ulaşınca bu kez astronotun bildirimi çıkar.
 */
test('pilot rapor gönderir → hekim bildirimden açıp cevap yazar → pilot bildirimden cevabı açar', async ({ page, t, lang }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('e2e.profileSet')) {
      localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'astronaut', self: 'okafor', viewing: null }))
      sessionStorage.setItem('e2e.profileSet', '1')
    }
  })
  await open(page)
  // Sağlık kayıtları sayfası
  for (let i = 0; i < 3; i++) await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')

  const report = activePage(page).locator('#tour-report')
  await report.getByRole('button', { name: t.doctor.send }).click()
  // Gönderilen rapor Mesajlar sekmesinde vurgulanır
  await expect(report.getByRole('tab', { name: t.doctor.tabMessages })).toHaveAttribute('aria-selected', 'true')
  await expect(report.locator('[data-highlight]')).toContainText(t.doctor.reportText(CREW.okafor.name, 7))

  // Hekimin bildirimi (istasyonda gecikme 0,6 sn)
  const inbox = page.getByRole('region', { name: t.inbox.label })
  const pilot = `${resolve(CREW.okafor.role, lang)} ${CREW.okafor.name}`
  const toSurgeon = inbox.getByRole('button', { name: new RegExp(t.inbox.report(pilot)) })
  await expect(toSurgeon).toBeVisible({ timeout: 10_000 })
  await expect(toSurgeon).toContainText(FLIGHT_SURGEON.name)
  await expect(toSurgeon).toContainText(t.inbox.openSwitch(FLIGHT_SURGEON.name))
  await toSurgeon.click()

  // Hekim hesabında A. Okafor görüntülenir; rapor vurgulu, cevap alanı odakta
  await expect(page.getByText(CREW.okafor.name, { exact: true }).first()).toBeVisible()
  const surgeonReport = activePage(page).locator('#tour-report')
  const reply = surgeonReport.getByPlaceholder(t.doctor.messageTo(CREW.okafor.name))
  await expect(reply).toBeFocused()
  await expect(surgeonReport.locator('[data-highlight]')).toContainText(t.doctor.reportText(CREW.okafor.name, 7))
  await expect(toSurgeon).toHaveCount(0)

  const answer = 'Raporun ulaştı; bugün yoğun egzersizi atla.'
  await reply.fill(answer)
  await reply.press('Enter')

  // Pilotun bildirimi
  const surgeon = `${resolve(FLIGHT_SURGEON.role, lang)} ${FLIGHT_SURGEON.name}`
  const toPilot = inbox.getByRole('button', { name: new RegExp(t.inbox.message(surgeon)) })
  await expect(toPilot).toBeVisible({ timeout: 10_000 })
  await expect(toPilot).toContainText(answer)
  await toPilot.click()

  // Pilot hesabına dönülür; cevap vurgulu, yazı alanı odakta
  const pilotReport = activePage(page).locator('#tour-report')
  await expect(pilotReport.getByPlaceholder(t.doctor.messagePlaceholder)).toBeFocused()
  await expect(pilotReport.locator('[data-highlight]')).toContainText(answer)
})

test('bildirim X ile kapatılır', async ({ page, t, lang }) => {
  await open(page)
  for (let i = 0; i < 3; i++) await page.locator('#page-next').click()
  await activePage(page).locator('#tour-report').getByRole('button', { name: t.doctor.send }).click()
  const inbox = page.getByRole('region', { name: t.inbox.label })
  const sender = `${resolve(CREW.yildiz.role, lang)} ${CREW.yildiz.name}`
  await expect(inbox.getByRole('button', { name: new RegExp(t.inbox.report(sender)) })).toBeVisible({ timeout: 10_000 })
  await inbox.getByRole('button', { name: t.inbox.dismiss }).click()
  await expect(inbox.getByRole('button')).toHaveCount(0)
})

test('uygulama kapalıyken gelen mesaj girişte kayarak çıkmaz; zilin altında okunmamış kutusu çıkar ve listeden açılır', async ({ page, t, lang }) => {
  await open(page)
  for (let i = 0; i < 3; i++) await page.locator('#page-next').click()
  await activePage(page).locator('#tour-report').getByRole('button', { name: t.doctor.send }).click()
  const inbox = page.getByRole('region', { name: t.inbox.label })
  await expect(inbox.locator('[data-inbox]')).toHaveCount(1, { timeout: 10_000 })

  // Bildirim görülmeden uygulama kapanmış gibi: okunmamış bırakılıp sayfa yeniden açılır
  await page.evaluate(() => localStorage.setItem('vitalis.inboxSeen', '[]'))
  await page.reload()
  await expect(page.locator('[data-page="0"]')).toBeVisible()

  const callout = page.locator('[data-unread-callout]')
  await expect(callout).toContainText(t.topbar.unreadTitle, { timeout: 10_000 })
  await expect(callout).toContainText(t.topbar.unreadDetail(1, 0))
  await expect(inbox.locator('[data-inbox]')).toHaveCount(0)

  await callout.getByRole('button', { name: t.topbar.unreadShow }).click()
  await expect(callout).toHaveCount(0)
  const sender = `${resolve(CREW.yildiz.role, lang)} ${CREW.yildiz.name}`
  await page.locator('[data-unread-messages]').getByRole('button', { name: new RegExp(t.inbox.report(sender)) }).click()

  // Hekim hesabına geçilir, rapor açılır
  await expect(activePage(page).locator('#tour-report').getByPlaceholder(t.doctor.messageTo(CREW.yildiz.name))).toBeFocused()
  await expect(page.locator('#tour-alerts')).toHaveAttribute('aria-label', t.topbar.notifications)
})

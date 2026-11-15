import type { Page } from '@playwright/test'
import { regionsFor } from '../src/data/regions'
import { activePage, expect, open, test, tool, type Dict } from './fixtures'

async function openChat(page: Page, t: Dict, greeting: keyof Dict['assistant']['greetings'] = 'general') {
  await page.locator('#tour-assistant').click()
  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toBeVisible()
  await expect(chat).toContainText(t.assistant.greetings[greeting])
  return chat
}

async function sendMessage(page: Page, t: Dict, text: string) {
  const input = page.getByLabel(t.chat.inputLabel)
  await input.fill(text)
  await input.press('Enter')
  await expect(input).toHaveValue('')
}

test('asistan soruya akışlı cevap verir; her cevabın sağ altında sesli okuma düğmesi var; Esc ile kapanır', async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, 'Elim kanıyor, ne yapabilirim?')
  await expect(chat).toContainText('Elim kanıyor, ne yapabilirim?')
  await expect(chat).toContainText('Kanama durana kadar baskıyı sürdür', { timeout: 20_000 })
  await expect(chat).toContainText('uçuş hekimine bağlan', { timeout: 20_000 })
  // Karşılama ve cevap: iki asistan mesajında da hoparlör düğmesi
  await expect(chat.locator('[data-speak]')).toHaveCount(2)
  const bubble = chat.locator('[data-speak]').last().locator('..')
  const speaker = (await chat.locator('[data-speak]').last().boundingBox())!
  const box = (await bubble.boundingBox())!
  expect(speaker.x + speaker.width).toBeGreaterThan(box.x + box.width - 16)
  expect(speaker.y + speaker.height).toBeGreaterThan(box.y + box.height - 16)

  await page.keyboard.press('Escape')
  await expect(chat).toBeHidden()
})

test('kriz cümlesinde asistan bir insana yönlendirir', async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, 'Artık dayanamıyorum')
  await expect(chat).toContainText('uçuş psikoloğuna', { timeout: 20_000 })
})

test('sohbette anlatılan şikayet kaydedilir; spor programı buna göre değişir', async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, 'Sağ elim ağrıyor, 6/10')
  const save = chat.locator('[data-action="saveComplaint"]')
  await expect(save).toBeVisible({ timeout: 20_000 })
  await save.click()
  // Tek açıklama kutusu: şikayetin uyarısı gelir, ayrıca "kaydedildi" bildirimi çıkmaz
  await expect(page.locator('[data-alert-level="dikkat"]').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(t.assistant.complaintSaved)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(chat).toBeHidden()

  // Bilgi kartında eller bölgesi işaretlenir; spor sayfasında program şikayete göre ayarlanmıştır
  const panel = tool(page, 'panel')
  await expect(panel).toContainText(regionsFor('tr').eller.name)
  await expect(panel).toContainText(t.status.dikkat)
  await page.locator('#page-next').click()
  await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', '2')
  await expect(tool(page, 'program')).toContainText(/sağ el/i)
})

test('rol sekmesi ve alt başlık yoktur; spor sayfasında asistan koç olarak karşılar', async ({ page, t }) => {
  await open(page)
  let chat = await openChat(page, t)
  await expect(chat.locator('[data-mode]')).toHaveCount(0)
  await expect(chat.getByText(/çevrimdışı, kural tabanlı/)).toHaveCount(0)
  await expect(page.getByLabel(t.chat.inputLabel)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(chat).toBeHidden()

  await page.locator('#page-next').click()
  await page.locator('#page-next').click()
  await page.locator('#tour-assistant').click()
  chat = page.getByRole('dialog', { name: t.chat.label })
  await chat.getByRole('button', { name: t.assistant.history }).click()
  await chat.getByRole('button', { name: t.assistant.newChat }).click()
  await expect(chat).toContainText(t.assistant.greetings.coach)
})

test('bilgi kartındaki "Asistana sor" bölge sorusunu asistana gönderir', async ({ page, t }) => {
  await open(page)
  await page.locator('#tour-hologram').getByRole('button', { name: /^Göğüs/ }).click()
  const panel = page.locator('#tour-panel')
  await panel.getByRole('button', { name: t.panel.ask }).click()
  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toContainText(t.panel.askQuestion('Göğüs'))
  await expect(chat).toContainText('Önerim:', { timeout: 20_000 })
})

test.describe('İngilizce', () => {
  test.use({ lang: 'en' })

  test('asistan İngilizce cevap verir', async ({ page, t }) => {
    await open(page)
    const chat = await openChat(page, t)
    await sendMessage(page, t, 'I can\'t sleep')
    await expect(chat).toContainText('three nights', { timeout: 20_000 })
  })
})

test('Sağlık Asistanı şikayet oluşturmayı anlatır; düğmesi rahatsızlık bildirmeyi doğrudan başlatır', async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, 'Şikayet oluşturmak istiyorum')
  await expect(chat).toContainText(t.complaintSave.saveAsk, { timeout: 20_000 })
  const go = chat.locator('[data-action="run"]', { hasText: t.hologram.complaint })
  await go.click()
  await expect(chat).toBeHidden()
  await expect(activePage(page).locator('#tour-hologram').getByRole('button', { name: t.hologram.complaint, exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('Sağlık Asistanı belirli bir günün kan tahlilini anlatır ve o örneği Kan tahlillerinde açar', async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, '60. gündeki kan tahlilim')
  await expect(chat).toContainText(t.doctor.draw(60), { timeout: 20_000 })
  await expect(chat).toContainText('referans')
  await chat.locator('[data-action="run"]').first().click()
  await expect(chat).toBeHidden()
  const labs = tool(page, 'labs')
  await expect(labs).toBeVisible()
  await expect(labs.getByRole('button', { name: t.doctor.draw(60) })).toHaveAttribute('aria-pressed', 'true')
})

test("Sağlık Asistanı Cupola'yı açar; anlamadığı soruda uydurmaz, öneri sunar", async ({ page, t }) => {
  await open(page)
  const chat = await openChat(page, t)
  await sendMessage(page, t, 'zxq vbn qwerty')
  await expect(chat).toContainText('uydurmak yerine', { timeout: 20_000 })
  await expect(chat.locator('[data-action="ask"]').nth(2)).toBeVisible()
  await sendMessage(page, t, "Cupola'yı aç")
  await chat.locator('[data-action="run"]', { hasText: 'Cupola' }).click()
  await expect(page.locator('#cupola-sheet')).toBeVisible({ timeout: 15_000 })
})

test.describe('İngilizce', () => {
  test.use({ lang: 'en' })
  test('the Health Assistant answers navigation and data questions in English', async ({ page, t }) => {
    await open(page)
    const chat = await openChat(page, t)
    await sendMessage(page, t, 'How do I create a complaint?')
    await expect(chat).toContainText(t.hologram.complaint, { timeout: 20_000 })
    await expect(chat.locator('[data-action="run"]')).toBeVisible({ timeout: 20_000 })
    await sendMessage(page, t, 'my heart rate yesterday')
    await expect(chat).toContainText('Average', { timeout: 20_000 })
  })
})

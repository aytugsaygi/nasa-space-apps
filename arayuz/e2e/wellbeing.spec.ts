import { MIND_PAGE, PAGE_TOOLS } from '../src/lib/layout'
import { CUPOLA_SESSIONS } from '../src/mind/wellbeing'
import { activePage, expect, open, test, type Dict } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/*
 * Zihinsel sağlık (Wellbeing) sayfası: yerleşim, günlük ve testler, destek kütüphanesi (görev 3; acil destek üst çubukta), check-in formu ve
 * açılışta otomatik sunum (görev 4). Mürettebata yardım çağrısı henüz yok; kullanılamaz görünmelidir.
 */

async function openMind(page: Page, path = '/') {
  await open(page, path)
  await page.locator('#page-next').click()
  await expect(activePage(page)).toHaveAttribute('data-page', String(MIND_PAGE))
}

/**
 * Testler hareketi azaltarak çalışır (bölümler salınır; Playwright hareket eden düğmeye tıklamaz). Cupola o ayarda
 * durağan görüntü açar; etkileşimli sahneyi deneyen testler hareketi açar ve arayüzün yeni ayarla yeniden çizilmesini bekler.
 */
async function allowMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  // Bu sayfada bölümler salınmaz; hareket açılınca kutuların arkasında durağan kare yerine video oynar
  await expect(activePage(page).locator('video').first()).toBeAttached()
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

async function checkStructure(page: Page, t: Dict) {
  const m = t.mindPage
  const mind = activePage(page)
  await expect(mind.locator('[data-tool]')).toHaveCount(PAGE_TOOLS[MIND_PAGE].length)
  await expect(mind.getByRole('heading', { level: 2, name: m.title })).toBeVisible()
  await expect(mind.getByRole('button', { name: m.records })).toBeVisible()
  await expect(mind.getByRole('list', { name: m.windowsLabel }).getByRole('article')).toHaveCount(3)
  // Sağ üstte "Kendini tanı": zihin egzersizleri, görüş testi, tepki testi, tutarlılık testi; acil destek sayfada değil
  await expect(mind.getByRole('region', { name: m.actions.title }).getByRole('listitem')).toHaveCount(4)
  await expect(mind.getByRole('heading', { level: 2, name: m.emergency.title })).toHaveCount(0)
  // Cupola, nefes egzersizi, Dünya galerisi ve günlük; her biri kendi videosunun önünde
  await expect(mind.getByRole('list', { name: m.library.title }).getByRole('listitem')).toHaveCount(4)
  // Hareketi azaltma tercihinde video yerine durağan kare gösterilir; ikisinde de on bir arka plan var (3 check-in, 4 test, 4 kütüphane)
  await expect(mind.locator('[src*="videos/mind/"]')).toHaveCount(11)
  // Şu anki pencerenin eylemi formu açar
  await expect(mind.locator('article[aria-current="time"]').getByRole('button')).toBeEnabled()
}

test('kutu videoları: tutarlılık testi ve günlük 0,75x, diğerleri normal hızda', async ({ page }) => {
  await openMind(page)
  await allowMotion(page)
  const rate = (name: string) => activePage(page).locator(`video[src$="videos/mind/${name}.mp4"]`).evaluate((v: HTMLVideoElement) => v.playbackRate)
  await expect.poll(() => rate('consistency-test')).toBe(0.75)
  await expect.poll(() => rate('journal')).toBe(0.75)
  await expect.poll(() => rate('vision-test')).toBe(1)
  await expect.poll(() => rate('reaction-test')).toBe(1)
})

test('sayfa yapısı: başlık, üç pencere, günlük ve testler, kütüphane', async ({ page, t }) => {
  await openMind(page)
  await checkStructure(page, t)
})

test('Kayıtlarım klavyeyle açılır ve kapanınca odak geri döner', async ({ page, t }) => {
  await openMind(page)
  const notebook = activePage(page).getByRole('button', { name: t.mindPage.records })
  await notebook.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: t.mindPage.records })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('group', { name: t.mindPage.recordsSheet.filterLabel })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(notebook).toBeFocused()
})

test('kütüphaneden nefes molası ve Cupola ayrı ayrı açılır', async ({ page, t }) => {
  await openMind(page)
  const l = t.mindPage.library
  await activePage(page).getByRole('button', { name: l.open(l.breathing.title) }).click()
  const breathing = page.getByRole('dialog', { name: l.breathing.title })
  await expect(breathing.getByRole('group', { name: t.mindPage.breath.askDuration })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(breathing).toBeHidden()

  // Testler hareketi azaltarak çalışır; Cupola o ayarda durağan görüntü açar. Etkileşimli sahne için hareket açılır;
  // bölümler yeniden yavaşça salındığından düğmeye kararlılık beklemeden basılır (salınım birkaç pikseldir)
  await allowMotion(page)
  await activePage(page).getByRole('button', { name: l.open(l.cupola.title) }).click({ force: true })
  const cupola = page.getByRole('dialog', { name: l.cupola.title })
  await expect(cupola.locator('video[data-video]')).toBeVisible()
  // Cupola ile nefes rehberi birleşik akış değildir (SUP-02)
  await expect(cupola.getByRole('button', { name: t.wellbeing.cupola.guide })).toHaveCount(0)
  await expect(cupola.getByText(t.wellbeing.breathing.phase.inhale)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(cupola).toBeHidden()
})

/* ---------- Destek kütüphanesi: Cupola (görev 10, CUP-01…CUP-04) ---------- */

test('Cupola: dört manzara yerel videodur; sessiz ve döngüde oynar; manzara seçimi videoyu değiştirir; durağan görüntü ve çık', async ({ page, t, lang }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol.startsWith('http') && u.hostname !== 'localhost') external.push(u.hostname)
  })
  await openMind(page)
  const c = t.mindPage.cupola
  const l = t.mindPage.library
  // Testler hareketi azaltarak çalışır; Cupola o ayarda durağan görüntü açar. Video için hareket açılır.
  await allowMotion(page)
  await activePage(page).getByRole('button', { name: l.open(l.cupola.title) }).click({ force: true })
  const sheet = page.getByRole('dialog', { name: l.cupola.title })
  const video = sheet.locator('video[data-video]')
  await expect(video).toHaveAttribute('data-video', 'sahara')
  await expect(sheet.getByRole('radio', { name: c.audioModes.silent })).toBeChecked()
  await expect(sheet.locator('[data-credit]')).toHaveText(c.credit)
  // Video sessiz, döngüde ve oynuyor (zaman ilerliyor)
  const state = () => video.evaluate((v: HTMLVideoElement) => ({ muted: v.muted, loop: v.loop, t: v.currentTime }))
  await expect.poll(async () => (await state()).t, { timeout: 15_000 }).toBeGreaterThan(0.2)
  expect(await state()).toMatchObject({ muted: true, loop: true })

  // Manzara seçimi videoyu değiştirir
  for (const id of ['sunrise', 'ocean', 'cityLights'] as const) {
    await sheet.getByRole('radio', { name: CUPOLA_SESSIONS.find((x) => x.id === id)!.title[lang], exact: true }).check()
    // Geçişte eski ve yeni video bir an üst üste; sonra yalnızca yenisi kalır
    await expect(sheet.locator(`video[data-video="${id}"]`)).toBeVisible()
    await expect(sheet.locator('video')).toHaveCount(1)
  }

  // Durağan görüntü: tek kare, video yok
  await sheet.getByRole('radio', { name: c.modes.still }).check()
  await expect(sheet.locator('img[data-still="cityLights"]')).toBeVisible()
  await expect(sheet.locator('video')).toHaveCount(0)

  // Tam ekran: aynı sayfada pencere bütün ekrana yayılır; Esc önce tam ekrandan çıkar, sonra pencereyi kapatır
  await sheet.getByRole('radio', { name: c.modes.video }).check()
  await sheet.getByRole('button', { name: c.fullscreen }).click()
  const vp = page.viewportSize()!
  await expect
    .poll(async () => {
      const b = (await sheet.boundingBox())!
      return b.width >= vp.width - 80 && b.height >= vp.height - 40
    })
    .toBe(true)
  await expect(sheet.locator('[data-cupola-bar]')).toBeVisible()
  // Hareketsizlikte çubuk solar; fareyi oynatınca geri gelir
  await expect(sheet.locator('[data-cupola-bar][data-hidden]')).toBeAttached({ timeout: 8000 })
  await page.mouse.move(vp.width / 2, vp.height / 2)
  await expect(sheet.locator('[data-cupola-bar]:not([data-hidden])')).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: c.fullscreen })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  expect(external).toEqual([])
})

test('Cupola: hareketi azaltma tercihinde durağan görüntü yüklenir ve kullanılabilir', async ({ page, t }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMind(page)
  const c = t.mindPage.cupola
  const l = t.mindPage.library
  await activePage(page).getByRole('button', { name: l.open(l.cupola.title) }).click()
  const sheet = page.getByRole('dialog', { name: l.cupola.title })
  await expect(sheet.getByRole('status')).toHaveText(c.fallback.reduced)
  const img = sheet.locator('img[data-still]')
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await expect(sheet.locator('video')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('acil durum (üst çubuk): ortada açılır; basılı tutma düğmesi ve acil olmayan konu için hekime yazma yolu', async ({ page, t }) => {
  await openMind(page)
  const s = t.mindPage.sos
  await page.locator('#emergency-button').click()
  const dialog = page.locator('#emergency-dialog')
  await expect(dialog.getByRole('button', { name: s.hold })).toBeVisible()
  // Ekranın ortasında
  const box = (await dialog.boundingBox())!
  const overlay = await dialog.evaluate((el) => { const r = el.parentElement!.getBoundingClientRect(); return r.left + r.width / 2 })
  expect(Math.abs(box.x + box.width / 2 - overlay)).toBeLessThan(4)
  // Acil olmayan konu: hekim mesaj formu aynı pencerede açılır (sağdan ayrı pencere çıkmaz)
  await dialog.getByRole('button', { name: s.notUrgent }).click()
  await expect(dialog.locator('#doctor-contact')).toBeVisible()
  await expect(page.getByRole('dialog', { name: t.mindPage.contact.title })).toHaveCount(0)
  await dialog.getByRole('button', { name: s.backToEmergency }).click()
  await expect(dialog.getByRole('button', { name: s.hold })).toBeVisible()
})

/** Sağ üstteki uyarı bildirimlerini kullanıcı gibi kapatır (profil menüsünün üstüne gelebilirler) */
async function closeAlertToasts(page: Page, t: Dict) {
  const close = page.locator('[data-sonner-toast]').getByRole('button', { name: t.toast.closeAlert })
  await page.waitForTimeout(1200)
  while ((await close.count()) > 0) {
    await close.first().click()
    await page.waitForTimeout(250)
  }
}

test('acil durum: hekime mesaj aynı pencerede; başka mürettebatın hesabına geçince ortada kutu çıkar ve Tamam ile kapanır; hekimin zil listesinde görünür', async ({ page, t }) => {
  await openMind(page)
  const s = t.mindPage.sos
  const a = t.mindPage.assist
  await page.locator('#emergency-button').click()
  const dialog = page.locator('#emergency-dialog')
  await expect(dialog.getByRole('button', { name: s.hold })).toBeFocused()
  await page.keyboard.down('Space')
  await page.waitForTimeout(700)
  await page.keyboard.up('Space')
  await expect(page.getByRole('dialog', { name: s.activeTitle })).toBeVisible()
  // Hekime yazılı mesaj: form sağ sütunda, acil durum penceresinin içinde
  await dialog.getByRole('button', { name: s.doctor, exact: true }).click()
  await expect(dialog.locator('#doctor-contact')).toBeVisible()
  await expect(dialog.locator('[data-sos-notified]')).toBeVisible()
  await expect(page.getByRole('dialog', { name: t.mindPage.contact.title })).toHaveCount(0)
  await dialog.getByRole('button', { name: s.backToEmergency }).click()
  await expect(dialog.getByRole('button', { name: s.end })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Aynı tarayıcıda K. Mori'ye geçilir: ekranın ortasında kutu
  await closeAlertToasts(page, t)
  await page.locator('#tour-profile').click()
  await page.locator('[data-profile="mori"]').click()
  const modal = page.locator('[data-assist-modal="mori"]')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(a.inboxTitle('E. Yıldız'))
  const box = (await modal.boundingBox())!
  const vp = page.viewportSize()!
  expect(Math.abs(box.x + box.width / 2 - vp.width / 2)).toBeLessThan(12)
  expect(Math.abs(box.y + box.height / 2 - vp.height / 2)).toBeLessThan(12)
  await expect(modal.getByRole('button', { name: s.modalOk })).toBeFocused()
  await modal.getByRole('button', { name: s.modalOk }).click()
  await expect(modal).toBeHidden()

  // Uçuş hekimi: zil listesinde "Acil durumlar"
  await closeAlertToasts(page, t)
  await page.locator('#tour-profile').click()
  await page.locator('[data-profile="surgeon"]').click()
  // Hekimin ilk ekranındaki Gelen bildirimler: en üstte acil durum (sürüyor)
  await expect(page.locator('#crew-overview [data-emergency="active"]')).toContainText(a.inboxTitle('E. Yıldız'))
  await closeAlertToasts(page, t)
  await expect(page.locator('#tour-alerts')).toHaveAccessibleName(/\d/)
  await page.locator('#tour-alerts').click()
  const list = page.locator('[data-emergencies]')
  await expect(list).toContainText(s.bellTitle)
  await expect(list.locator('[data-emergency="active"]')).toContainText(a.inboxTitle('E. Yıldız'))
})

test.describe('İngilizce', () => {
  test.use({ lang: 'en' })
  test('sayfa İngilizce görünür', async ({ page, t }) => {
    await openMind(page)
    await checkStructure(page, t)
    await expect(activePage(page).getByText(t.mindPage.estimate(1))).toBeVisible()
  })
})

/** Başlıktaki "Günlük yaz" penceresinden günlük notu yazar ve kapatır */
async function writeJournal(page: Page, t: Dict, text: string) {
  await activePage(page).getByRole('button', { name: t.journal.write }).click()
  const journal = page.locator('#journal-dialog')
  await journal.getByLabel(t.journal.placeholder).fill(text)
  await journal.getByRole('button', { name: t.journal.save }).click()
  await expect(journal.getByRole('status')).toHaveText(t.journal.saved)
  await page.keyboard.press('Escape')
  await expect(journal).toBeHidden()
}

/* ---------- Check-in formu (görev 4) ---------- */

/** Şu anki pencerenin kartı ve formu açan düğmesi */
const currentCard = (page: Page) => activePage(page).locator('article[aria-current="time"]')

async function openForm(page: Page, t: Dict) {
  const card = currentCard(page)
  await card.getByRole('button', { name: new RegExp(`^${t.mindPage.start}`) }).click()
  const dialog = page.locator('#checkin-dialog')
  await expect(dialog.getByRole('group', { name: t.mindPage.form.questions.physical.label })).toBeVisible()
  return dialog
}

/** İleri ile özete gider (sorular isteğe bağlı; cevapsız geçilir) */
async function toSummary(dialog: Locator, t: Dict) {
  // Adım geçişi kısa bir animasyon sürer: özet gelene kadar, İleri görünürse basılır
  const next = dialog.getByRole('button', { name: t.mindPage.form.next })
  for (let i = 0; i < 40 && !(await dialog.locator('[data-summary]').count()); i++) {
    if (await next.count()) await next.click()
    await dialog.page().waitForTimeout(150)
  }
  await expect(dialog.locator('[data-summary="note"]')).toBeVisible()
}

/** Özetten bir soruya gidip cevaplar; cevaptan sonra akış özete döner */
async function answerFromSummary(dialog: Locator, t: Dict, id: string, option: string) {
  const f = t.mindPage.form
  await dialog.locator(`[data-summary="${id}"]`).click()
  await dialog.getByRole('group', { name: f.questions[id].label }).getByRole('radio', { name: f.questions[id].options[option], exact: true }).click()
  await expect(dialog.locator(`[data-summary="${id}"]`)).toContainText(f.questions[id].options[option])
}

test('açılışta check-in formu kendiliğinden açılmaz; karttan açılır', async ({ page, t }) => {
  // Kullanıcı siteye girerken açılan pencere istemiyor: ?checkin=on olsa da form kendiliğinden gelmez
  await open(page, '/?checkin=on')
  await page.waitForFunction(() => performance.now() > 6000)
  await expect(page.locator('#checkin-dialog')).toHaveCount(0)
  await page.locator('#page-next').click()
  const dialog = await openForm(page, t)
  await expect(dialog).toBeVisible()
})

test('karttan açılan formda "Bu check-in\'i atla" pencereyi atlanmış yapar', async ({ page, t }) => {
  await openMind(page)
  const others = activePage(page).locator('article[data-window]:not([aria-current="time"])')
  const before = await others.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-window')}:${e.getAttribute('data-outcome')}`))
  const dialog = await openForm(page, t)
  await toSummary(dialog, t)
  await dialog.getByRole('button', { name: t.mindPage.form.skip }).click()
  await expect(dialog).toBeHidden()
  await expect(currentCard(page)).toHaveAttribute('data-outcome', 'skipped')
  // Yalnızca bu pencere kapanır; diğer pencerelerin durumu değişmez
  expect(await others.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-window')}:${e.getAttribute('data-outcome')}`))).toEqual(before)
})

test('check-in: sorular tek tek gelir, seçince ilerler; özetten düzenlenir; boş form kaydedilmez, kısmi cevap kaydedilir', async ({ page, t }) => {
  await openMind(page)
  const f = t.mindPage.form
  const dialog = await openForm(page, t)
  // Ekranın ortasında açılır ve yalnızca bir soru görünür
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!
      return Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)
    })
    .toBeLessThan(12)
  await expect(dialog.locator('[data-question]')).toHaveCount(1)
  // Seçince kendiliğinden sonraki soruya geçer; Geri ile dönülür
  await dialog.getByRole('radio', { name: f.questions.physical.options.comfortable, exact: true }).click()
  await expect(dialog.getByRole('group', { name: f.questions.mood.label })).toBeVisible()
  await dialog.getByRole('button', { name: f.back }).click()
  await expect(dialog.getByRole('radio', { name: f.questions.physical.options.comfortable, exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: f.clearLabel(f.questions.physical.label) }).click()

  await toSummary(dialog, t)
  await expect(dialog.getByRole('button', { name: f.save })).toBeDisabled()
  await expect(dialog.getByText(f.emptyHint)).toBeVisible()
  await answerFromSummary(dialog, t, 'energy', 'tired')
  await dialog.getByRole('button', { name: f.save }).click()
  // Bitiş animasyonu; ayrıca bildirim yok
  await expect(dialog.locator('[data-checkin-done]')).toBeVisible()
  await expect(dialog.getByText(f.doneTitle)).toBeVisible()
  await expect(page.getByText(f.saved, { exact: true })).toHaveCount(0)
  await expect(dialog).toBeHidden()
  await expect(currentCard(page)).toHaveAttribute('data-outcome', 'saved')
  await expect(currentCard(page)).toContainText(t.mindPage.answered(1, 6))
})

test('form yalnızca klavyeyle doldurulur; Esc kapatır ve odak kart düğmesine döner', async ({ page, t }) => {
  await openMind(page)
  const f = t.mindPage.form
  const button = currentCard(page).getByRole('button', { name: new RegExp(`^${t.mindPage.start}`) })
  await button.focus()
  await page.keyboard.press('Enter')
  const dialog = page.locator('#checkin-dialog')
  await expect(dialog.getByRole('button', { name: f.close })).toBeFocused()
  // Rakam seçer ve ilerler, ← geri döner (ilk soru yüklendikten sonra)
  await expect(dialog.getByRole('group', { name: f.questions.physical.label })).toBeVisible()
  await page.keyboard.press('1')
  await expect(dialog.getByRole('group', { name: f.questions.mood.label })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  const physical = dialog.getByRole('group', { name: f.questions.physical.label })
  await expect(physical.getByRole('radio').first()).toBeChecked()
  // Sekmeyle seçili seçeneğe gelinir, ↓ ile sonrakine geçilir, boşlukla seçilir ve ilerlenir
  const first = physical.getByRole('radio').first()
  for (let i = 0; i < 12 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(physical.getByRole('radio').nth(1)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('group', { name: f.questions.mood.label })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
})

/* ---------- Kayıtlarım (görev 5) ---------- */

test('Kayıtlarım: ortada açılır, günlük yazma kutusu yoktur; günlük notu (Günlük yaz penceresinden) filtrelenir ve yenilemede korunur; check-in kaydı ayrıntısıyla görünür', async ({ page, t }) => {
  await openMind(page)
  const r = t.mindPage.recordsSheet
  const f = t.mindPage.form
  // Önce kısmi bir check-in
  const form = await openForm(page, t)
  await toSummary(form, t)
  await answerFromSummary(form, t, 'mood', 'okay')
  await form.getByRole('button', { name: f.save }).click()
  await expect(form).toBeHidden()

  await writeJournal(page, t, 'Bugün Cupola\'dan gün doğumunu izledim')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  const dialog = page.locator('#my-records')
  const list = dialog.getByRole('list', { name: r.listLabel })
  await expect(list.locator('article').first()).toHaveAttribute('data-record', 'journal')

  const checkin = list.locator('article[data-record="checkin"][data-outcome="saved"]')
  await expect(checkin).toContainText(r.partial(1, 6))
  await checkin.getByRole('button', { name: r.details }).click()
  await expect(checkin.locator('[data-question="physical"] dd')).toHaveText(f.omitted)

  const filters = dialog.getByRole('group', { name: r.filterLabel })
  await filters.getByRole('button', { name: r.filters.journal }).click()
  await expect(list.locator('article[data-record="checkin"]')).toHaveCount(0)
  await expect(list.locator('article[data-record="journal"]')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await page.reload()
  await page.locator('#page-next').click()
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  await expect(page.locator('#my-records article[data-record="journal"]')).toContainText('gün doğumunu')
})

/* ---------- Acil destek: hekimle iletişim (görev 6) ---------- */

test('hekimle iletişim: belirti, veri eki, gözden geçirme ve demo giden kutusuna gönderim', async ({ page, t }) => {
  await openMind(page)
  const c = t.mindPage.contact
  await page.locator('#emergency-button').click()
  await page.locator('#emergency-dialog').getByRole('button', { name: t.mindPage.sos.notUrgent }).click()
  const dialog = page.locator('#doctor-contact')
  await expect(dialog.getByRole('group', { name: c.recipient }).getByRole('radio')).toBeChecked()
  // Hiçbir veri varsayılan olarak seçili değil
  await expect(dialog.getByRole('group', { name: c.attach }).getByRole('checkbox', { checked: true })).toHaveCount(0)
  await dialog.getByRole('checkbox', { name: c.symptom.headache }).check()
  await dialog.getByRole('checkbox', { name: 'Nabız' }).check()
  await expect(dialog.locator('[data-range="exact"]')).toBeVisible()
  await expect(dialog.locator('[data-category="hr"]')).toContainText(/\d+ kayıt/)
  await dialog.getByRole('button', { name: c.review }).click()
  await expect(dialog.getByRole('heading', { name: c.reviewTitle })).toBeVisible()
  await expect(dialog.locator('[data-review="message"]')).toContainText(c.symptom.headache)
  await dialog.getByRole('button', { name: c.send }).click()
  await expect(dialog.getByRole('status')).toContainText(c.sentTitle)
  await expect(dialog).toContainText(c.noAck)
  await dialog.getByRole('button', { name: c.openMessages }).click()
  await expect(activePage(page)).toHaveAttribute('data-page', '3')
})

/* ---------- Acil durum: mürettebattan acil yardım isteği (görev 7) ---------- */

test('acil durum: açmak ve kısa basmak göndermez; yarım saniye basılı tutunca etkinleşir; sağ altta tek bildirim; sonlandırınca kapanır', async ({ page, t }) => {
  await openMind(page)
  const s = t.mindPage.sos
  const assists = () => page.evaluate(() => (JSON.parse(localStorage.getItem('vitalis.db') ?? '{}') as { assists?: { endedAt?: number }[] }).assists ?? [])
  await page.locator('#emergency-button').click()
  const dialog = page.locator('#emergency-dialog')
  const hold = dialog.getByRole('button', { name: s.hold })
  // Açılınca odak basılı tutma düğmesinde; kısa basış hiçbir şey göndermez
  await expect(hold).toBeFocused()
  await page.keyboard.press('Space')
  await expect(dialog.getByText(s.tooShort)).toBeVisible()
  expect(await assists()).toHaveLength(0)

  // Klavyede Boşluk yarım saniyeden uzun basılı tutulur
  await page.keyboard.down('Space')
  await page.waitForTimeout(700)
  await page.keyboard.up('Space')
  await expect(page.getByRole('dialog', { name: s.activeTitle })).toBeVisible()
  await expect.poll(async () => (await assists()).length).toBe(1)
  await expect(dialog.getByText(s.prompt)).toBeVisible()
  await expect(dialog.getByText(s.demo)).toBeVisible()
  await expect(page.locator('#emergency-button')).toHaveAttribute('data-active', 'true')

  // Bildirenin ekranında sağ altta tek bildirim
  const notice = page.locator('[data-sos-notice="start"]')
  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText(s.noticeTo)
  const nb = (await notice.boundingBox())!
  const vp = page.viewportSize()!
  expect(vp.width - (nb.x + nb.width)).toBeLessThan(40)
  expect(vp.height - (nb.y + nb.height)).toBeLessThan(40)

  // Yazarak cevap acil duruma eklenir
  await dialog.getByLabel(s.typeLabel).fill('Başım dönüyor')
  await page.keyboard.press('Enter')
  await expect(dialog.locator('[data-said="ok"]')).toContainText('Başım dönüyor')

  // Sonlandır: kapatıldı ekranı, sağ altta "kapattı" bildirimi, üst çubuktaki düğme normale döner
  await dialog.getByRole('button', { name: s.end }).click()
  await expect(dialog.getByText(s.endedTitle)).toBeVisible()
  await expect(page.locator('[data-sos-notice]')).toHaveCount(1)
  await expect(page.locator('[data-sos-notice="end"]')).toBeVisible()
  await expect.poll(async () => typeof (await assists())[0]?.endedAt).toBe('number')
  await dialog.getByRole('button', { name: s.done }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('#emergency-button')).not.toHaveAttribute('data-active', 'true')
})

/* ---------- Destek kütüphanesi: nefes molası (görev 8) ---------- */

test('nefes molası: açınca hiçbir şey başlamaz; klavyeyle başlatılır ve duraklatılıp erken bitirilir', async ({ page, t }) => {
  await openMind(page)
  const b = t.mindPage.breath
  await activePage(page).getByRole('button', { name: t.mindPage.library.open(t.mindPage.library.breathing.title) }).click()
  const sheet = page.locator('#breathing-sheet')
  // Pencere ekranın ortasında açılır
  await expect(sheet).toBeVisible()
  const box = (await sheet.boundingBox())!
  const overlay = await sheet.evaluate((el) => { const r = el.parentElement!.getBoundingClientRect(); return r.left + r.width / 2 })
  expect(Math.abs(box.x + box.width / 2 - overlay)).toBeLessThan(4)
  await expect(sheet.locator('[data-phase]')).toHaveCount(0)
  // Sorular tek tek ve yalnızca klavyeyle: rakam seçer, seçince kendiliğinden ilerler (1 dk → sessiz → tık yok)
  const duration = sheet.getByRole('group', { name: b.askDuration })
  await expect(duration.getByRole('radio')).toHaveCount(3)
  for (const r of await duration.getByRole('radio').all()) await expect(r).not.toBeChecked()
  await page.keyboard.press('1')
  await expect(sheet.getByRole('heading', { name: b.askSound })).toBeFocused()
  await page.keyboard.press('2')
  await expect(sheet.getByRole('heading', { name: b.askClick })).toBeFocused()
  await page.keyboard.press('2')
  // Hazır ekranı: özet, tempo ve incelenmemiş prototip notu; hiçbir şey kendiliğinden başlamaz
  await expect(sheet.getByRole('heading', { name: b.readyTitle })).toBeFocused()
  await expect(sheet.getByText(b.pacingUnreviewed)).toBeVisible()
  await expect(sheet.locator('[data-summary="duration"]')).toContainText(b.minutes(1))
  await expect(sheet.locator('[data-phase]')).toHaveCount(0)
  await sheet.getByRole('button', { name: b.start }).focus()
  await page.keyboard.press('Enter')
  await expect(sheet.locator('[data-phase]')).toHaveText(b.phase.inhale)
  await expect(sheet.getByRole('timer')).toContainText('01:00')
  // Tek duraklatma düğmesi; duraklatınca devam et ve bitir
  await expect(sheet.getByRole('timer')).toBeVisible()
  await sheet.getByRole('button', { name: b.pause }).click()
  await expect(sheet.getByRole('button', { name: b.resume })).toBeVisible()
  await sheet.getByRole('button', { name: b.finish }).click()
  await expect(sheet.getByRole('status')).toHaveText(b.earlyEnd)
})

/* ---------- Destek kütüphanesi: Dünya galerisi (görev 11, GAL-01…GAL-04) ---------- */

async function openGallery(page: Page, t: Dict) {
  const l = t.mindPage.library
  await activePage(page).getByRole('button', { name: l.open(l.gallery.title) }).click()
  return page.getByRole('dialog', { name: l.gallery.title })
}

test('Dünya galerisi: internet yokken uygulamayla gelen görseller açılır; görüntüleyici ve kaynak bilgisi', async ({ page, t }) => {
  // Dışarıya giden her istek kesilir: görseller yalnızca uygulamadan gelmeli
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort())
  await openMind(page)
  const g = t.mindPage.gallery
  const sheet = await openGallery(page, t)
  // Açılışta Doğa: 8 fotoğraf, hepsi uygulamayla gelir (internet yokken de yüklenir)
  await expect(sheet.getByRole('radio', { name: g.categories.nature })).toBeChecked()
  const natureThumbs = sheet.getByRole('list').getByRole('button')
  await expect(natureThumbs).toHaveCount(8)
  await expect.poll(() => natureThumbs.locator('img').evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await sheet.getByRole('radio', { name: g.categories.places }).check()
  await expect(sheet.getByRole('list').getByRole('button')).toHaveCount(8)
  await sheet.getByRole('radio', { name: g.categories.orbit }).check()
  const thumbs = sheet.getByRole('list').getByRole('button')
  await expect(thumbs).toHaveCount(11)
  await thumbs.nth(0).click()
  const viewer = sheet.getByRole('region', { name: g.viewer.label })
  const img = viewer.getByRole('img')
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await expect(viewer.getByRole('region', { name: g.source.title })).toContainText(g.source.credit('NASA EPIC Team'))
  await expect(viewer.getByText(g.viewer.position(1, 11))).toBeVisible()
  // Görüntüleyici açılınca odak Geri düğmesindedir; ok tuşları görüntüleyicide çalışır
  await expect(viewer.getByRole('button', { name: g.viewer.back })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(viewer.getByText(g.viewer.position(2, 11))).toBeVisible()
  await viewer.getByRole('button', { name: g.viewer.next }).click()
  await expect(viewer.getByText(g.viewer.position(3, 11))).toBeVisible()
  await viewer.getByRole('button', { name: g.viewer.back }).click()
  await expect(thumbs.nth(0)).toBeFocused()
})

test('Dünya galerisi: kişisel fotoğraf bu tarayıcıda kalır (yeniden yüklemede durur), bozuk dosya reddedilir, silme onay ister', async ({ page, t }) => {
  const sent: string[] = []
  page.on('request', (r) => r.method() !== 'GET' && sent.push(r.url()))
  await openMind(page)
  const g = t.mindPage.gallery
  let sheet = await openGallery(page, t)
  await sheet.getByRole('radio', { name: g.categories.mine }).check()
  await expect(sheet.getByText(g.mine.intro)).toBeVisible()
  const thumb = 'public/data/nasa/epic/thumbs/epic_1b_20261106002712.jpg'
  await sheet.locator('[data-photo-input]').setInputFiles([
    { name: 'aile.jpg', mimeType: 'image/jpeg', buffer: readFileSync(thumb) },
    { name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]) },
  ])
  const alert = sheet.getByRole('alert')
  await expect(alert).toContainText(g.mine.added(1))
  await expect(alert).toContainText(g.mine.errors.corrupt('bozuk.jpg'))
  await expect(sheet.getByRole('list').getByRole('button')).toHaveCount(1)
  // Fotoğraf hiçbir yere gönderilmez; localStorage'a yazılmaz
  expect(sent.filter((u) => !u.includes('/api/rpc/'))).toEqual([])
  expect(await page.evaluate(() => (localStorage.getItem('vitalis.db') ?? '').includes('epic_1b_20261106002712'))).toBe(false)

  await page.reload()
  await openMind(page, page.url().replace(/^https?:\/\/[^/]+/, ''))
  sheet = await openGallery(page, t)
  await sheet.getByRole('radio', { name: g.categories.mine }).check()
  await sheet.getByRole('list').getByRole('button').click()
  const viewer = sheet.getByRole('region', { name: g.viewer.label })
  await expect.poll(() => viewer.getByRole('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  await viewer.getByRole('button', { name: g.mine.delete }).click()
  await viewer.getByRole('alertdialog').getByRole('button', { name: g.mine.cancel }).click()
  await viewer.getByRole('button', { name: g.mine.delete }).click()
  await viewer.getByRole('alertdialog').getByRole('button', { name: g.mine.confirm }).click()
  await expect(sheet.getByRole('status')).toHaveText(g.mine.deleted)
  await expect(sheet.getByText(g.mine.empty)).toBeVisible()
})

/* ---------- Tasarım ve erişilebilirlik inceliği (görev 12) ---------- */

test('bir iş sürerken mesaj bildirimi pencerenin üstüne çıkmaz; pencere kapanınca görünür', async ({ page, t }) => {
  await openMind(page)
  const c = t.mindPage.contact
  await page.locator('#emergency-button').click()
  await page.locator('#emergency-dialog').getByRole('button', { name: t.mindPage.sos.notUrgent }).click()
  const dialog = page.locator('#doctor-contact')
  await dialog.getByRole('checkbox', { name: c.symptom.headache }).check()
  await dialog.getByRole('button', { name: c.review }).click()
  await dialog.getByRole('button', { name: c.send }).click()
  await expect(dialog.getByRole('status')).toContainText(c.sentTitle)
  // Mesaj (demo: hekim tarafının bildirimi) ulaşsa da pencere açıkken bildirim çıkmaz
  const inbox = page.getByRole('region', { name: t.inbox.label })
  await page.waitForTimeout(4000)
  await expect(inbox.getByRole('button')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(inbox.getByText(t.inbox.messageEyebrow, { exact: false })).toBeVisible({ timeout: 8000 })
})

test('günlük notu silmeden önce onay ister; vazgeçince not kalır', async ({ page, t }) => {
  await openMind(page)
  await writeJournal(page, t, 'Silinmemesi gereken not')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  const dialog = page.locator('#my-records')
  const note = dialog.locator('article[data-record="journal"]').first()
  await note.getByRole('button', { name: t.journal.remove }).click()
  const confirm = note.getByRole('alertdialog')
  await expect(confirm).toContainText(t.journal.confirmRemove)
  await expect(confirm.getByRole('button', { name: t.journal.confirm })).toBeFocused()
  await confirm.getByRole('button', { name: t.journal.cancel }).click()
  await expect(note).toContainText('Silinmemesi gereken not')
  await note.getByRole('button', { name: t.journal.remove }).click()
  await note.getByRole('alertdialog').getByRole('button', { name: t.journal.confirm }).click()
  await expect(dialog.locator('article[data-record="journal"]', { hasText: 'Silinmemesi gereken not' })).toHaveCount(0)
})

/* ---------- Son bütünleştirme senaryoları (görev 13) ---------- */

test('gece yarısından sonra gönderilen check-in önceki günün akşam penceresine yazılır', async ({ page, t }) => {
  // Görev saati UTC: 13 Kasım 00:30, 12 Kasım akşam penceresinin (20:00–08:00) içindedir
  await page.clock.setFixedTime(new Date('2026-11-13T00:30:00Z'))
  await openMind(page)
  await expect(currentCard(page)).toHaveAttribute('data-window', 'evening')
  const f = t.mindPage.form
  const dialog = await openForm(page, t)
  await toSummary(dialog, t)
  await answerFromSummary(dialog, t, 'energy', 'tired')
  await dialog.getByRole('button', { name: f.save }).click()
  await expect(currentCard(page)).toHaveAttribute('data-outcome', 'saved')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  const record = page.locator('#my-records article[data-record="checkin"][data-window="evening"][data-outcome="saved"]')
  await expect(record).toContainText('12 Kasım')
  await expect(record).toContainText(t.mindPage.recordsSheet.partial(1, 6))
})

test('mürettebat üyesi değişince öncekinin günlüğü ve fotoğrafları görünmez', async ({ page, t }) => {
  await openMind(page)
  await writeJournal(page, t, 'Yıldız\'ın özel notu')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  const records = page.locator('#my-records')
  await expect(records.locator('article[data-record="journal"]')).toContainText('özel notu')
  await page.keyboard.press('Escape')
  const l = t.mindPage.library
  const g = t.mindPage.gallery
  await activePage(page).getByRole('button', { name: l.open(l.gallery.title) }).click()
  let gallery = page.locator('#gallery-sheet')
  await gallery.getByRole('radio', { name: g.categories.mine }).check()
  await gallery.locator('[data-photo-input]').setInputFiles({ name: 'aile.jpg', mimeType: 'image/jpeg', buffer: readFileSync('public/data/nasa/epic/thumbs/epic_1b_20261106002712.jpg') })
  await expect(gallery.getByRole('list').getByRole('button')).toHaveCount(1)
  await page.keyboard.press('Escape')

  await page.locator('#tour-profile').click()
  await page.locator('[data-profile="mori"]').click()
  await expect(page.locator('#tour-profile')).toContainText('Mori')
  // Yeni astronotun uyarı bildirimleri sağ üstte açılır ve sağ üstteki Kayıtlarım kutusunun üstüne gelir: kullanıcı gibi kapatılır
  const close = page.locator('[data-sonner-toast]').getByRole('button', { name: t.toast.closeAlert })
  await page.waitForTimeout(1500)
  while ((await close.count()) > 0) {
    await close.first().click()
    await page.waitForTimeout(300)
  }
  if ((await activePage(page).getAttribute('data-page')) !== '1') await page.locator('#page-next').click()
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  await expect(page.locator('#my-records')).not.toContainText('özel notu')
  await page.keyboard.press('Escape')
  await activePage(page).getByRole('button', { name: l.open(l.gallery.title) }).click()
  gallery = page.locator('#gallery-sheet')
  await gallery.getByRole('radio', { name: g.categories.mine }).check()
  await expect(gallery.getByText(g.mine.empty)).toBeVisible()
})

test.describe('çevrimdışı', () => {
  test.use({ allowOfflineErrors: true })
test('çevrimdışı (yükledikten sonra ağ yok): yerel işler çalışır; yüklenemeyen görseller dürüstçe söylenir', async ({ page, t }) => {
  await openMind(page)
  await page.context().setOffline(true)
  const f = t.mindPage.form
  // Check-in (tarayıcı motoru)
  const dialog = await openForm(page, t)
  await toSummary(dialog, t)
  await answerFromSummary(dialog, t, 'energy', 'tired')
  await dialog.getByRole('button', { name: f.save }).click()
  await expect(currentCard(page)).toHaveAttribute('data-outcome', 'saved')
  // Günlük
  await writeJournal(page, t, 'Ağsız not')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  const records = page.locator('#my-records')
  await expect(records.locator('article[data-record="journal"]').first()).toContainText('Ağsız not')
  await page.keyboard.press('Escape')
  // Nefes molası
  const l = t.mindPage.library
  await activePage(page).getByRole('button', { name: l.open(l.breathing.title) }).click()
  const breathing = page.locator('#breathing-sheet')
  await breathing.getByRole('radio', { name: t.mindPage.breath.minutes(1) }).click()
  await breathing.getByRole('radio', { name: t.mindPage.breath.soundNo }).click()
  await breathing.getByRole('radio', { name: t.mindPage.breath.clickNo }).click()
  await breathing.getByRole('button', { name: t.mindPage.breath.start }).click()
  await expect(breathing.getByRole('timer')).toBeVisible()
  await page.keyboard.press('Escape')
  // Galeri: görseller daha önce hiç yüklenmediyse yüklenemedikleri açıkça yazılır (boş kategori gibi gösterilmez)
  await activePage(page).getByRole('button', { name: l.open(l.gallery.title) }).click()
  const gallery = page.locator('#gallery-sheet')
  // Açılıştaki Doğa fotoğrafları
  await expect(gallery.getByRole('alert')).toContainText(t.mindPage.gallery.loadFailed)
  await expect(gallery.locator('[data-empty]')).toHaveCount(0)
  // Yörüngeden Dünya (EPIC listesi)
  await gallery.getByRole('radio', { name: t.mindPage.gallery.categories.orbit }).check()
  await expect(gallery.getByRole('alert')).toContainText(t.mindPage.gallery.loadFailed)
  await expect(gallery.locator('[data-empty]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // Cupola: durağan görüntü yüklenemez; boş ekran değil, açıklama ve çıkış (testler hareketi azaltarak çalışır)
  await activePage(page).getByRole('button', { name: l.open(l.cupola.title) }).click()
  const cupola = page.locator('#cupola-sheet')
  await expect(cupola.getByText(t.mindPage.cupola.stillFailed)).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(cupola).toBeHidden()
  await page.context().setOffline(false)
})
})

/* ---------- Düzeltmeler (2026-11-13) ---------- */

test('günlük: başlıktaki "Günlük yaz" ortada açılır, imleç yazı alanında; arka plan yenilense de yazı kesilmez', async ({ page, t }) => {
  await openMind(page)
  const j = t.journal
  await activePage(page).getByRole('button', { name: j.write }).click()
  const dialog = page.locator('#journal-dialog')
  const box = dialog.getByLabel(j.placeholder)
  await expect(box).toBeFocused()
  // Sayfa birkaç saniyede bir yenilenir (veri yoklaması); önceden odak kapat düğmesine kaçıyordu
  await page.keyboard.type('Bugün Cupola penceresinden', { delay: 40 })
  await page.waitForTimeout(4000)
  await page.keyboard.type(' gün doğumunu izledim.', { delay: 40 })
  await expect(box).toHaveValue('Bugün Cupola penceresinden gün doğumunu izledim.')
  await dialog.getByRole('button', { name: j.save }).click()
  await expect(dialog.getByRole('status')).toHaveText(j.saved)
  await expect(dialog.locator('li').first()).toContainText('gün doğumunu izledim')
  await page.keyboard.press('Escape')
  await activePage(page).getByRole('button', { name: t.mindPage.records }).click()
  await expect(page.locator('#my-records article[data-record="journal"]').first()).toContainText('gün doğumunu izledim')
})

test('tepki testi: Zihinsel sağlık başlığından ortada açılır; klavyeyle 5 deneme yapılır ve sonuç kaydedilir', async ({ page, t }) => {
  await openMind(page)
  const r = t.reaction
  await activePage(page).getByRole('button', { name: r.title }).click()
  const dialog = page.locator('#reaction-test')
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  const overlay = await dialog.evaluate((el) => { const r = el.parentElement!.getBoundingClientRect(); return r.left + r.width / 2 })
  expect(Math.abs(box.x + box.width / 2 - overlay)).toBeLessThan(4)
  // Geçmiş sonuçlar açılışta görünür
  const history = dialog.locator('[data-reaction-history] li')
  const before = await history.count()
  expect(before).toBeGreaterThan(0)
  await dialog.getByRole('button', { name: r.start }).click()
  const pad = dialog.locator('#reaction-pad')
  await expect(pad).toBeFocused()
  // Yeşilden önce basmak: "Çok erken", deneme sayılmaz ve alan kendiliğinden yeniden hazırlanır (sınırsız)
  for (let i = 0; i < 3; i++) {
    await expect(pad).toHaveAttribute('data-stage', 'wait')
    await page.keyboard.press('Space')
    await expect(pad).toHaveAttribute('data-stage', 'early')
    await expect(pad).toContainText(r.early)
  }
  await expect(dialog.getByText(r.trial(1, 5))).toBeVisible()
  // Yalnızca yeşilken basmak denemeyi ilerletir (insan hızında: yeşilden 150 ms sonra)
  for (let i = 0; i < 5; i++) {
    await expect(pad).toHaveAttribute('data-stage', 'go', { timeout: 8000 })
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    await expect(pad.or(dialog.locator('[data-reaction-result]'))).not.toHaveAttribute('data-stage', 'go')
  }
  const result = dialog.locator('[data-reaction-result]')
  await expect(result).toContainText(r.saved)
  await expect(result.getByRole('list', { name: r.trialsLabel }).getByRole('listitem')).toHaveCount(5)
  // Kaydedilen test geçmişe "Senin testin" olarak eklenir
  await expect(history.first()).toContainText(r.you)
})

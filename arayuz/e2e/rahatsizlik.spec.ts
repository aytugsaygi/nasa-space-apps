import type { Locator, Page } from '@playwright/test'
import { layersFor } from '../src/data/anatomy'
import { regionsFor } from '../src/data/regions'
import { expect, hologram, open, test, type Dict } from './fixtures'

/**
 * Kas katmanında figürün gövdesine tıklar. Kart açıkken figür, kartın solunda kalan alanın ortasına kayar.
 * Katman geçişi (diğer katmanlar geriye çekilir, kas katmanı belirir) ve ilk açılışta malzemenin hazırlanması
 * birkaç saniye sürebilir; figür görünene kadar gövde üzerindeki birkaç nokta sırayla denenir.
 */
async function pickMuscle(page: Page, card: Locator, feelLabel: string) {
  const area = hologram(page).getByRole('application')
  const points = [
    [0, 0.42],
    [0, 0.36],
    [-0.04, 0.5],
    [0.04, 0.3],
    [0, 0.58],
  ]
  let i = 0
  await expect(async () => {
    const a = (await area.boundingBox())!
    const c = (await card.boundingBox())!
    const [dx, fy] = points[i++ % points.length]
    await page.mouse.click(a.x + (c.x - a.x) / 2 + dx * a.width, a.y + a.height * fy)
    await expect(card.getByRole('group', { name: feelLabel })).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 30_000 })
}

test('rahatsızlık bildir: kas ve iskelet yan yana açılır; kas sistemi seçilir → kas → belirti → asistan cevap verir', async ({ page, t, lang }) => {
  await open(page)
  const holo = hologram(page)
  const layers = layersFor(lang)

  const complaint = holo.getByRole('button', { name: t.hologram.complaint, exact: true })
  await complaint.click()
  await expect(complaint).toHaveAttribute('aria-pressed', 'true')
  // İki sistem yan yana açılır; henüz biri seçilmemiştir
  await expect(holo.getByRole('button', { name: t.hologram.merge })).toHaveAttribute('aria-pressed', 'true')
  await expect(holo.getByRole('group', { name: t.hologram.layersList }).getByRole('button', { name: t.hologram.all, exact: true })).toHaveAttribute('aria-pressed', 'true')

  const card = holo.getByRole('region', { name: t.hologram.complaint })
  await expect(card).toContainText(t.hologram.complaintChooseSystem)
  await card.getByRole('group', { name: t.hologram.complaintSystemGroup }).getByRole('button', { name: layers.muscles.name }).click()
  await expect(holo.getByRole('group', { name: t.hologram.layersList }).getByRole('button', { name: new RegExp(layers.muscles.name) })).toHaveAttribute('aria-pressed', 'true')
  await expect(card).toContainText(t.hologram.complaintPick.muscles)
  await pickMuscle(page, card, t.hologram.complaintFeel)

  const muscle = (await card.locator('p.font-display').textContent())!.trim()
  expect(muscle.length).toBeGreaterThan(3)

  const ask = card.getByRole('button', { name: t.hologram.complaintAsk })
  await expect(ask).toBeDisabled()
  await card.getByRole('button', { name: t.hologram.symptoms.pain }).click()
  await expect(ask).toBeEnabled()
  await ask.click()

  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toBeVisible()
  await expect(chat).toContainText(t.hologram.complaintQuestion(muscle, t.hologram.symptomPhrase.pain))
  await expect(chat).toContainText(`${muscle} için ağrı bildirdin.`)
  await expect(chat).toContainText('48 saatte', { timeout: 15_000 })
})

test('sistem seçiminde figüre tıklamak o sistemi açar; iskelette kırık şüphesi ve anlatılan durum asistana gider', async ({ page, t, lang }) => {
  await open(page)
  const holo = hologram(page)
  const layers = layersFor(lang)
  await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  const card = holo.getByRole('region', { name: t.hologram.complaint })
  await expect(card).toContainText(t.hologram.complaintChooseSystem)

  // Sağdaki figür iskelettir: kartın solunda kalan alanın sağ çeyreğine, göğüs hizasına tıklanır (figürler yere basar,
  // kart açıkken alanın alt yarısındadır)
  const area = hologram(page).getByRole('application')
  const bones = holo.getByRole('group', { name: t.hologram.layersList }).getByRole('button', { name: new RegExp(layers.bones.name) })
  // Kaburgalar arasında boşluk olabilir: her denemede biraz farklı yüksekliğe tıklanır (göğüs, omurga, leğen)
  const heights = [0.6, 0.66, 0.55, 0.72, 0.5]
  let attempt = 0
  await expect(async () => {
    const a = (await area.boundingBox())!
    const c = (await card.boundingBox())!
    await page.mouse.click(a.x + ((c.x - a.x) * 3) / 4 - 4, a.y + a.height * heights[attempt++ % heights.length])
    await expect(bones).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await expect(card).toContainText(t.hologram.complaintPick.bones)

  await pickMuscle(page, card, t.hologram.complaintBoneFeel)
  const bone = (await card.locator('p.font-display').textContent())!.trim()
  expect(bone.length).toBeGreaterThan(3)

  // "Diğer" seçilince durum yazılmadan gönderilemez
  const ask = card.getByRole('button', { name: t.hologram.complaintAsk })
  await card.getByRole('button', { name: t.hologram.symptoms.other }).click()
  await expect(ask).toBeDisabled()
  await expect(card).toContainText(t.hologram.complaintDescribeRequired)

  await card.getByRole('button', { name: t.hologram.symptoms.fracture }).click()
  await expect(card).toContainText(t.hologram.complaintSuspect)
  await card.getByRole('textbox', { name: t.hologram.complaintDescribeOptional }).fill('Tutamağa çarptım')
  await ask.click()

  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toContainText(t.hologram.boneQuestion(bone, t.hologram.symptomPhrase.fracture))
  await expect(chat).toContainText(`${bone} için kırık şüphesi bildirdin.`, { timeout: 15_000 })
  await expect(chat).toContainText('Anlattığın: "Tutamağa çarptım"', { timeout: 15_000 })
  await expect(chat).toContainText('Kırık şüphesini hemen uçuş hekimine bildir', { timeout: 15_000 })
  await expect(chat.getByRole('link', { name: /Broken bone/ })).toBeVisible({ timeout: 15_000 })
})

test('karttaki X rahatsızlık bildirmeden çıkar: hologram geri gelir, seçim ve yakınlaştırma sıfırlanır', async ({ page, t, lang }) => {
  await open(page)
  const holo = hologram(page)
  await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  const card = holo.getByRole('region', { name: t.hologram.complaint })
  await card.getByRole('button', { name: layersFor(lang).muscles.name }).click()
  await pickMuscle(page, card, t.hologram.complaintFeel)
  // Dar kartta yakınlaştırma kapsülü gizlidir; klavyeyle yakınlaştırılır
  await holo.getByRole('application').focus()
  await page.keyboard.press('+')
  await expect(holo.getByRole('button', { name: t.hologram.zoomReset, includeHidden: true })).not.toHaveText('%100')

  await card.getByRole('button', { name: t.hologram.complaintClose }).click()
  await expect(card).toHaveCount(0)
  await expect(holo.getByRole('button', { name: t.hologram.complaint, exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(holo.getByRole('button', { name: t.hologram.explode })).toHaveAttribute('aria-pressed', 'false')
  await expect(holo.getByRole('list', { name: t.hologram.regionsList })).toBeVisible()
  await expect(holo.getByRole('button', { name: t.hologram.zoomReset })).toHaveText('%100')
  // Bilgi kartı seçili kası değil genel değerlendirmeyi gösterir
  await expect(page.locator('[data-page="0"] #tour-panel')).toContainText(t.panel.overviewTitle)

  // Düğmeyle kapatmak da aynı şekilde hologramı geri getirir
  await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  await expect(card).toBeVisible()
  await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(holo.getByRole('list', { name: t.hologram.regionsList })).toBeVisible()
})

test('kas ile iskelet arasında geçmek modu kapatmaz, seçimi temizler; şikayet geçmişi düğmesi yanında', async ({ page, t, lang }) => {
  await open(page)
  const holo = hologram(page)
  const layers = layersFor(lang)
  await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  const card = holo.getByRole('region', { name: t.hologram.complaint })
  await card.getByRole('button', { name: layers.muscles.name }).click()
  await pickMuscle(page, card, t.hologram.complaintFeel)

  // Alttaki katman listesinden iskelete geçilir: kart açık kalır, kas seçimi temizlenir
  await holo.getByRole('group', { name: t.hologram.layersList }).getByRole('button', { name: new RegExp(layers.bones.name) }).click()
  await expect(card).toContainText(t.hologram.complaintPick.bones)
  // Karttaki geri düğmesi sistem seçimine döner
  await card.getByRole('button', { name: new RegExp(t.hologram.complaintSwitch) }).click()
  await expect(card).toContainText(t.hologram.complaintChooseSystem)

  // Şikayet geçmişi düğmesi Rahatsızlık bildir düğmesinin hemen yanında
  const report = (await holo.getByRole('button', { name: t.hologram.complaint, exact: true }).boundingBox())!
  const history = holo.getByRole('button', { name: t.complaintSave.history })
  const hb = (await history.boundingBox())!
  expect(hb.x).toBeGreaterThan(report.x + report.width)
  expect(hb.x - (report.x + report.width)).toBeLessThan(16)
  expect(Math.abs(hb.y + hb.height / 2 - (report.y + report.height / 2))).toBeLessThan(2)
  await history.click()
  await expect(page.getByRole('dialog', { name: t.complaintSave.historyTitle })).toBeVisible()
})

/** Rahatsızlık bildirmeyi açar, kas sistemini seçer ve kartı verir */
async function openComplaint(page: Page, t: Dict, lang: 'tr' | 'en') {
  await open(page)
  await hologram(page).getByRole('button', { name: t.hologram.complaint, exact: true }).click()
  const card = hologram(page).getByRole('region', { name: t.hologram.complaint })
  await card.getByRole('button', { name: layersFor(lang).muscles.name }).click()
  await settle(page)
  return card
}

/**
 * Sistem seçilince figür yan yana görünümden ortaya kayar ve yakınlaşır (yaklaşık bir saniye; paralel testlerde daha uzun).
 * Kayma bitmeden sabit noktalara tıklamak başka bir kası seçer; sonraki tıklama onu seçimden çıkarır.
 */
const settle = (page: Page) => page.waitForTimeout(2500)

/* ---------- Birden çok kas ---------- */

/**
 * Figürde kas noktaları (kartın solunda kalan alanın ortasına göre; fy 3D alan yüksekliğinin oranı).
 * dx, 700 piksel yüksekliğindeki alanda piksel olarak yazılır; figür alan yüksekliğiyle ölçeklendiği için tıklarken
 * gerçek yüksekliğe çevrilir (ana sayfadaki hologram daha kısa olabilir).
 */
const REF_HEIGHT = 700
const RIGHT_THIGH: [number, number] = [-25, 0.6]
const LEFT_THIGH: [number, number] = [25, 0.6]
const RIGHT_SHOULDER: [number, number] = [-56, 0.26]

/** Kartta seçili kas sayısı: birden çok kasta her kasın bir çıkarma düğmesi vardır; tek kasta belirti seçimi görünür */
async function pickedCount(card: Locator, t: Dict) {
  const [prefix, suffix] = t.hologram.complaintRemove('§').split('§')
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const chips = await card.getByRole('button', { name: new RegExp(`^${esc(prefix)}.+${esc(suffix)}$`) }).count()
  if (chips) return chips
  return (await card.getByRole('group', { name: t.hologram.complaintFeel }).isVisible()) ? 1 : 0
}

/**
 * Figürde bir noktaya tıklayıp seçili kas sayısının beklenen değere ulaşmasını bekler.
 * Katman geçişi bitmeden tıklama boşa gidebilir; paralel testlerde tarayıcı yavaşladığından tıklamanın işlenmesi 3 saniyeye kadar beklenir (erken yeniden tıklamak seçimi geri alır). Sayı zaten tutuyorsa yeniden tıklanmaz (tıklama seçimi aç/kapa yapar).
 */
async function clickMuscle(page: Page, card: Locator, t: Dict, [dx, fy]: [number, number], expected: number) {
  const area = hologram(page).getByRole('application')
  await expect(async () => {
    if ((await pickedCount(card, t)) === expected) return
    const a = (await area.boundingBox())!
    const c = (await card.boundingBox())!
    await page.mouse.click(a.x + (c.x - a.x) / 2 + (dx * a.height) / REF_HEIGHT, a.y + a.height * fy)
    await expect.poll(() => pickedCount(card, t), { timeout: 3000 }).toBe(expected)
  }).toPass({ timeout: 30_000 })
}

test('aynı bölgeden birden çok kas: tek bölge olarak değerlendirilir', async ({ page, t, lang }) => {
  const regions = regionsFor(lang)
  const card = await openComplaint(page, t, lang)
  await clickMuscle(page, card, t, RIGHT_THIGH, 1)
  await clickMuscle(page, card, t, LEFT_THIGH, 2)

  await expect(card).toContainText(t.hologram.complaintCount.muscles(2))
  await expect(card).toContainText(`${regions.bacaklar.name} · ${t.hologram.complaintOneRegion}`)
  await expect(card.getByRole('group', { name: regions.bacaklar.name })).toBeVisible()

  await card.getByRole('button', { name: t.hologram.symptoms.pain }).click()
  await card.getByRole('button', { name: t.hologram.complaintAsk }).click()
  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toContainText(t.hologram.complaintGroupQuestion(regions.bacaklar.name, 2, t.hologram.symptomPhrase.pain))
  await expect(chat).toContainText('Bacaklar bölgesinde 2 kasta ağrı bildirdin.')
  await expect(chat).toContainText('48 saatte', { timeout: 15_000 })
  await expect(chat).not.toContainText('ayrı bölgede')
})

test('farklı bölgelerden kaslar: her bölge ayrı raporlanır', async ({ page, t, lang }) => {
  const regions = regionsFor(lang)
  const card = await openComplaint(page, t, lang)
  await clickMuscle(page, card, t, RIGHT_THIGH, 1)
  await clickMuscle(page, card, t, LEFT_THIGH, 2)
  await clickMuscle(page, card, t, RIGHT_SHOULDER, 3)

  await expect(card).toContainText(t.hologram.complaintRegions(2))
  await expect(card.getByRole('group', { name: regions.ustKol.name })).toBeVisible()
  await expect(card.getByRole('group', { name: regions.bacaklar.name })).toBeVisible()

  await card.getByRole('button', { name: t.hologram.symptoms.pain }).click()
  await card.getByRole('button', { name: t.hologram.complaintAsk }).click()
  const chat = page.getByRole('dialog', { name: t.chat.label })
  await expect(chat).toContainText('2 ayrı bölgede ağrı bildirdin; her bölgeyi ayrı değerlendiriyorum.')
  await expect(chat).toContainText(`1. ${regions.ustKol.name} (1 kas)`, { timeout: 15_000 })
  await expect(chat).toContainText(`2. ${regions.bacaklar.name} (2 kas)`, { timeout: 15_000 })
  await expect(chat).toContainText('Hepsi için:', { timeout: 15_000 })
  await expect(chat).toContainText('48 saatte', { timeout: 15_000 })
})

test('seçili kasa yeniden tıklamak ya da çipteki X onu çıkarır; Tümünü kaldır seçimi temizler', async ({ page, t, lang }) => {
  const card = await openComplaint(page, t, lang)
  await clickMuscle(page, card, t, RIGHT_THIGH, 1)
  await clickMuscle(page, card, t, LEFT_THIGH, 2)
  // Aynı kasa yeniden tıklamak onu çıkarır
  await clickMuscle(page, card, t, LEFT_THIGH, 1)
  await clickMuscle(page, card, t, LEFT_THIGH, 2)

  // Çipteki X ile çıkarma
  const [prefix, suffix] = t.hologram.complaintRemove('§').split('§')
  await card.getByRole('button', { name: new RegExp(`^${prefix}.+${suffix}$`) }).first().click()
  await expect.poll(() => pickedCount(card, t)).toBe(1)

  await clickMuscle(page, card, t, RIGHT_SHOULDER, 2)
  await card.getByRole('button', { name: t.hologram.complaintClearAll }).click()
  await expect(card).toContainText(t.hologram.complaintPick.muscles)
})

test('çok kas seçilince kart 3D alana sığar; tekerlek kartta listeyi kaydırır, hologramı yakınlaştırmaz', async ({ page, t, lang }) => {
  const card = await openComplaint(page, t, lang)
  const holo = hologram(page)
  // Uyluklar, sol kaval, omuzlar ve gövde yanları: 8 ayrı kas (her nokta farklı bir kasa denk gelir; aynı kasa
  // ikinci kez tıklamak seçimi geri alır)
  const points: [number, number][] = [RIGHT_THIGH, LEFT_THIGH, RIGHT_SHOULDER, [56, 0.26], [-30, 0.66], [32, 0.8], [-48, 0.32], [48, 0.32]]
  for (const [i, p] of points.entries()) await clickMuscle(page, card, t, p, i + 1)

  // Kart 3D alanın içinde biter (geniş alanda zoom kapsülünün üstünde; dar alanda kapsül kart açıkken gizlenir);
  // belirti seçimi ve Asistana sor kartın içinde görünür kalır
  const cardBox = (await card.boundingBox())!
  const pillGroup = holo.getByRole('group', { name: t.hologram.zoomGroup })
  const area = (await holo.getByRole('application').boundingBox())!
  const floor = (await pillGroup.isVisible()) ? (await pillGroup.boundingBox())!.y : area.y + area.height
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(floor)
  const ask = (await card.getByRole('button', { name: t.hologram.complaintAsk }).boundingBox())!
  expect(ask.y + ask.height).toBeLessThanOrEqual(cardBox.y + cardBox.height)

  // Kas listesi kayar; tekerlek hologramı yakınlaştırmaz
  const list = card.getByTestId('complaint-muscles')
  const size = await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(size.scroll).toBeGreaterThan(size.client)
  const lb = (await list.boundingBox())!
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  // Dar alanda kapsül gizli olsa da oranı okunur
  await expect(holo.getByRole('button', { name: t.hologram.zoomReset, includeHidden: true })).toHaveText('%100')
})

test.describe('İngilizce · birden çok kas', () => {
  test.use({ lang: 'en' })

  test('farklı bölgeler İngilizce ayrı raporlanır', async ({ page, t, lang }) => {
    const regions = regionsFor(lang)
    const card = await openComplaint(page, t, lang)
    await clickMuscle(page, card, t, RIGHT_THIGH, 1)
    await clickMuscle(page, card, t, RIGHT_SHOULDER, 2)
    await card.getByRole('button', { name: t.hologram.symptoms.cramp }).click()
    await card.getByRole('button', { name: t.hologram.complaintAsk }).click()
    const chat = page.getByRole('dialog', { name: t.chat.label })
    await expect(chat).toContainText(t.hologram.complaintRegionsQuestion('upper arms and legs', t.hologram.symptomPhrase.cramp))
    await expect(chat).toContainText('You reported a cramp in 2 different regions; here is a separate report for each.')
    await expect(chat).toContainText(`1. ${regions.ustKol.name} (1 muscle)`, { timeout: 15_000 })
    await expect(chat).toContainText('For all of them:', { timeout: 15_000 })
  })
})

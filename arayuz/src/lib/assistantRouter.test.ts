import { describe, expect, it } from 'vitest'
import { CREW, DAY, HOUR, MISSION } from '../core/crew'
import { Engine } from '../core/engine'
import { dispatch } from '../core/rpc'
import { MemoryStore } from '../core/store'
import { en } from '../i18n/en'
import { tr } from '../i18n/tr'
import type { AppCommand } from './appCommands'
import { fold, parseDate } from './assistantDates'
import { fallbackReply, routeQuestion, type RouterContext } from './assistantRouter'

/** Sabit bir an: görevin 142. günü, saat 15:00 (UTC) */
const NOW = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 15 * HOUR
const A = 'yildiz' as const

function setup(lang: 'tr' | 'en' = 'tr', canEdit = true): RouterContext {
  const engine = new Engine(new MemoryStore(), () => NOW)
  return {
    lang,
    t: lang === 'en' ? en : tr,
    locale: lang === 'en' ? 'en-US' : 'tr-TR',
    snapshot: engine.snapshot(A),
    astronaut: A,
    canEdit,
    sex: CREW[A].sex,
    complaints: engine.complaints(A),
    program: engine.program(A),
    data: {
      labs: async () => dispatch(engine, 'labs', [A]),
      series: async (id, from, to) => dispatch(engine, 'series', [A, id, from, to]),
      checkinDay: async () => dispatch(engine, 'checkinDay', [A]),
    },
  }
}

const commands = (r: Awaited<ReturnType<typeof routeQuestion>>): AppCommand[] => (r?.actions ?? []).flatMap((a) => (a.command ? [a.command] : []))
const types = (r: Awaited<ReturnType<typeof routeQuestion>>) => commands(r).map((c) => c.type)
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/

describe('tarih çözümleme', () => {
  it('Türkçe karakterleri ve ekleri sadeleştirir', () => {
    expect(fold("12 Kasım'daki Kan Tahlilim?")).toBe('12 kasim daki kan tahlilim')
    expect(fold('Şikayet oluşturmak İSTİYORUM')).toBe('sikayet olusturmak istiyorum')
  })

  it('takvim günlerini, görev günlerini ve göreli ifadeleri tanır', () => {
    const today = Math.floor(NOW / DAY) * DAY
    expect(parseDate("12 kasım'daki tahlil", NOW)).toMatchObject({ kind: 'day' })
    expect(parseDate('november 12', NOW)).toMatchObject({ kind: 'day' })
    expect(parseDate('90. gündeki kan tahlili', NOW)).toEqual({ kind: 'missionDay', day: 90 })
    expect(parseDate('day 60 blood test', NOW)).toEqual({ kind: 'missionDay', day: 60 })
    expect(parseDate('dünkü nabzım', NOW)).toEqual({ kind: 'day', from: today - DAY, to: today })
    expect(parseDate('3 gün önce', NOW)).toEqual({ kind: 'day', from: today - 3 * DAY, to: today - 2 * DAY })
    expect(parseDate('son 7 gün', NOW)).toMatchObject({ kind: 'range', from: today - 6 * DAY })
    expect(parseDate('geçen hafta', NOW)).toMatchObject({ kind: 'range', from: today - 13 * DAY })
    expect(parseDate('uçuş öncesi tahlil', NOW, { labs: true })).toEqual({ kind: 'preflight' })
    expect(parseDate('son tahlilim', NOW, { labs: true })).toEqual({ kind: 'last' })
  })

  it('gelecekteki bir takvim günü geçen yıl sayılır', () => {
    const q = parseDate('25 aralık', NOW)
    expect(q?.kind).toBe('day')
    if (q?.kind === 'day') expect(new Date(q.from).getUTCFullYear()).toBe(new Date(NOW).getUTCFullYear() - 1)
  })

  it('tarih olmayan metinde tarih bulmaz', () => {
    expect(parseDate('şu an nabzım kaç', NOW)).toBeNull()
    expect(parseDate('maybe 5 more', NOW)).toBeNull()
  })
})

describe('Sağlık Asistanı: site içi yönlendirme', () => {
  it('şikayet oluşturmayı adım adım anlatır ve doğrudan başlatır', async () => {
    const r = await routeQuestion('Şikayet oluşturmak istiyorum', setup())
    expect(r?.text).toContain(tr.hologram.complaint)
    expect(r?.text).toContain(tr.complaintSave.saveAsk)
    expect(types(r)).toContain('startComplaint')
    const e = await routeQuestion('How do I report discomfort?', setup('en'))
    expect(types(e)).toContain('startComplaint')
  })

  it('hekim görünümünde kayıt düğmesi çıkmaz, nedeni söylenir', async () => {
    const r = await routeQuestion('şikayet oluşturmak istiyorum', setup('tr', false))
    expect(types(r)).not.toContain('startComplaint')
    expect(r?.text).toMatch(/astronot görünümünde/)
  })

  it('şikayet güncelleme ve şikayet listesi ayrı cevaplardır', async () => {
    expect(types(await routeQuestion('şikayetim geçti nasıl güncellerim', setup()))).toEqual(['openHistory'])
    const list = await routeQuestion('şikayetlerim', setup())
    expect(list?.text).toMatch(/kayıtlı (bir )?şikayet/i)
    expect(types(list)).toContain('openHistory')
  })

  it.each([
    ['check-in nasıl yapılır', 'openCheckin'],
    ['kayıtlarım nerede', 'openRecords'],
    ['günlük yazmak istiyorum', 'openJournal'],
    ["Cupola'yı aç", 'openLibrary'],
    ['nefes egzersizi başlat', 'openLibrary'],
    ['tepki testi nerede', 'openReaction'],
    ['zihin egzersizleri', 'openMindGames'],
    ['PDF rapor nasıl alınır', 'openReport'],
    ['raporu hekime göndermek istiyorum', 'openReport'],
    ['hekime mesaj yazmak istiyorum', 'openDoctorContact'],
    ['veri içe aktarma nasıl yapılır', 'openImport'],
    ['kontrol takvimi', 'openSchedule'],
    ['sabah ölçümü nasıl girilir', 'openMeasure'],
    ['acil durum', 'openEmergency'],
    ['bölüm eklemek istiyorum', 'openLayoutMenu'],
    ['rehber tur', 'startTour'],
    ['kaynaklar nerede', 'openSources'],
    ['uzay havası', 'openHazards'],
    ['şu an raporu nasıl alırım', 'openReport'],
  ])('"%s" → %s', async (q, cmd) => {
    expect(types(await routeQuestion(q, setup()))).toContain(cmd)
  })

  it.each([
    ['How do I check in?', 'openCheckin'],
    ['open the cupola', 'openLibrary'],
    ['how do I get a PDF report', 'openReport'],
    ['I want to message the flight surgeon', 'openDoctorContact'],
    ['how do I import data', 'openImport'],
    ['start the guided tour', 'startTour'],
  ])('EN "%s" → %s', async (q, cmd) => {
    expect(types(await routeQuestion(q, setup('en')))).toContain(cmd)
  })

  it('yardım sorusu yapabildiklerini ve örnek soruları gösterir', async () => {
    const r = await routeQuestion('neler yapabilirsin', setup())
    expect(r?.text).toMatch(/internetsiz/)
    expect(r?.actions.every((a) => a.kind === 'ask')).toBe(true)
  })

  it('kriz, ilk yardım, yakınma ve konu dışı sorular mevcut kurallara kalır', async () => {
    for (const q of ['parmağım kanıyor yardım et', 'uyuyamıyorum', 'nabzım yüksek ne yapmalıyım', 'Marsa ne zaman varırız?', 'merhaba']) {
      expect(await routeQuestion(q, setup()), q).toBeNull()
    }
  })

  it('hiçbir kural cevap bulamazsa dürüst olur ve öneri düğmeleri sunar', () => {
    for (const lang of ['tr', 'en'] as const) {
      const r = fallbackReply(lang)
      expect(r.actions.length).toBeGreaterThanOrEqual(3)
      expect(r.actions.every((a) => a.kind === 'ask' && a.question)).toBe(true)
    }
    expect(fallbackReply('en').text).not.toMatch(TR_LETTERS)
  })
})

describe('Sağlık Asistanı: veri soruları', () => {
  it('son kan tahlilini referans aralıklarıyla verir ve örneği açar', async () => {
    const r = await routeQuestion('kan tahlilimi görmek istiyorum', setup())
    expect(r?.text).toMatch(/referans aralığında/)
    expect(r?.mode).toBe('medical')
    expect(types(r)).toEqual(expect.arrayContaining(['openLabs']))
    expect(r?.sources?.length).toBeGreaterThan(0)
  })

  it('görev gününe göre doğru kan örneğini seçer', async () => {
    const r = await routeQuestion('90. gündeki kan tahlilim', setup())
    expect(r?.text).toContain(tr.doctor.draw(90))
    expect(commands(r)[0]).toMatchObject({ type: 'openLabs', day: 90, view: 'single' })
  })

  it('takvim tarihine göre doğru kan örneğini seçer', async () => {
    const ctx = setup()
    const draw = (await ctx.data.labs())!.find((d) => d.day === 60)!
    const date = new Date(draw.ts)
    const months = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık']
    const r = await routeQuestion(`${date.getUTCDate()} ${months[date.getUTCMonth()]} tarihindeki kan tahlilimi göster`, ctx)
    expect(commands(r)[0]).toMatchObject({ type: 'openLabs', day: 60 })
    expect(r?.text).not.toMatch(/alınmamış/)
  })

  it('o gün örnek alınmadıysa söyler ve en yakın önceki örneği gösterir', async () => {
    const r = await routeQuestion('70. gündeki kan tahlilim', setup())
    expect(r?.text).toMatch(/örnek alınmamış/)
    expect(commands(r)[0]).toMatchObject({ type: 'openLabs', day: 60 })
  })

  it('tek bir tahlili sorunca yalnızca onu, birimi ve aralığıyla verir', async () => {
    const r = await routeQuestion('hemoglobin değerim', setup())
    expect(r?.text).toMatch(/Hemoglobin: [\d,]+ g\/dL \(referans/)
    const e = await routeQuestion('what was my hemoglobin before flight', setup('en'))
    expect(e?.text).toMatch(/Hemoglobin: [\d.]+ g\/dL \(reference/)
    expect(e?.text).toContain(en.doctor.draw(-30).toLowerCase())
  })

  it('NASA kan verisini sorunca NASA sekmesini açar', async () => {
    const r = await routeQuestion('NASA kan tahlili verisi', setup())
    expect(commands(r)[0]).toEqual({ type: 'openLabs', view: 'nasa' })
  })

  it('göstergenin şu anki değerini ve belirli bir günün istatistiğini verir', async () => {
    const now = await routeQuestion('nabzım kaç', setup())
    expect(now?.text).toMatch(/Nabız: şu an \d+ atım\/dk/)
    const y = await routeQuestion('dünkü nabzım', setup())
    expect(y?.text).toMatch(/Ortalama \d+/)
    expect(commands(y)[0]).toEqual({ type: 'openExplorer', id: 'hr' })
    const week = await routeQuestion('bu haftaki uykum', setup())
    expect(week?.text).toMatch(/uyku/i)
    const e = await routeQuestion('how did I sleep last week', setup('en'))
    expect(e?.text).toMatch(/Average/)
  })

  it('su, radyasyon, görev günü ve genel durumu cevaplar', async () => {
    const ctx = setup()
    expect((await routeQuestion('bugün ne kadar su içtim', ctx))?.actions.some((a) => a.kind === 'addWater')).toBe(true)
    expect((await routeQuestion('radyasyon dozum', ctx))?.text).toMatch(/mSv/)
    expect((await routeQuestion('görevin kaçıncı günündeyiz', ctx))?.text).toContain(`${ctx.snapshot!.missionDay}. günü`)
    expect((await routeQuestion('genel durumum nasıl', ctx))?.text).toMatch(/Genel durumun/)
  })

  it("check-in durumunu bugünün pencereleriyle anlatır", async () => {
    const r = await routeQuestion("bugün check-in yaptım mı", setup())
    expect(r?.text).toMatch(/görev saati/)
    expect(types(r)).toContain('openRecords')
  })

  it('bugünkü programı listeler ve sıradaki hareketi hologramda gösterir', async () => {
    const r = await routeQuestion('bugünkü programım', setup())
    expect(r?.mode).toBe('coach')
    expect(types(r)).toContain('showExercise')
    const sq = await routeQuestion('squat nasıl yapılır', setup())
    expect(commands(sq)[0]).toEqual({ type: 'showExercise', exercise: 'aredSquat' })
  })

  it('İngilizce cevaplarda Türkçe metin kalmaz', async () => {
    const ctx = setup('en')
    const qs = ['I want to create a complaint', 'my latest blood test', 'my heart rate yesterday', 'my complaints', "today's program", 'how am I doing overall', 'what can you do', 'how do I check in', 'open the cupola', 'how do I import data', 'my radiation dose', 'calendar', 'emergency']
    for (const q of qs) {
      const r = await routeQuestion(q, ctx)
      expect(r, q).not.toBeNull()
      expect(r!.text, q).not.toMatch(TR_LETTERS)
      for (const a of r!.actions) expect(a.label, q).not.toMatch(TR_LETTERS)
    }
  })
})

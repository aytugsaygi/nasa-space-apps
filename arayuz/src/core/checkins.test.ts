// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { CHECKIN_CONFIG, countWords, normalizeSubmission, parseWindowKey, validateCheckinConfig, windowAt, windowFor, windowsForDate, type CheckinConfig, type CheckinDoc } from './checkins'
import { MISSION } from './crew'
import { Engine } from './engine'
import { MemoryStore, type Collection, type Doc } from './store'
import { addDays, civilDate, parseCivilDate, zonedTimeToUtc } from './zonedTime'

/*
 * İyi oluş check-in'leri (docs/wellbeing/revision-spec.md, WB-T-01, WB-T-02, WB-T-14).
 * Saat her testte sabittir (enjekte edilen saat); cihazın saat dilimi sonucu etkilemez.
 */

const utc = (y: number, mo: number, d: number, h: number, mi = 0, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms)
const MIN = 60_000
/** n kelimelik not */
const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ')
const HOUR = 60 * MIN

/** Yaz saati uygulayan bir görev saat dilimi (NASA Johnson Uzay Merkezi, Houston) */
const CHICAGO: CheckinConfig = { ...CHECKIN_CONFIG, timeZone: 'America/Chicago' }
const ISTANBUL: CheckinConfig = { ...CHECKIN_CONFIG, timeZone: 'Europe/Istanbul' }

function setup(t = utc(2026, 11, 12, 9), config?: CheckinConfig, store = new MemoryStore()) {
  let now = t
  const engine = new Engine(store, () => now, { checkinConfig: config })
  return { engine, store, set: (v: number) => (now = v), advance: (ms: number) => (now += ms) }
}

describe('görev saat dilimi yardımcıları', () => {
  it('takvim tarihini sayılarla işler, var olmayan tarihi reddeder', () => {
    expect(parseCivilDate('2026-11-12')).toEqual({ year: 2026, month: 11, day: 12 })
    expect(parseCivilDate('2026-02-30')).toBeNull()
    expect(parseCivilDate('12.11.2026')).toBeNull()
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('yerel saati saat dilimine göre UTC ana çevirir', () => {
    expect(zonedTimeToUtc('2026-11-12', 8 * 60, 'UTC')).toBe(utc(2026, 11, 12, 8))
    expect(zonedTimeToUtc('2026-11-12', 8 * 60, 'Europe/Istanbul')).toBe(utc(2026, 11, 12, 5))
    expect(civilDate(utc(2026, 11, 12, 22), 'Europe/Istanbul')).toBe('2026-11-13')
  })
})

describe('check-in yapılandırması', () => {
  it('varsayılan yapılandırma geçerli ve görev saat dilimini kullanır', () => {
    expect(() => validateCheckinConfig(CHECKIN_CONFIG)).not.toThrow()
    expect(CHECKIN_CONFIG.timeZone).toBe(MISSION.timeZone)
    expect(CHECKIN_CONFIG.windows.map((w) => w.startMinute)).toEqual([480, 780, 1200])
    expect(CHECKIN_CONFIG.questions).toHaveLength(6)
  })

  it('hatalı yapılandırmayı açılışta reddeder', () => {
    expect(() => validateCheckinConfig({ ...CHECKIN_CONFIG, timeZone: 'Mars/Olympus' })).toThrow()
    expect(() => validateCheckinConfig({ ...CHECKIN_CONFIG, windows: [{ id: 'b', startMinute: 600 }, { id: 'a', startMinute: 480 }] })).toThrow()
    expect(() => validateCheckinConfig({ ...CHECKIN_CONFIG, windows: [] })).toThrow()
    expect(() => new Engine(new MemoryStore(), () => 0, { checkinConfig: { ...CHECKIN_CONFIG, timeZone: 'yok' } })).toThrow()
  })

  it('saat değiştirmek yalnızca yapılandırmayla olur', () => {
    const c: CheckinConfig = { ...CHECKIN_CONFIG, windows: [{ id: 'morning', startMinute: 7 * 60 }, { id: 'evening', startMinute: 19 * 60 }] }
    expect(windowAt(utc(2026, 11, 12, 7), c)).toMatchObject({ window: 'morning', closesAt: utc(2026, 11, 12, 19) })
    expect(windowAt(utc(2026, 11, 13, 6, 59), c)).toMatchObject({ window: 'evening', date: '2026-11-12' })
  })
})

describe('check-in pencereleri (CI-01, CI-04)', () => {
  it('08:00, 13:00 ve 20:00 sınırlarında tam olarak değişir', () => {
    const at = (h: number, mi = 0, s = 0, ms = 0) => windowAt(utc(2026, 11, 12, h, mi, s, ms))
    expect(at(8)).toMatchObject({ key: '2026-11-12:morning', opensAt: utc(2026, 11, 12, 8), closesAt: utc(2026, 11, 12, 13) })
    expect(at(7, 59, 59, 999)).toMatchObject({ key: '2026-11-11:evening' })
    expect(at(13)).toMatchObject({ key: '2026-11-12:midday', opensAt: utc(2026, 11, 12, 13), closesAt: utc(2026, 11, 12, 20) })
    expect(at(12, 59, 59, 999)).toMatchObject({ key: '2026-11-12:morning' })
    expect(at(20)).toMatchObject({ key: '2026-11-12:evening', opensAt: utc(2026, 11, 12, 20), closesAt: utc(2026, 11, 13, 8) })
    expect(at(19, 59, 59, 999)).toMatchObject({ key: '2026-11-12:midday' })
  })

  it('gece yarısından sonra akşam penceresi açıldığı tarihe aittir', () => {
    const w = windowAt(utc(2026, 11, 13, 0, 30))
    expect(w).toMatchObject({ date: '2026-11-12', window: 'evening', closesAt: utc(2026, 11, 13, 8) })
    // Ay ve yıl sınırında da
    expect(windowAt(utc(2027, 1, 1, 3))).toMatchObject({ key: '2026-12-31:evening' })
  })

  it('bir tarihin pencereleri boşluksuz ve çakışmasız birbirini izler', () => {
    const [m, d, e] = windowsForDate('2026-11-12')
    expect(m.closesAt).toBe(d.opensAt)
    expect(d.closesAt).toBe(e.opensAt)
    expect(e.closesAt).toBe(windowsForDate('2026-11-13')[0].opensAt)
  })

  it('pencere kimliğini doğrular', () => {
    expect(parseWindowKey('2026-11-12:evening')).toEqual({ date: '2026-11-12', window: 'evening' })
    expect(parseWindowKey('2026-02-30:morning')).toBeNull()
    expect(parseWindowKey('bozuk')).toBeNull()
    expect(windowFor('2026-11-12', 'night')).toBeNull()
  })
})

describe('saat dilimi', () => {
  const saved = process.env.TZ
  afterEach(() => {
    if (saved === undefined) delete process.env.TZ
    else process.env.TZ = saved
  })

  it('cihazın saat dilimi görev saat dilimini değiştirmez', () => {
    const t = utc(2026, 11, 12, 19, 30)
    const results = ['Pacific/Kiritimati', 'America/Los_Angeles', 'Asia/Tokyo'].map((tz) => {
      process.env.TZ = tz
      return { local: new Date(t).getHours(), w: windowAt(t), ist: windowAt(t, ISTANBUL) }
    })
    // Cihaz saati gerçekten farklı: ama pencere aynı
    expect(new Set(results.map((r) => r.local)).size).toBe(3)
    for (const r of results) {
      expect(r.w.key).toBe('2026-11-12:midday')
      // İstanbul'da (UTC+3) 22:30: akşam penceresi
      expect(r.ist.key).toBe('2026-11-12:evening')
    }
  })

  it('görev saat dilimi UTC iken yaz saati yoktur: pencere süreleri yıl boyunca aynı', () => {
    for (const date of ['2026-03-07', '2026-03-28', '2026-10-24', '2026-10-31']) {
      expect(windowsForDate(date).map((w) => (w.closesAt - w.opensAt) / HOUR)).toEqual([5, 7, 12])
    }
  })

  it('yaz saati uygulayan saat diliminde pencereler yerel saate göre kalır', () => {
    // 8 Mart 2026, 02:00'de saat ileri alınır (CST UTC-6 → CDT UTC-5): akşam penceresi 11 saat sürer
    const spring = windowFor('2026-03-07', 'evening', CHICAGO)!
    expect(spring.opensAt).toBe(utc(2026, 3, 8, 2))
    expect(spring.closesAt).toBe(utc(2026, 3, 8, 13))
    expect((spring.closesAt - spring.opensAt) / HOUR).toBe(11)
    expect(windowAt(utc(2026, 3, 8, 12, 59), CHICAGO).key).toBe('2026-03-07:evening')
    expect(windowAt(utc(2026, 3, 8, 13), CHICAGO).key).toBe('2026-03-08:morning')
    // 1 Kasım 2026, 02:00'de saat geri alınır (CDT → CST): akşam penceresi 13 saat sürer
    const fall = windowFor('2026-10-31', 'evening', CHICAGO)!
    expect(fall.opensAt).toBe(utc(2026, 11, 1, 1))
    expect(fall.closesAt).toBe(utc(2026, 11, 1, 14))
    expect((fall.closesAt - fall.opensAt) / HOUR).toBe(13)
    // Geri alınan saatin iki kez yaşanan 01:30'u da aynı pencerededir
    expect(windowAt(utc(2026, 11, 1, 6, 30), CHICAGO).key).toBe('2026-10-31:evening')
    expect(windowAt(utc(2026, 11, 1, 7, 30), CHICAGO).key).toBe('2026-10-31:evening')
  })
})

describe('not kelime sayımı (CI-10)', () => {
  it('boşluklarla ayrılan ve harf ya da rakam içeren parçaları sayar', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t ')).toBe(0)
    expect(countWords('Bugün iyiyim')).toBe(2)
    expect(countWords('  baş   ağrısı\nvar  ')).toBe(3)
    // Tire ve kesme işaretiyle bağlı sözcükler tek kelimedir; sayılar kelimedir
    expect(countWords("iyi-kötü Dünya'nın 3 gün")).toBe(4)
    // Yalnızca noktalama ya da simgeden oluşan parçalar sayılmaz
    expect(countWords('evet — hayır ... !')).toBe(2)
    expect(countWords('İngilizce: well-being, tired.')).toBe(3)
  })

  it('100 kelime kabul edilir, 101 kelime reddedilir; metin kısaltılmaz', () => {
    expect(normalizeSubmission({}, words(100))).toMatchObject({ ok: true, note: words(100) })
    expect(normalizeSubmission({}, words(101))).toEqual({ ok: false, error: 'noteTooLong' })
    // Taslakta sınırı aşan not tamamen korunur
    expect(normalizeSubmission({}, ` ${words(130)} `, CHECKIN_CONFIG, 'draft')).toMatchObject({ ok: true, note: ` ${words(130)} ` })
  })
})

describe('cevap denetimi (CI-09, CI-10)', () => {
  it('sorular bağımsızdır (ekip uyumu ve görme dahil altı soru); "emin değilim" bir cevaptır, boş bırakılan soru cevapsızdır', () => {
    expect(CHECKIN_CONFIG.questions.map((q) => q.id)).toEqual(['physical', 'mood', 'pressure', 'energy', 'team', 'vision'])
    for (const q of CHECKIN_CONFIG.questions) expect(q.options.at(-1)).toBe('notSure')
    const r = normalizeSubmission({ physical: 'notSure' }, '')
    expect(r).toMatchObject({ ok: true, answered: 1, omitted: ['mood', 'pressure', 'energy', 'team', 'vision'], answers: { physical: 'notSure', mood: null } })
    // Seçenekler başka soruya ait olamaz
    expect(normalizeSubmission({ mood: 'calm' }, '')).toEqual({ ok: false, error: 'invalid' })
  })

  it('eksik sorular boş bırakılmış sayılır, bilinmeyen soru ve seçenek reddedilir', () => {
    const r = normalizeSubmission({ mood: 'good' }, '  not  ')
    expect(r).toEqual({ ok: true, answers: { physical: null, mood: 'good', pressure: null, energy: null, team: null, vision: null }, note: 'not', answered: 1, omitted: ['physical', 'pressure', 'energy', 'team', 'vision'] })
    expect(normalizeSubmission({ sleep: 3 }, '')).toEqual({ ok: false, error: 'invalid' })
    expect(normalizeSubmission({ mood: 7 }, '')).toEqual({ ok: false, error: 'invalid' })
    expect(normalizeSubmission({ mood: '3' }, '')).toEqual({ ok: false, error: 'invalid' })
    expect(normalizeSubmission([3], '')).toEqual({ ok: false, error: 'invalid' })
    expect(normalizeSubmission({}, words(101))).toEqual({ ok: false, error: 'noteTooLong' })
    expect(normalizeSubmission({}, 'x'.repeat(4001))).toEqual({ ok: false, error: 'noteTooLong' })
  })

  it('boş gönderim kaydedilmez, taslakta serbesttir', () => {
    expect(normalizeSubmission({}, '   ')).toEqual({ ok: false, error: 'empty' })
    expect(normalizeSubmission({ mood: null }, undefined)).toEqual({ ok: false, error: 'empty' })
    expect(normalizeSubmission({}, '', CHECKIN_CONFIG, 'draft').ok).toBe(true)
  })
})

describe('check-in durumları (CI-02…CI-08)', () => {
  const MORNING = '2026-11-12:morning'

  it('açık pencere pending; otomatik soru bir kez gösterilir', () => {
    const { engine } = setup()
    const v = engine.currentCheckin('yildiz')
    expect(v).toMatchObject({ key: MORNING, outcome: 'pending', autoPrompt: true, acceptsSubmission: true })
    expect(engine.markCheckinPrompted('yildiz', MORNING).view).toMatchObject({ outcome: 'pending', autoPrompt: false })
    // Gösterim sonucu değiştirmez ve kayıt oluşturmaz
    expect(engine.store.list('checkins')).toHaveLength(0)
  })

  it('kapat düğmesi deferred yapar; check-in hâlâ yapılabilir ve otomatik soru tekrar gelmez', () => {
    const { engine } = setup()
    const r = engine.deferCheckin('yildiz', MORNING)
    expect(r.ok && r.view).toMatchObject({ outcome: 'deferred', acceptsSubmission: true, autoPrompt: false })
    expect(engine.store.list('checkins')).toHaveLength(0)
    expect(engine.submitCheckin('yildiz', MORNING, { mood: 'okay' }, '').ok).toBe(true)
    expect(engine.checkinWindow('yildiz', MORNING)?.outcome).toBe('saved')
  })

  it('kısmi cevap ve not kaydedilir; kısmi cevap bilgisi ve gerçek gönderim anı tutulur', () => {
    const { engine, advance } = setup()
    advance(17 * MIN)
    const r = engine.submitCheckin('yildiz', MORNING, { mood: 'low', energy: 'energized' }, 'Az uyudum')
    expect(r.ok).toBe(true)
    const rec = engine.checkinWindow('yildiz', MORNING)!.record!
    expect(rec).toMatchObject({ outcome: 'saved', date: '2026-11-12', window: 'morning', answered: 2, omitted: ['physical', 'pressure', 'team', 'vision'], note: 'Az uyudum', late: false, revision: 1 })
    expect(rec.answers).toEqual({ physical: null, mood: 'low', pressure: null, energy: 'energized', team: null, vision: null })
    expect(rec.submittedAt).toBe(utc(2026, 11, 12, 9, 17))
  })

  it('boş gönderim kaydedilmiş sayılmaz', () => {
    const { engine } = setup()
    expect(engine.submitCheckin('yildiz', MORNING, {}, '   ')).toMatchObject({ ok: false, error: 'empty' })
    expect(engine.submitCheckin('yildiz', MORNING, { mood: null, pressure: null }, '')).toMatchObject({ ok: false, error: 'empty' })
    expect(engine.checkinWindow('yildiz', MORNING)?.outcome).toBe('pending')
    expect(engine.store.list('checkins')).toHaveLength(0)
  })

  it('aynı pencerede ikinci gönderim yeni kayıt açmaz, kaydı günceller', () => {
    const { engine, advance } = setup()
    engine.submitCheckin('yildiz', MORNING, { mood: 'low' }, '')
    advance(5 * MIN)
    engine.submitCheckin('yildiz', MORNING, { mood: 'good', pressure: 'calm' }, 'düzelttim')
    const all = engine.store.list<CheckinDoc>('checkins', 'yildiz')
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ revision: 2, answers: { mood: 'good', pressure: 'calm' }, note: 'düzelttim', submittedAt: utc(2026, 11, 12, 9, 5) })
  })

  it('atlama bilerek yapılır; kaydedilmiş check-in atlanamaz, atlanan pencere açıkken kaydedilebilir', () => {
    const { engine } = setup()
    expect(engine.skipCheckin('yildiz', MORNING).ok).toBe(true)
    expect(engine.skipCheckin('yildiz', MORNING).ok).toBe(true)
    expect(engine.store.list('checkins')).toHaveLength(1)
    expect(engine.checkinWindow('yildiz', MORNING)).toMatchObject({ outcome: 'skipped', acceptsSubmission: true })
    expect(engine.submitCheckin('yildiz', MORNING, { mood: 'okay' }, '').ok).toBe(true)
    expect(engine.checkinWindow('yildiz', MORNING)?.record).toMatchObject({ outcome: 'saved', revision: 2 })
    expect(engine.skipCheckin('yildiz', MORNING)).toMatchObject({ ok: false, error: 'alreadySaved' })
    expect(engine.store.list('checkins')).toHaveLength(1)
  })

  it('pencere sonuçsuz kapanınca expired olur; bu atlama olarak kaydedilmez', () => {
    const { engine, set } = setup()
    engine.markCheckinPrompted('yildiz', MORNING)
    engine.deferCheckin('yildiz', MORNING)
    set(utc(2026, 11, 12, 13))
    expect(engine.checkinWindow('yildiz', MORNING)).toMatchObject({ outcome: 'expired', acceptsSubmission: false, record: null })
    expect(engine.store.list('checkins')).toHaveLength(0)
    expect(engine.submitCheckin('yildiz', MORNING, { mood: 'okay' }, '')).toMatchObject({ ok: false, error: 'expired' })
    expect(engine.skipCheckin('yildiz', MORNING)).toMatchObject({ ok: false, error: 'expired' })
    expect(engine.store.list<CheckinDoc>('checkins').some((d) => d.outcome === 'skipped')).toBe(false)
  })

  it('kapanmadan açılmış form, pencere kapandıktan sonra süre içinde gönderilebilir (geç gönderim)', () => {
    const { engine, set } = setup(utc(2026, 11, 12, 12, 50))
    engine.openCheckin('yildiz', MORNING)
    set(utc(2026, 11, 12, 13, 30))
    expect(engine.checkinWindow('yildiz', MORNING)).toMatchObject({ outcome: 'expired', acceptsSubmission: true, lateUntil: utc(2026, 11, 12, 15) })
    const r = engine.submitCheckin('yildiz', MORNING, { mood: 'good' }, '')
    expect(r.ok).toBe(true)
    // Kayıt açıldığı pencereye ve tarihe aittir, şu an açık olan öğle penceresine değil
    expect(engine.checkinWindow('yildiz', MORNING)?.record).toMatchObject({ outcome: 'saved', late: true, window: 'morning', date: '2026-11-12', submittedAt: utc(2026, 11, 12, 13, 30) })
    expect(engine.currentCheckin('yildiz')).toMatchObject({ window: 'midday', outcome: 'pending' })
  })

  it('geç gönderim süresi dolunca ya da form pencere kapandıktan sonra açılınca kabul edilmez', () => {
    const late = setup(utc(2026, 11, 12, 12, 50))
    late.engine.openCheckin('yildiz', MORNING)
    late.set(utc(2026, 11, 12, 15))
    expect(late.engine.submitCheckin('yildiz', MORNING, { mood: 'good' }, '')).toMatchObject({ ok: false, error: 'expired' })
    const after = setup(utc(2026, 11, 12, 13, 5))
    expect(after.engine.openCheckin('yildiz', MORNING)).toMatchObject({ ok: false, error: 'expired' })
    expect(after.engine.submitCheckin('yildiz', MORNING, { mood: 'good' }, '')).toMatchObject({ ok: false, error: 'expired' })
  })

  it('gece yarısından sonra gönderilen akşam check-in\'i önceki tarihe yazılır', () => {
    const { engine } = setup(utc(2026, 11, 13, 1, 30))
    const cur = engine.currentCheckin('yildiz')
    expect(cur.key).toBe('2026-11-12:evening')
    engine.submitCheckin('yildiz', cur.key, { physical: 'comfortable' }, '')
    expect(engine.store.list<CheckinDoc>('checkins')[0]).toMatchObject({ id: 'ck:yildiz:2026-11-12:evening', date: '2026-11-12', window: 'evening' })
  })

  it('günün üç penceresi: açılmamış pencere upcoming, gönderim kabul etmez', () => {
    const { engine, set } = setup(utc(2026, 11, 12, 14))
    expect(engine.checkinDay('yildiz').map((v) => `${v.window}:${v.outcome}:${v.acceptsSubmission}`)).toEqual(['morning:expired:false', 'midday:pending:true', 'evening:upcoming:false'])
    // Gece yarısından sonra hâlâ önceki günün pencereleri gösterilir (akşam penceresi açık)
    set(utc(2026, 11, 13, 2))
    expect(engine.checkinDay('yildiz').map((v) => v.key)).toEqual(['2026-11-12:morning', '2026-11-12:midday', '2026-11-12:evening'])
    expect(engine.checkinDay('yildiz')[2].outcome).toBe('pending')
  })

  it('henüz açılmamış ya da tanımsız pencere reddedilir', () => {
    const { engine } = setup()
    expect(engine.submitCheckin('yildiz', '2026-11-12:evening', { mood: 'okay' }, '')).toMatchObject({ ok: false, error: 'notOpen' })
    expect(engine.submitCheckin('yildiz', '2026-11-12:night', { mood: 'okay' }, '')).toMatchObject({ ok: false, error: 'unknownWindow' })
    expect(engine.submitCheckin('yildiz', 'bozuk', { mood: 'okay' }, '')).toMatchObject({ ok: false, error: 'unknownWindow' })
    expect(engine.submitCheckin('yildiz', MORNING, { mood: 9 }, '')).toMatchObject({ ok: false, error: 'invalid' })
    expect(engine.submitCheckin('yildiz', MORNING, { mood: 'okay' }, words(101))).toMatchObject({ ok: false, error: 'noteTooLong' })
  })

  it('taslak kesinleşmez; gönderim sonrası temizlenir', () => {
    const { engine } = setup()
    expect(engine.saveCheckinDraft('yildiz', MORNING, {}, '').ok).toBe(true)
    engine.saveCheckinDraft('yildiz', MORNING, { pressure: 'somePressure' }, 'yarım')
    expect(engine.checkinWindow('yildiz', MORNING)).toMatchObject({ outcome: 'pending', draft: { answers: { pressure: 'somePressure' }, note: 'yarım' } })
    expect(engine.store.list('checkins')).toHaveLength(0)
    engine.submitCheckin('yildiz', MORNING, { pressure: 'somePressure' }, 'yarım')
    expect(engine.checkinWindow('yildiz', MORNING)?.draft).toBeNull()
  })

  it('check-in notu günlükten ayrı bir kayıttır', () => {
    const { engine } = setup()
    engine.submitCheckin('yildiz', MORNING, {}, 'yalnızca not')
    expect(engine.journal('yildiz')).toHaveLength(0)
    engine.addJournal('yildiz', 'günlük')
    expect(engine.store.list('checkins')).toHaveLength(1)
    expect(engine.checkinWindow('yildiz', MORNING)?.record?.note).toBe('yalnızca not')
  })

  it('cevaplar ölçüm, uyarı ya da görev üretmez (CI-02)', () => {
    const { engine } = setup()
    const before = engine.snapshot('yildiz').findings.map((f) => f.key)
    engine.submitCheckin('yildiz', MORNING, { mood: 'veryLow', pressure: 'struggling', energy: 'veryTired', physical: 'significantDiscomfort' }, '')
    expect(engine.store.list('measurements')).toHaveLength(0)
    expect(engine.store.list('moods')).toHaveLength(0)
    expect(engine.snapshot('yildiz').findings.map((f) => f.key)).toEqual(before)
  })
})

describe('check-in kayıtları', () => {
  it('her astronotun kaydı ayrıdır (kullanıcı değişimi)', () => {
    const { engine } = setup()
    const key = engine.currentCheckin('yildiz').key
    engine.submitCheckin('yildiz', key, { mood: 'notSure' }, 'Yıldız')
    engine.deferCheckin('mori', key)
    expect(engine.checkinWindow('mori', key)).toMatchObject({ outcome: 'deferred', record: null })
    expect(engine.checkinWindow('yildiz', key)).toMatchObject({ outcome: 'saved' })
    expect(engine.checkinWindow('okafor', key)).toMatchObject({ outcome: 'pending', autoPrompt: true })
    engine.submitCheckin('mori', key, { mood: 'low' }, '')
    expect(engine.store.list<CheckinDoc>('checkins', 'yildiz').map((d) => d.answers.mood)).toEqual(['notSure'])
    expect(engine.store.list<CheckinDoc>('checkins', 'mori').map((d) => d.answers.mood)).toEqual(['low'])
  })

  it('kayıt yeniden yüklemede korunur', () => {
    const first = setup()
    const key = first.engine.currentCheckin('yildiz').key
    first.engine.markCheckinPrompted('yildiz', key)
    first.engine.submitCheckin('yildiz', key, { energy: 'tired' }, 'kalıcı')
    const reloaded = new MemoryStore()
    reloaded.load(JSON.parse(JSON.stringify(first.store.dump())) as Record<string, Doc[]>)
    const again = setup(utc(2026, 11, 12, 9, 30), undefined, reloaded)
    expect(again.engine.checkinWindow('yildiz', key)).toMatchObject({ outcome: 'saved', record: { note: 'kalıcı' }, autoPrompt: false })
  })

  it('kalıcı yazma başarısız olursa check-in kesinleşmez, taslak korunur ve yeniden denenebilir', () => {
    let failing = true
    class FlakyStore extends MemoryStore {
      flush() {
        if (failing) throw new Error('depolama dolu')
      }
    }
    const { engine } = setup(utc(2026, 11, 12, 9), undefined, new FlakyStore())
    const key = engine.currentCheckin('yildiz').key
    engine.saveCheckinDraft('yildiz', key, { mood: 'okay' }, 'taslak')
    expect(engine.submitCheckin('yildiz', key, { mood: 'okay' }, 'taslak')).toMatchObject({ ok: false, error: 'storage', view: { outcome: 'pending' } })
    expect(engine.skipCheckin('yildiz', key)).toMatchObject({ ok: false, error: 'storage' })
    expect(engine.store.list('checkins')).toHaveLength(0)
    expect(engine.checkinWindow('yildiz', key)?.draft).toMatchObject({ note: 'taslak' })
    failing = false
    expect(engine.submitCheckin('yildiz', key, { mood: 'okay' }, 'taslak').ok).toBe(true)
    // Düzeltme sırasında yazma başarısız olursa önceki kayıt yerinde kalır
    failing = true
    expect(engine.submitCheckin('yildiz', key, { mood: 'veryLow' }, 'değişti').ok).toBe(false)
    expect(engine.checkinWindow('yildiz', key)?.record).toMatchObject({ answers: { mood: 'okay' }, note: 'taslak', revision: 1 })
  })

  it('geçmiş yalnızca açılmış pencereleri, en yeni önce listeler', () => {
    const { engine, set } = setup(utc(2026, 11, 12, 9))
    engine.submitCheckin('yildiz', '2026-11-12:morning', { mood: 'good' }, '')
    set(utc(2026, 11, 12, 15))
    const list = engine.wellbeingCheckins('yildiz', 2)
    expect(list.map((v) => `${v.key}:${v.outcome}`)).toEqual([
      '2026-11-12:midday:pending',
      '2026-11-12:morning:saved',
      '2026-11-11:evening:expired',
      '2026-11-11:midday:expired',
      '2026-11-11:morning:expired',
    ])
  })

  it('demo sıfırlaması check-in kayıtlarını da temizler', () => {
    const { engine } = setup()
    const key = engine.currentCheckin('yildiz').key
    engine.markCheckinPrompted('yildiz', key)
    engine.submitCheckin('yildiz', key, { mood: 'good' }, '')
    engine.resetDemo()
    expect(engine.store.list('checkins')).toHaveLength(0)
    expect(engine.store.list('checkinMeta')).toHaveLength(0)
  })

  it('check-in koleksiyonları olmayan eski kayıt olduğu gibi açılır (göç gerekmez)', () => {
    const old: Partial<Record<Collection, Doc[]>> = {
      journal: [{ id: 'j1', astronaut: 'yildiz', ts: utc(2026, 11, 1, 10), text: 'eski not', private: true } as Doc],
      moods: [{ id: 'mo1', astronaut: 'yildiz', ts: utc(2026, 11, 1, 20), value: 4, tags: [] } as Doc],
      meta: [{ id: 'seed', astronaut: '*', ts: 0 }],
    }
    const store = new MemoryStore()
    store.load(old as Record<string, Doc[]>)
    const { engine } = setup(utc(2026, 11, 12, 9), undefined, store)
    expect(engine.journal('yildiz').map((j) => j.text)).toEqual(['eski not'])
    expect(engine.moods('yildiz')).toHaveLength(1)
    expect(engine.submitCheckin('yildiz', engine.currentCheckin('yildiz').key, { mood: 'okay' }, '').ok).toBe(true)
    expect(engine.journal('yildiz')).toHaveLength(1)
  })

  it('başka saat dilimli yapılandırmada kayıt yerel tarihe yazılır', () => {
    // İstanbul 01:30 (UTC 22:30): akşam penceresi, 12 Kasım
    const { engine } = setup(utc(2026, 11, 12, 22, 30), ISTANBUL)
    const cur = engine.currentCheckin('yildiz')
    expect(cur.key).toBe('2026-11-12:evening')
    expect(cur.closesAt).toBe(zonedTimeToUtc(addDays('2026-11-12', 1), 8 * 60, 'Europe/Istanbul'))
  })
})

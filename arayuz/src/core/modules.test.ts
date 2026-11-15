import { describe, expect, it } from 'vitest'
import { DAY, HOUR, MISSION } from './crew'
import { Engine } from './engine'
import { convert, importData } from './importer'
import { ANALYTES, DRAW_DAYS, labDraws } from './labs'
import { MemoryStore } from './store'

/** Sabit bir an: görevin 142. günü, saat 15:00 (GMT) */
const NOW = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 15 * HOUR

describe('kan tahlilleri', () => {
  it('yalnızca geçmiş örnek günleri döner; her örnekte 12 test vardır', () => {
    const draws = labDraws('yildiz', NOW)
    expect(draws.map((d) => d.day)).toEqual(DRAW_DAYS.filter((d) => d <= 142))
    for (const d of draws) expect(d.results).toHaveLength(ANALYTES.length)
  })

  it('son örnek dondurucuda analiz bekler, öncekilerin sonucu gelmiştir', () => {
    const draws = labDraws('yildiz', NOW)
    expect(draws.at(-1)!.day).toBe(120)
    expect(draws.at(-1)!.analyzed).toBe(false)
    expect(draws.slice(0, -1).every((d) => d.analyzed)).toBe(true)
  })

  it('aynı an için sonuç her seferinde aynıdır (simülasyon belirlenimci)', () => {
    expect(labDraws('lindqvist', NOW)).toEqual(labDraws('lindqvist', NOW))
  })

  it('Mori\'nin karaciğer enzimleri 90. günden sonra yüksek işaretlenir', () => {
    const late = labDraws('mori', NOW).filter((d) => d.day >= 90)
    for (const d of late) {
      expect(d.results.find((r) => r.key === 'ALT')!.flag).toBe('high')
      expect(d.results.find((r) => r.key === 'AST')!.flag).toBe('high')
    }
  })

  it('cinsiyete göre OSDR aralığı kullanılır', () => {
    // Lindqvist kadın, Okafor erkek: hemoglobin bayrağı kendi aralığına göre verilir
    for (const id of ['lindqvist', 'okafor'] as const) {
      const hb = labDraws(id, NOW)[0].results.find((r) => r.key === 'HEMOGLOBIN')!
      const a = ANALYTES.find((x) => x.key === 'HEMOGLOBIN')!
      const [lo, hi] = id === 'lindqvist' ? a.range.f : a.range.m
      expect(hb.flag).toBe(hb.value < lo ? 'low' : hb.value > hi ? 'high' : 'normal')
    }
  })
})

describe('veri içe aktarma', () => {
  it('birimleri katalog birimine çevirir', () => {
    expect(convert('temp', 98.6, 'F')).toBeCloseTo(37, 5)
    expect(convert('glucose', 5, 'mmol/L')).toBe(90)
    expect(convert('sleep', 420, 'min')).toBe(7)
    expect(convert('hr', 72)).toBe(72)
  })

  it('CSV satırlarını içe aktarır; geçersiz satırları atlar; seri bu aralıkta simülasyonun yerine geçer', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const t0 = NOW - 6 * HOUR
    const csv = ['time;bpm', ...[0, 1, 2, 3].map((i) => `${new Date(t0 + i * HOUR).toISOString()};${60 + i}`), 'bozuk;satir', `${new Date(t0 + 5 * HOUR).toISOString()};9999`].join('\n')
    const r = importData(engine, { astronaut: 'yildiz', indicator: 'hr', format: 'csv', text: csv, timeColumn: 'time', valueColumn: 'bpm', dataset: 'NASA test' })
    expect(r).toEqual({ ok: true, imported: 4, skipped: 2, error: undefined })

    const { points } = engine.series('yildiz', 'hr', t0, t0 + 3 * HOUR)
    expect(points.map((p) => p.v)).toEqual([60, 61, 62, 63])
    expect(points.every((p) => p.source === 'import:NASA test')).toBe(true)
  })

  it('JSON dosyasında °F ısıyı °C olarak kaydeder', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const rows = [{ t: NOW - HOUR, f: 98.6 }]
    const r = importData(engine, { astronaut: 'okafor', indicator: 'temp', format: 'json', text: JSON.stringify(rows), timeColumn: 't', valueColumn: 'f', unit: 'F', dataset: 'json' })
    expect(r.imported).toBe(1)
    const { points } = engine.series('okafor', 'temp', NOW - 2 * HOUR, NOW)
    expect(points.find((p) => p.source === 'import:json')!.v).toBeCloseTo(37, 5)
  })

  it('bozuk dosya ya da boş sonuç hata olarak döner', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const base = { astronaut: 'yildiz', indicator: 'hr', timeColumn: 't', valueColumn: 'v', dataset: 'x' } as const
    expect(importData(engine, { ...base, format: 'json', text: '{bozuk' }).error).toBe('format')
    expect(importData(engine, { ...base, format: 'csv', text: 't,v' }).error).toBe('empty')
  })
})

describe('demo senaryolarının uyarıları', () => {
  const morning = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 7 * HOUR

  it('"su içilmedi" senaryosu sabah da uyarı verir', () => {
    const engine = new Engine(new MemoryStore(), () => morning)
    engine.tick('yildiz')
    engine.triggerScenario('yildiz', 'waterMissed')
    const fresh = engine.tick('yildiz').fresh
    expect(fresh.find((f) => f.key === 'water:behind')?.level).toBe('dikkat')
  })

  it('sabah 11\'den önce senaryo yoksa su uyarısı verilmez', () => {
    const engine = new Engine(new MemoryStore(), () => morning)
    expect(engine.tick('yildiz').snapshot.findings.some((f) => f.key === 'water:behind')).toBe(false)
  })

  it('yeni şikayet "bildirildi", 6 saatten eskisi "sürüyor" diye yazılır', () => {
    let now = NOW
    const engine = new Engine(new MemoryStore(), () => now)
    engine.triggerScenario('yildiz', 'impactHand')
    const fresh = engine.tick('yildiz').snapshot.findings.find((f) => f.region === 'eller')!
    expect(fresh.level).toBe('kritik')
    expect(fresh.notifyDoctor).toBe(true)
    expect(fresh.title.en).toBe('Right hand: pain reported')
    now += 7 * HOUR
    expect(engine.tick('yildiz').snapshot.findings.find((f) => f.region === 'eller')!.title.en).toBe('Right hand complaint continues')
  })
})

describe('kritik durumda bildirim (D-06)', () => {
  it('kritik uyarı mürettebat arkadaşlarına anında, uçuş hekimine gecikmeyle gider; metin kimin olduğunu söyler', () => {
    let now = NOW
    const engine = new Engine(new MemoryStore(), () => now)
    engine.setEnvironment('mars')
    engine.tick('yildiz')
    engine.triggerScenario('yildiz', 'impactHand')
    engine.tick('yildiz')

    const toSurgeon = engine.messages().filter((m) => m.kind === 'alert')
    expect(toSurgeon).toHaveLength(1)
    expect(toSurgeon[0].to).toBe('surgeon')
    expect(toSurgeon[0].delivered).toBe(false)
    expect(toSurgeon[0].deliverAt - now).toBe(12 * 60_000)
    expect(toSurgeon[0].i18n?.tr).toMatch(/^E\. Yıldız — Sağ el: ağrı bildirildi\. Bildirilen şiddet 8\/10\./)

    // Arkadaş kendi ekranına bakınca bir kez görür
    const mate = engine.tick('okafor').incoming
    expect(mate).toHaveLength(1)
    expect(mate[0].title.tr).toBe('Mürettebat uyarısı: E. Yıldız')
    expect(engine.tick('okafor').incoming).toHaveLength(0)
    expect(engine.crewInbox('lindqvist')).toHaveLength(1)
    // Hekim görüntülerken gösterildi sayılmaz
    expect(engine.tick('mori', false).incoming).toHaveLength(0)
    expect(engine.tick('mori').incoming).toHaveLength(1)
  })
})

describe('demo senaryosu yeniden tetiklenince', () => {
  it('durum sürse de uyarı yeniden bildirilir; tetiklenmeden tekrar bildirilmez', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    engine.tick('yildiz')
    engine.triggerScenario('yildiz', 'hrHigh')
    const first = engine.tick('yildiz').fresh.filter((f) => f.indicator === 'hr')
    expect(first.length).toBeGreaterThan(0)
    // Kendiliğinden tekrar edilmez (U-12)
    expect(engine.tick('yildiz').fresh.filter((f) => f.indicator === 'hr')).toHaveLength(0)
    // Düğmeye yeniden basılınca aynı uyarı yeniden gelir
    engine.triggerScenario('yildiz', 'hrHigh')
    expect(engine.tick('yildiz').fresh.filter((f) => f.indicator === 'hr').map((f) => f.key)).toEqual(first.map((f) => f.key))
  })
})

describe('kemik şikayeti', () => {
  it('kırık şüphesi şiddetten bağımsız olarak kritik uyarıdır, hekime gider ve kemik adları kaydedilir', () => {
    const now = NOW
    const engine = new Engine(new MemoryStore(), () => now)
    engine.tick('yildiz')
    const bones = [{ tr: 'Sol uyluk kemiği', en: 'Femur (left)' }]
    const doc = engine.addComplaint('yildiz', { region: 'bacaklar', side: 'left', muscles: [], bones, symptom: 'fracture', severity: 2, note: 'Düştüm', origin: 'hologram' })
    expect(engine.complaints('yildiz')[0].bones).toEqual(bones)

    const fresh = engine.tick('yildiz').fresh
    const finding = fresh.find((f) => f.key === `complaint:${doc.id}:k`)!
    expect(finding.level).toBe('kritik')
    expect(finding.notifyDoctor).toBe(true)
    expect(finding.title.tr).toBe('Sol bacak: kırık şüphesi bildirildi')
    expect(finding.sources).toContain('mpBrokenBone')
    expect(engine.messages().filter((m) => m.kind === 'alert')).toHaveLength(1)
  })

  it('düşük şiddetli darbe uyarı üretmez; yalnızca tek bir bilgi notu gelir (hekime bildirilmez)', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    engine.tick('yildiz')
    const doc = engine.addComplaint('yildiz', { region: 'bacaklar', side: 'left', muscles: [], bones: [], symptom: 'impact', severity: 3, note: '', origin: 'hologram' })
    const mine = engine.tick('yildiz').fresh.filter((f) => f.key.startsWith(`complaint:${doc.id}`))
    expect(mine.map((f) => f.level)).toEqual(['bilgi'])
    expect(mine[0].notifyDoctor).toBeFalsy()
  })
})

describe('spor programı her zaman istasyon programıdır', () => {
  it('istasyonda ~120 dk ARED/T2/CEVIS; görev ortamı (iletişim gecikmesi) değişse de program ve hedef değişmez', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const iss = engine.program('okafor')
    expect(iss.environment).toBe('iss')
    expect(iss.items.reduce((n, i) => n + i.minutes, 0)).toBe(120)
    expect(engine.snapshot('okafor').exercise.targetMin).toBe(120)

    for (const env of ['orion', 'moon', 'mars'] as const) {
      engine.setEnvironment(env)
      expect(engine.comm().environment).toBe(env)
      const p = engine.program('okafor')
      expect(p.environment).toBe('iss')
      expect(p.items.map((i) => i.exercise)).toEqual(iss.items.map((i) => i.exercise))
      expect(engine.snapshot('okafor').exercise.targetMin).toBe(120)
    }
  })

  it('başka ortama göre kurulmuş eski bir program istasyon programına çevrilir, yapılmış işaretler korunur', () => {
    const store = new MemoryStore()
    const engine = new Engine(store, () => NOW)
    const p = engine.program('okafor')
    engine.setExerciseDone('okafor', 0, true)
    // Eski sürümde Ay üssü seçilip kaydedilmiş program
    store.put('programs', { ...engine.program('okafor'), environment: 'moon' })
    const again = engine.program('okafor')
    expect(again.environment).toBe('iss')
    expect(again.items[0]).toMatchObject({ exercise: p.items[0].exercise, done: true })
  })
})

describe('kişisel normal ve profil (U-04, D-10)', () => {
  it('kişisel normal kişinin kendi verisinden gelir; kişiden kişiye farklıdır', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const a = engine.snapshot('yildiz').personal.hr
    const b = engine.snapshot('okafor').personal.hr
    expect(a.basis).toBe('data')
    expect(a.low).toBeLessThan(a.high)
    expect(a.high - a.low).toBeLessThan(30)
    expect(a.mean).not.toBe(b.mean)
  })

  it('profil değişince kaydedilir, vücut kitle indeksi güncellenir ve kişisel normal yeniden öğrenilir', () => {
    let now = NOW
    const engine = new Engine(new MemoryStore(), () => now)
    expect(engine.profile('yildiz')).toMatchObject({ age: 36, heightCm: 168, weightKg: 61, edited: false })
    const r = engine.updateProfile('yildiz', { weightKg: 70 })
    expect(r.ok).toBe(true)
    expect(r.profile).toMatchObject({ weightKg: 70, edited: true, bmi: 24.8, bmiCategory: 'healthy' })
    expect(engine.snapshot('yildiz').personal.hr.basis).toBe('baseline')
    now += 2 * DAY
    expect(engine.snapshot('yildiz').personal.hr).toMatchObject({ basis: 'data', since: NOW })
  })

  it('sınır dışı değer kaydedilmez', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    expect(engine.updateProfile('mori', { age: 12 }).ok).toBe(false)
    expect(engine.updateProfile('mori', { heightCm: 300 }).ok).toBe(false)
    expect(engine.profile('mori').age).toBe(41)
  })

  it('nabız genel aralıkta ama kişisel normalin üstündeyse bilgi verilir (antrenman saatinde verilmez)', () => {
    const t = NOW - 15 * HOUR + 13 * HOUR
    const engine = new Engine(new MemoryStore(), () => t)
    const pn = engine.snapshot('okafor').personal.hr
    engine.addMeasurement('okafor', 'hr', Math.min(99, Math.ceil(pn.high) + 4), undefined, 'manual', t)
    const f = engine.snapshot('okafor').findings.find((x) => x.key === 'personal:hr:high')
    expect(f).toBeDefined()
    expect(f!.reason.tr).toMatch(/kişisel|normalin/)
  })
})

describe('rapor (D-02)', () => {
  it('her satırda referans aralığı var; su ve egzersizde bugünün yarım değeri istatistiğe katılmaz', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const rep = engine.report('yildiz', 7)
    const hr = rep.rows.find((r) => r.id === 'hr')!
    expect(hr.ref).toEqual({ low: 60, high: 100 })
    expect(rep.rows.find((r) => r.id === 'bp')!.ref).toMatchObject({ low2: 60, high2: 80 })
    const water = rep.rows.find((r) => r.id === 'water')!
    expect(water.partial).toBe(true)
    expect(water.stats!.count).toBeLessThanOrEqual(7)
  })
})

describe('kontrol takvimi (R-05)', () => {
  it('geçen hafta, bugün ve önümüzdeki iki haftanın kontrollerini verir; yapılmayan geçmiş kontrol gecikmiş sayılır', () => {
    const engine = new Engine(new MemoryStore(), () => NOW)
    const list = engine.schedule('yildiz')
    const days = list.map((c) => c.day)
    expect(Math.min(...days)).toBeGreaterThanOrEqual(142 - 7)
    expect(Math.max(...days)).toBeLessThanOrEqual(142 + 14)
    // Tepki testi her hafta, kan örneği görev planındaki günde (150)
    expect(list.filter((c) => c.key === 'reaction').length).toBeGreaterThanOrEqual(3)
    expect(list.find((c) => c.key === 'blood')?.day).toBe(150)
    expect(list.find((c) => c.key === 'blood')?.status).toBe('upcoming')
    const pastReaction = list.find((c) => c.key === 'reaction' && c.day < 142)!
    expect(pastReaction.status).toBe('overdue')
  })

  it('o gün tepki testi girilince kontrol yapılmış sayılır', () => {
    const reactionDay = 143 - 7 + ((3 - ((143 - 7) % 7)) + 7) % 7
    const t = MISSION.start - (MISSION.start % DAY) + reactionDay * DAY + 11 * HOUR
    let now = t
    const engine = new Engine(new MemoryStore(), () => now)
    engine.addMeasurement('yildiz', 'reaction', 250, undefined, 'manual', t)
    now = t + 3 * DAY
    expect(engine.schedule('yildiz').find((c) => c.key === 'reaction' && c.day === reactionDay)?.status).toBe('done')
  })
})

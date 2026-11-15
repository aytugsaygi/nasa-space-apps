import { describe, expect, it } from 'vitest'
import { analyze } from './analysis'
import { evaluate, INDICATORS, isValid, relativeStatus } from './catalog'
import { EXERCISES, generateProgram } from './coach'
import { CREW_IDS, DAY, HOUR, MISSION, missionDay } from './crew'
import { Engine } from './engine'
import type { ComplaintDoc } from './model'
import { simSeries } from './sim'
import { MemoryStore } from './store'

/** Sabit bir an: görevin 142. günü, saat 15:00 (GMT) */
const NOW = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 15 * HOUR

function engineAt(t = NOW) {
  let now = t
  const engine = new Engine(new MemoryStore(), () => now)
  return { engine, advance: (ms: number) => (now += ms) }
}

describe('gösterge kataloğu', () => {
  it('ölçümleri kaynaktaki aralıklara göre değerlendirir', () => {
    expect(evaluate('hr', 72).status).toBe('normal')
    expect(evaluate('hr', 112).status).toBe('dikkat')
    expect(evaluate('spo2', 92).status).toBe('dikkat')
    expect(evaluate('spo2', 88).status).toBe('kritik')
    expect(evaluate('glucose', 62).status).toBe('dikkat')
    expect(evaluate('glucose', 50).status).toBe('kritik')
    expect(evaluate('co2', 3.6).status).toBe('dikkat')
  })

  it('tansiyonda iki değerden kötü olanı geçerlidir', () => {
    expect(evaluate('bp', 118, 76).status).toBe('normal')
    expect(evaluate('bp', 118, 92).label.en).toMatch(/stage 2/)
    expect(evaluate('bp', 86, 55).label.en).toMatch(/Low/)
    expect(evaluate('bp', 190, 100).status).toBe('kritik')
  })

  it('tepki süresini kişisel başlangıca göre değerlendirir', () => {
    expect(relativeStatus(250, 248).status).toBe('normal')
    expect(relativeStatus(300, 248).status).toBe('dikkat')
    expect(relativeStatus(350, 248).status).toBe('kritik')
  })

  it('geçersiz elle girişleri reddeder (negatif nabız, büyük tansiyondan yüksek küçük tansiyon)', () => {
    expect(isValid('hr', -5)).toBe(false)
    expect(isValid('hr', 70)).toBe(true)
    expect(isValid('bp', 120, 130)).toBe(false)
    expect(isValid('bp', 120)).toBe(false)
    expect(isValid('bp', 120, 80)).toBe(true)
  })

  it('her göstergenin bir kaynağı ve iki dilde adı var', () => {
    for (const ind of Object.values(INDICATORS)) {
      expect(ind.name.tr && ind.name.en).toBeTruthy()
      expect(ind.sources.length).toBeGreaterThan(0)
      expect(ind.range.tr && ind.range.en).toBeTruthy()
    }
  })
})

describe('simülatör', () => {
  it('aynı zaman için her zaman aynı değeri üretir', () => {
    const a = simSeries('hr', 'yildiz', NOW - DAY, NOW, [], NOW)
    const b = simSeries('hr', 'yildiz', NOW - DAY, NOW, [], NOW)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(40)
  })

  it('değerler gerçekçi aralıklarda kalır', () => {
    const sleep = simSeries('sleep', 'mori', NOW - 60 * DAY, NOW, [], NOW).map((p) => p.v)
    expect(Math.min(...sleep)).toBeGreaterThanOrEqual(3)
    expect(Math.max(...sleep)).toBeLessThanOrEqual(10)
    const avg = sleep.reduce((a, b) => a + b, 0) / sleep.length
    // Demo mürettebatı önerilen 7-9 saat içinde uyur (tb041); uyku sorunu yalnızca demo senaryosuyla oluşur
    expect(avg).toBeGreaterThan(7)
    expect(avg).toBeLessThan(9)
  })

  it('başlangıç durumunda son gecenin uykusu normal bantta kalır (7 sa ve üstü)', () => {
    for (const id of ['yildiz', 'mori', 'okafor', 'lindqvist']) {
      const sleep = simSeries('sleep', id, NOW - 10 * DAY, NOW, [], NOW).map((p) => p.v)
      expect(Math.min(...sleep)).toBeGreaterThanOrEqual(7)
    }
  })

  it('her astronotun değerleri farklıdır', () => {
    const a = simSeries('hr', 'yildiz', NOW - DAY, NOW, [], NOW).map((p) => p.v)
    const b = simSeries('hr', 'okafor', NOW - DAY, NOW, [], NOW).map((p) => p.v)
    expect(a).not.toEqual(b)
  })
})

describe('spor koçu', () => {
  const complaint = (over: Partial<ComplaintDoc>): ComplaintDoc => ({
    id: 'c1',
    astronaut: 'yildiz',
    ts: NOW,
    region: 'eller',
    side: 'right',
    muscles: [],
    symptom: 'pain',
    severity: 6,
    note: '',
    status: 'active',
    updates: [],
    origin: 'hologram',
    ...over,
  })

  it('şikayet yokken ARED, aerobik ve esneme içeren tam program verir', () => {
    const p = generateProgram('yildiz', 142, [], NOW)
    const devices = p.items.map((i) => EXERCISES[i.exercise].device)
    expect(devices).toContain('ARED')
    expect(devices.some((d) => d === 'T2' || d === 'CEVIS')).toBe(true)
    expect(p.adaptedFor).toEqual([])
  })

  it('sağ el ağrısında eli yoğun yükleyen hareketleri çıkarır', () => {
    const p = generateProgram('yildiz', 142, [complaint({})], NOW)
    const ids = p.items.map((i) => i.exercise)
    expect(ids).not.toContain('aredDeadlift')
    expect(ids).not.toContain('aredBench')
    expect(p.adaptedFor).toEqual(['c1'])
    // Çıkarılan hareketin yerine gelen alternatif not taşır
    expect(p.items.some((i) => i.replaces === 'aredDeadlift' && i.note?.tr.includes('sağ el'))).toBe(true)
  })

  it('hafif şikayette hareketi hafifletir', () => {
    const p = generateProgram('yildiz', 142, [complaint({ severity: 3 })], NOW)
    const dl = p.items.find((i) => i.exercise === 'aredDeadlift')
    expect(dl?.intensity).toBe('light')
    expect(dl?.sets).toBe(2)
  })

  it('sırt ağrısında gövde sabitleme ekler', () => {
    const p = generateProgram('yildiz', 142, [complaint({ region: 'sirt', side: 'both', severity: 5 })], NOW)
    expect(p.items.map((i) => i.exercise)).toContain('coreBrace')
  })
})

describe('motor', () => {
  it('şikayet bildirilince bugünün programı uyarlanır ve ertesi gün sorulur', () => {
    const { engine, advance } = engineAt()
    expect(engine.program('yildiz').adaptedFor).toEqual([])
    const c = engine.addComplaint('yildiz', { region: 'eller', side: 'right', muscles: [], symptom: 'pain', severity: 7, note: '', origin: 'hologram' })
    expect(engine.program('yildiz').adaptedFor).toEqual([c.id])
    // Aynı gün sorulmaz, ertesi gün sorulur
    expect(engine.checkin('yildiz')).toBeNull()
    advance(DAY)
    expect(engine.checkin('yildiz')?.id).toBe(c.id)
    // "Geçti" cevabıyla şikayet kapanır, program tam haline döner
    engine.answerCheckin('yildiz', c.id, 'gone')
    expect(engine.checkin('yildiz')).toBeNull()
    expect(engine.program('yildiz').adaptedFor).toEqual([])
    expect(engine.complaints('yildiz').find((x) => x.id === c.id)?.status).toBe('resolved')
  })

  it('demo senaryosu ilgili uyarıyı ve hekim bildirimini üretir', () => {
    const { engine } = engineAt()
    engine.tick('okafor')
    engine.triggerScenario('okafor', 'spo2Low')
    const { snapshot, fresh } = engine.tick('okafor')
    expect(snapshot.indicators.spo2.status).not.toBe('normal')
    expect(fresh.some((f) => f.indicator === 'spo2')).toBe(true)
    // Aynı durum ikinci kez bildirilmez (U-12)
    expect(engine.tick('okafor').fresh.some((f) => f.indicator === 'spo2')).toBe(false)
  })

  it('kritik uyarı uçuş hekimine otomatik mesaj olarak gider', () => {
    const { engine } = engineAt()
    engine.triggerScenario('yildiz', 'impactHand')
    engine.tick('yildiz')
    const alerts = engine.messages('yildiz').filter((m) => m.kind === 'alert')
    expect(alerts.length).toBeGreaterThan(0)
  })

  it('tansiyon düşünce ölçüm kaydedilir ve dikkat uyarısı çıkar', () => {
    const { engine } = engineAt()
    engine.triggerScenario('yildiz', 'bpLow')
    const s = engine.snapshot('yildiz')
    expect(s.indicators.bp.value).toBeLessThan(90)
    expect(s.findings.some((f) => f.key.startsWith('bp:'))).toBe(true)
  })

  it('bir haftalık uyku azalması eğilim uyarısı verir (U-03)', () => {
    const { engine } = engineAt()
    engine.triggerScenario('okafor', 'sleepDebt')
    expect(engine.snapshot('okafor').findings.some((f) => f.key === 'sleep:trend')).toBe(true)
  })

  it('elle giriş doğrulanır ve son değer olur', () => {
    const { engine } = engineAt()
    expect(engine.addMeasurement('yildiz', 'hr', -3).ok).toBe(false)
    expect(engine.addMeasurement('yildiz', 'glucose', 104).ok).toBe(true)
    const s = engine.snapshot('yildiz')
    expect(s.indicators.glucose.value).toBe(104)
    expect(s.indicators.glucose.status).toBe('dikkat')
  })

  it('içe aktarılan veri kendi aralığında simülasyonun yerine geçer', () => {
    const { engine } = engineAt()
    for (let d = 3; d >= 1; d--) engine.addMeasurement('yildiz', 'hr', 61, undefined, 'import:test', NOW - d * DAY)
    // İçe aktarılan aralığın içinde yalnızca içe aktarılan noktalar, dışında simülasyon
    const inside = engine.series('yildiz', 'hr', NOW - 3 * DAY, NOW - DAY).points
    expect(inside.every((p) => p.source === 'import:test')).toBe(true)
    const around = engine.series('yildiz', 'hr', NOW - 3 * DAY - 2 * HOUR, NOW - DAY + 2 * HOUR).points
    expect(around.some((p) => p.source === 'sim')).toBe(true)
  })

  it('su eklenince yapılacaklar listesi ilerler', () => {
    const { engine } = engineAt()
    const before = engine.tasks('yildiz').find((t) => t.kind === 'water')!.progress!.value
    engine.addWater('yildiz', 250)
    expect(engine.tasks('yildiz').find((t) => t.kind === 'water')!.progress!.value).toBe(before + 250)
  })

  it('demo başlangıç durumuna dönünce bütün mürettebat fabrika ayarına döner; içe aktarılan veriler korunur', () => {
    const { engine } = engineAt()
    engine.triggerScenario('yildiz', 'impactHand')
    engine.triggerScenario('yildiz', 'fever')
    engine.triggerScenario('okafor', 'bpLow')
    engine.addMeasurement('yildiz', 'reaction', 340)
    engine.addComplaint('mori', { region: 'bacaklar', side: 'left', muscles: [], symptom: 'fracture', severity: 5, note: '', origin: 'hologram' })
    engine.updateProfile('okafor', { weightKg: 95 })
    engine.sendMessage('okafor', 'Rapor')
    engine.setEnvironment('mars')

    engine.resetDemo()

    for (const id of CREW_IDS) {
      const s = engine.snapshot(id)
      expect(engine.complaints(id).filter((c) => c.status !== 'resolved')).toHaveLength(0)
      expect(s.findings.filter((f) => f.level !== 'bilgi')).toEqual([])
    }
    expect(engine.snapshot('yildiz').indicators.reaction.source).not.toBe('manual')
    expect(engine.profile('okafor').weightKg).toBe(79)
    expect(engine.messages()).toHaveLength(0)
    expect(engine.comm().environment).toBe('iss')
    // Başlangıç durumundaki bilgi notları bildirim olarak yeniden gelmez
    expect(engine.tick('yildiz').fresh).toEqual([])
  })

  it('mürettebat özeti her astronot için puan verir', () => {
    const { engine } = engineAt()
    const crew = engine.crewOverview()
    expect(crew).toHaveLength(4)
    for (const c of crew) {
      expect(c.score).toBeGreaterThan(0)
      expect(c.score).toBeLessThanOrEqual(100)
    }
    // Başlangıçta etkin şikayet yok; Mori'nin geçmiş sırt ağrısı geçmişte kayıtlı
    for (const c of crew) expect(c.complaints).toBe(0)
    expect(engine.complaints('mori').some((c) => c.region === 'sirt' && c.status === 'resolved')).toBe(true)
  })

  it('iletişim kesintisinde mesaj kuyrukta bekler (Mars)', () => {
    const { engine } = engineAt()
    engine.triggerScenario('yildiz', 'commBlackout')
    const msg = engine.sendMessage('yildiz', 'Merhaba')!
    expect(msg.queued).toBe(true)
    expect(engine.messages('yildiz')[0].delivered).toBe(false)
    expect(missionDay(msg.deliverAt)).toBeGreaterThan(missionDay(NOW))
  })

  it('analiz her uyarıda neden ve eylem verir', () => {
    const { engine } = engineAt()
    engine.triggerScenario('yildiz', 'fever')
    engine.triggerScenario('yildiz', 'co2High')
    const s = engine.snapshot('yildiz')
    expect(s.findings.length).toBeGreaterThan(1)
    for (const f of s.findings) {
      expect(f.reason.tr && f.reason.en && f.action.tr && f.action.en).toBeTruthy()
      expect(f.sources.length).toBeGreaterThan(0)
    }
    expect(typeof analyze).toBe('function')
  })
})

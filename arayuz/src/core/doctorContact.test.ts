// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DAY, HOUR, MISSION } from './crew'
import { checkDoctorRequest, checkRange, deepFreeze, MEDICAL_CONTACTS, presetRange, type DoctorRequest } from './doctorContact'
import { Engine } from './engine'
import type { MessageDoc } from './model'
import { MemoryStore } from './store'

/* Acil destek → hekimle iletişim (docs/wellbeing EM-02, EM-04): alıcı, aralık, ek, anlık görüntü, çift gönderim */

const REF = Date.UTC(2026, 10, 12, 9, 0)

function setup(t = REF, store = new MemoryStore()) {
  let now = t
  const engine = new Engine(store, () => now)
  return { engine, store, set: (v: number) => (now = v) }
}

const base = (over: Partial<DoctorRequest> = {}): DoctorRequest => ({
  requestId: 'req_0001abcd',
  recipient: 'surgeon',
  symptoms: [],
  other: true,
  explanation: '',
  text: 'Başka bir konuyu konuşmak istiyorum.',
  attachment: null,
  ...over,
})

describe('alıcı ve istek denetimi', () => {
  it('yalnızca yapılandırılmış alıcıya gönderilir; alıcı yoksa gönderim yapılamaz', () => {
    expect(MEDICAL_CONTACTS.map((c) => c.id)).toEqual(['surgeon'])
    expect(checkDoctorRequest(base())).toBeNull()
    expect(checkDoctorRequest(base(), [])).toBe('noRecipient')
    expect(checkDoctorRequest(base({ recipient: 'ground' as 'surgeon' }))).toBe('noRecipient')
  })

  it('belirti zorunlu değildir: "başka bir konu" ya da açıklama yeterlidir; tamamen boş istek reddedilir', () => {
    expect(checkDoctorRequest(base({ other: true }))).toBeNull()
    expect(checkDoctorRequest(base({ other: false, explanation: 'Sorum var' }))).toBeNull()
    expect(checkDoctorRequest(base({ other: false, explanation: '   ' }))).toBe('empty')
    expect(checkDoctorRequest(base({ symptoms: ['made-up' as 'pain'] }))).toBe('invalid')
  })

  it('açıklama kısaltılmaz; sınırı aşan istek reddedilir', () => {
    expect(checkDoctorRequest(base({ explanation: 'x'.repeat(1001) }))).toBe('tooLong')
    expect(checkDoctorRequest(base({ explanation: 'x'.repeat(1000) }))).toBeNull()
  })
})

describe('tarih aralıkları', () => {
  it('hazır aralıklar referans andan geriye tam olarak hesaplanır', () => {
    expect(presetRange('24h', REF)).toEqual({ from: REF - 24 * HOUR, to: REF })
    expect(presetRange('3d', REF)).toEqual({ from: REF - 3 * DAY, to: REF })
    expect(presetRange('7d', REF)).toEqual({ from: REF - 7 * DAY, to: REF })
  })

  it('boş, ters, gelecekteki ve 30 günden uzun aralık reddedilir', () => {
    expect(checkRange(REF, REF, REF)).toBe('empty')
    expect(checkRange(REF, REF - 1, REF)).toBe('empty')
    expect(checkRange(REF - HOUR, REF + 1, REF)).toBe('endAfterReference')
    expect(checkRange(REF - 31 * DAY, REF, REF)).toBe('tooLong')
    expect(checkRange(REF - 30 * DAY, REF, REF)).toBeNull()
    expect(checkRange(Number.NaN, REF, REF)).toBe('invalid')
  })

  it('aralık iki uçta da kapsayıcıdır: tam sınırdaki kayıt dahil, bir milisaniye dışı hariç', () => {
    const { engine } = setup()
    const at = REF - 2 * HOUR
    engine.addMeasurement('yildiz', 'glucose', 90)
    const t = engine.store.list<{ ts: number } & import('./store').Doc>('measurements')[0].ts
    expect(t).toBe(REF)
    const count = (from: number, to: number) => {
      const r = engine.attachmentPreview('yildiz', ['glucose'], from, to, REF)
      return r.ok ? r.snapshot.categories[0].points.filter((p) => p.source === 'manual').length : -1
    }
    expect(count(at, REF)).toBe(1)
    expect(count(at, REF - 1)).toBe(0)
    // Başlangıç tam kayıt anında da dahil
    expect(count(REF, REF + 0)).toBe(-1)
  })

  it('kayıt olmayan aralıkta sayı 0 ve ilk/son kayıt yoktur', () => {
    const { engine } = setup()
    // Görev başlamadan önceki bir gün: hiçbir kayıt yok
    const r = engine.attachmentPreview('yildiz', ['hr', 'glucose'], MISSION.start - 2 * DAY, MISSION.start - DAY, REF)
    expect(r.ok && r.snapshot.categories.map((c) => [c.id, c.count, c.first, c.last])).toEqual([
      ['hr', 0, null, null],
      ['glucose', 0, null, null],
    ])
    // Kan şekeri günde bir kez (07:15) ölçülür: 02:00-03:00 arasında kayıt yoktur
    const hour = engine.attachmentPreview('yildiz', ['glucose'], REF - 7 * HOUR, REF - 6 * HOUR, REF)
    expect(hour.ok && hour.snapshot.categories[0].count).toBe(0)
  })

  it('kayıtların sayısı, kaynağı ve ilk/son anı gerçek veriden gelir', () => {
    const { engine } = setup()
    engine.addMeasurement('yildiz', 'hr', 72)
    const r = engine.attachmentPreview('yildiz', ['hr'], REF - 24 * HOUR, REF, REF)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const hr = r.snapshot.categories[0]
    expect(hr.count).toBe(hr.points.length)
    expect(hr.sources.manual).toBe(1)
    expect(hr.sources.sim).toBe(hr.count - 1)
    expect(hr.first).toBe(hr.points[0].t)
    expect(hr.last).toBe(REF)
    expect(r.snapshot).toMatchObject({ reference: REF, from: REF - 24 * HOUR, to: REF, timeZone: 'UTC' })
  })
})

describe('gönderim', () => {
  function snapshotFor(engine: Engine) {
    const r = engine.attachmentPreview('yildiz', ['hr'], REF - 3 * HOUR, REF, REF)
    if (!r.ok) throw new Error('önizleme')
    return deepFreeze(r.snapshot)
  }

  it('demo giden kutusuna yazılır; gecikme ortamdan gelir, teslim ya da okundu onayı üretilmez', () => {
    const { engine } = setup()
    const r = engine.sendDoctorRequest('yildiz', base())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.duplicate).toBe(false)
    expect(r.message).toMatchObject({ from: 'yildiz', to: 'surgeon', kind: 'message', queued: false, other: true, attachment: null })
    expect(r.message.deliverAt).toBe(REF + r.message.delayMs)
    expect(r.message).not.toHaveProperty('ack')
    expect(Object.keys(r.message)).not.toContain('readAt')
  })

  it('aynı istek kimliğiyle ikinci gönderim yeni mesaj açmaz', () => {
    const { engine } = setup()
    const first = engine.sendDoctorRequest('yildiz', base())
    const second = engine.sendDoctorRequest('yildiz', base())
    expect(second).toMatchObject({ ok: true, duplicate: true })
    expect(first.ok && second.ok && second.message.id === first.message.id).toBe(true)
    expect(engine.store.list<MessageDoc>('messages').filter((m) => m.requestId === 'req_0001abcd')).toHaveLength(1)
  })

  it('gönderilen ek anlık görüntüdür: kaynak veri sonradan değişse de mesaj değişmez', () => {
    const { engine, set } = setup()
    const snap = snapshotFor(engine)
    const sent = engine.sendDoctorRequest('yildiz', base({ attachment: snap }))
    if (!sent.ok) throw new Error('gönderilemedi')
    const before = JSON.stringify(sent.message.attachment)
    set(REF + 10 * 60_000)
    engine.addMeasurement('yildiz', 'hr', 130, undefined, 'manual', REF - HOUR)
    const stored = engine.store.get<MessageDoc>('messages', sent.message.id)!
    expect(JSON.stringify(stored.attachment)).toBe(before)
    // Aynı aralığın yeni önizlemesi değişti, gönderilen değişmedi
    const fresh = engine.attachmentPreview('yildiz', ['hr'], REF - 3 * HOUR, REF, REF)
    expect(fresh.ok && fresh.snapshot.categories[0].count).toBe(snap.categories[0].count + 1)
    expect(() => {
      ;(snap.categories[0].points as { v: number }[])[0].v = 1
    }).toThrow()
  })

  it('iletişim kesikse kuyrukta bekler (kuyrukta olarak işaretlenir)', () => {
    const { engine } = setup()
    engine.triggerScenario('yildiz', 'commBlackout')
    const r = engine.sendDoctorRequest('yildiz', base())
    expect(r.ok && r.message.queued).toBe(true)
  })

  it('kalıcı yazılamazsa mesaj kaydedilmez ve hata döner', () => {
    class FlakyStore extends MemoryStore {
      flush() {
        throw new Error('dolu')
      }
    }
    const { engine } = setup(REF, new FlakyStore())
    expect(engine.sendDoctorRequest('yildiz', base())).toEqual({ ok: false, error: 'storage' })
    expect(engine.store.list<MessageDoc>('messages').some((m) => m.requestId)).toBe(false)
  })

  it('aralık dışı ya da sayısı tutmayan ek reddedilir', () => {
    const { engine } = setup()
    const snap = structuredClone(snapshotFor(engine))
    snap.categories[0].points[0].t = snap.from - 1
    expect(engine.sendDoctorRequest('yildiz', base({ attachment: snap }))).toEqual({ ok: false, error: 'invalid' })
    const snap2 = structuredClone(snapshotFor(engine))
    snap2.categories[0].count += 1
    expect(engine.sendDoctorRequest('yildiz', base({ attachment: snap2 }))).toEqual({ ok: false, error: 'invalid' })
  })

  it('her astronotun mesajı kendine aittir', () => {
    const { engine } = setup()
    engine.sendDoctorRequest('mori', base({ requestId: 'req_mori0001' }))
    expect(engine.messages('yildiz').some((m) => m.requestId === 'req_mori0001')).toBe(false)
    expect(engine.messages('mori').some((m) => m.requestId === 'req_mori0001')).toBe(true)
  })
})

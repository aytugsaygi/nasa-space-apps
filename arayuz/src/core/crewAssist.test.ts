// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { AssistRequestDoc } from './crewAssist'
import { Engine } from './engine'
import { MemoryStore } from './store'

/* Acil durum → mürettebattan acil yardım isteği (docs/wellbeing EM-03, EM-04) */

const T0 = Date.UTC(2026, 10, 12, 9, 0)

function setup(transport: 'server' | 'local' = 'server', store = new MemoryStore()) {
  let now = T0
  const engine = new Engine(store, () => now, { transport })
  return { engine, store, advance: (ms: number) => (now += ms) }
}

describe('acil yardım isteği', () => {
  it('yalnızca istek kimliği, gönderen, zaman ve (yok) konum taşır; gönderen dışındaki mürettebata yönelir', () => {
    const { engine } = setup()
    const r = engine.sendAssistRequest('yildiz', 'req_assist01')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.request).toEqual({
      id: 'as:req_assist01',
      astronaut: 'yildiz',
      ts: T0,
      requestId: 'req_assist01',
      sender: 'yildiz',
      recipients: ['lindqvist', 'mori', 'okafor'],
      location: null,
      transport: 'server',
      deliveries: {},
      acks: {},
    })
  })

  it('aynı istek kimliği ikinci istek açmaz; geçersiz kimlik reddedilir', () => {
    const { engine } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    expect(engine.sendAssistRequest('yildiz', 'req_assist01')).toMatchObject({ ok: true, duplicate: true })
    expect(engine.store.list('assists')).toHaveLength(1)
    expect(engine.sendAssistRequest('yildiz', 'x')).toEqual({ ok: false, error: 'invalid' })
    // Başkasının istek kimliğiyle gönderilemez
    expect(engine.sendAssistRequest('mori', 'req_assist01')).toEqual({ ok: false, error: 'invalid' })
  })

  it('kayıt teslim değildir: alıcı uygulaması onay verene kadar teslim yoktur; yanıt ayrı bir adımdır', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    expect(engine.assistRequests('yildiz')[0].deliveries).toEqual({})
    // Gönderenin kendisine gelen istek yoktur; alıcılara vardır
    expect(engine.incomingAssists('yildiz')).toHaveLength(0)
    expect(engine.incomingAssists('mori').map((d) => d.requestId)).toEqual(['req_assist01'])

    advance(4000)
    engine.confirmAssistDelivery('mori', 'req_assist01')
    let doc = engine.assistRequests('yildiz')[0]
    expect(doc.deliveries.mori).toEqual({ at: T0 + 4000, transport: 'server' })
    expect(doc.acks).toEqual({})

    // Gecikmeli yanıt
    advance(90_000)
    engine.ackAssist('mori', 'req_assist01')
    doc = engine.assistRequests('yildiz')[0]
    expect(doc.acks.mori).toEqual({ at: T0 + 94_000, transport: 'server' })
    // Yanıt veren alıcıya istek artık gösterilmez; diğerlerine gösterilir
    expect(engine.incomingAssists('mori')).toHaveLength(0)
    expect(engine.incomingAssists('okafor')).toHaveLength(1)
  })

  it('yinelenen onay ve yanıt ilk anı değiştirmez', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    engine.confirmAssistDelivery('okafor', 'req_assist01')
    advance(10_000)
    expect(engine.confirmAssistDelivery('okafor', 'req_assist01')).toMatchObject({ ok: true, duplicate: true })
    expect(engine.assistRequests('yildiz')[0].deliveries.okafor?.at).toBe(T0)
    // Yanıt, teslim onayı yoksa onu da kaydeder
    engine.ackAssist('lindqvist', 'req_assist01')
    expect(engine.assistRequests('yildiz')[0].deliveries.lindqvist?.at).toBe(T0 + 10_000)
  })

  it('alıcı olmayan onay veremez; olmayan istek bulunamaz', () => {
    const { engine } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    expect(engine.confirmAssistDelivery('yildiz', 'req_assist01')).toEqual({ ok: false, error: 'notRecipient' })
    expect(engine.ackAssist('mori', 'req_missing01')).toEqual({ ok: false, error: 'notFound' })
  })

  it('tarayıcı modunda (sunucu yok) istek ve onaylar yerel demo olarak işaretlenir', () => {
    const { engine } = setup('local')
    const r = engine.sendAssistRequest('yildiz', 'req_assist01')
    expect(r.ok && r.request.transport).toBe('local')
    engine.confirmAssistDelivery('mori', 'req_assist01')
    expect(engine.assistRequests('yildiz')[0].deliveries.mori?.transport).toBe('local')
  })

  it('kalıcı yazılamazsa istek kaydedilmez; onay da kaydedilmez', () => {
    let failing = true
    class FlakyStore extends MemoryStore {
      flush() {
        if (failing) throw new Error('dolu')
      }
    }
    const { engine } = setup('server', new FlakyStore())
    expect(engine.sendAssistRequest('yildiz', 'req_assist01')).toEqual({ ok: false, error: 'storage' })
    expect(engine.store.list('assists')).toHaveLength(0)
    failing = false
    engine.sendAssistRequest('yildiz', 'req_assist01')
    failing = true
    expect(engine.ackAssist('mori', 'req_assist01')).toEqual({ ok: false, error: 'storage' })
    expect(engine.store.get<AssistRequestDoc>('assists', 'as:req_assist01')?.acks).toEqual({})
  })

  it('eski istekler gösterilmez (2 saat); demo sıfırlaması temizler', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    advance(2 * 3_600_000)
    expect(engine.incomingAssists('mori')).toHaveLength(0)
    engine.resetDemo()
    expect(engine.store.list('assists')).toHaveLength(0)
  })
})

describe('acil durum: sonlandırma, sesli cevap ve sağlık ekibi', () => {
  it('yalnızca gönderen sonlandırır; ikinci sonlandırma ilk anı korur; alıcıya bir kez kapanış olarak döner', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    engine.ackAssist('mori', 'req_assist01')
    // Yanıt veren alıcıya istek artık gelmez
    expect(engine.incomingAssists('mori')).toHaveLength(0)
    expect(engine.endAssist('mori', 'req_assist01')).toEqual({ ok: false, error: 'invalid' })
    advance(90_000)
    const r = engine.endAssist('yildiz', 'req_assist01')
    expect(r).toMatchObject({ ok: true, request: { endedAt: T0 + 90_000 } })
    advance(5000)
    expect(engine.endAssist('yildiz', 'req_assist01')).toMatchObject({ ok: true, duplicate: true, request: { endedAt: T0 + 90_000 } })
    // Kapanış, yanıt vermiş olsa da bütün alıcılara gider
    expect(engine.incomingAssists('mori').map((d) => d.endedAt)).toEqual([T0 + 90_000])
    expect(engine.incomingAssists('okafor').map((d) => d.endedAt)).toEqual([T0 + 90_000])
    expect(engine.endAssist('yildiz', 'yok_boyle_istek')).toEqual({ ok: false, error: 'notFound' })
  })

  it('sesli ya da yazılı cevap acil duruma eklenir; boşluklar sadeleşir; boş, çok uzun ya da kapanmış isteğe eklenmez', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    advance(3000)
    expect(engine.addAssistNote('yildiz', 'req_assist01', '  Başım   dönüyor ')).toMatchObject({ ok: true, request: { notes: [{ at: T0 + 3000, text: 'Başım dönüyor' }] } })
    expect(engine.addAssistNote('yildiz', 'req_assist01', '   ')).toEqual({ ok: false, error: 'invalid' })
    expect(engine.addAssistNote('yildiz', 'req_assist01', 'x'.repeat(501))).toEqual({ ok: false, error: 'invalid' })
    expect(engine.addAssistNote('mori', 'req_assist01', 'başkası')).toEqual({ ok: false, error: 'invalid' })
    expect(engine.incomingAssists('mori')[0].notes?.map((n) => n.text)).toEqual(['Başım dönüyor'])
    engine.endAssist('yildiz', 'req_assist01')
    expect(engine.addAssistNote('yildiz', 'req_assist01', 'geç kaldı')).toEqual({ ok: false, error: 'invalid' })
  })

  it('sağlık ekibi bütün mürettebatın süresi geçmemiş acil durumlarını görür', () => {
    const { engine, advance } = setup()
    engine.sendAssistRequest('yildiz', 'req_assist01')
    advance(60_000)
    engine.sendAssistRequest('mori', 'req_assist02')
    expect(engine.activeEmergencies().map((d) => d.sender)).toEqual(['mori', 'yildiz'])
    advance(2 * 3_600_000)
    expect(engine.activeEmergencies()).toHaveLength(0)
  })
})

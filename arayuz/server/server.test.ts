// @vitest-environment node
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { beforeAll, describe, expect, it } from 'vitest'
import { DAY, HOUR, MISSION } from '../src/core/crew'
import { Engine } from '../src/core/engine'
import { importData } from '../src/core/importer'
import { dispatch } from '../src/core/rpc'
import { SqliteStore } from './db'

const NOW = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 15 * HOUR

describe('SQLite kayıt', () => {
  it('belgeleri yazar, okur, astronota göre süzer ve siler', () => {
    const store = new SqliteStore(':memory:')
    store.put('journal', { id: 'a', astronaut: 'yildiz', ts: 2, text: 'iki' })
    store.put('journal', { id: 'b', astronaut: 'mori', ts: 1, text: 'bir' })
    store.put('journal', { id: 'c', astronaut: '*', ts: 3, text: 'ortak' })
    expect(store.list('journal').map((d) => d.id)).toEqual(['b', 'a', 'c'])
    expect(store.list('journal', 'yildiz').map((d) => d.id)).toEqual(['a', 'c'])
    expect(store.get<{ id: string; astronaut: string; ts: number; text: string }>('journal', 'a')?.text).toBe('iki')
    store.remove('journal', 'a')
    expect(store.get('journal', 'a')).toBeNull()
    store.close()
  })

  it('motor SQLite üzerinde çalışır ve kayıtlar kalıcıdır (aynı bağlantıda)', () => {
    const store = new SqliteStore(':memory:')
    const engine = new Engine(store, () => NOW)
    const c = engine.addComplaint('yildiz', { region: 'eller', side: 'right', muscles: [], symptom: 'pain', severity: 6, note: 'not', origin: 'hologram' })
    // Yeni bir motor aynı kayıttan okur (sunucu yeniden başlasa da veri durur)
    const again = new Engine(store, () => NOW)
    expect(again.complaints('yildiz').some((x) => x.id === c.id)).toBe(true)
    expect(again.program('yildiz').adaptedFor).toContain(c.id)
  })
})

describe('RPC', () => {
  it('geçersiz astronot ve göstergeyi reddeder', () => {
    const engine = new Engine(new SqliteStore(':memory:'), () => NOW)
    expect(() => dispatch(engine, 'snapshot', ['kimse'])).toThrow()
    expect(() => dispatch(engine, 'series', ['yildiz', 'yok', 0, 1])).toThrow()
    expect(dispatch(engine, 'snapshot', ['yildiz']).astronaut).toBe('yildiz')
  })
})

describe('check-in RPC (WB-T-05)', () => {
  // Sabah penceresinin içinde bir an (görev saat dilimi UTC)
  const T = Date.UTC(2026, 10, 12, 9)

  it('kaydeder, SQLite üzerinde kalıcıdır ve girdiyi doğrular', () => {
    const store = new SqliteStore(':memory:')
    const engine = new Engine(store, () => T)
    const { key } = dispatch(engine, 'currentCheckin', ['yildiz'])
    expect(key).toBe('2026-11-12:morning')
    expect(dispatch(engine, 'submitCheckin', ['yildiz', key, { mood: 9 }, ''])).toMatchObject({ ok: false, error: 'invalid' })
    expect(dispatch(engine, 'submitCheckin', ['yildiz', key, {}, ' '])).toMatchObject({ ok: false, error: 'empty' })
    expect(dispatch(engine, 'submitCheckin', ['yildiz', key, { mood: 'okay' }, 'not']).ok).toBe(true)
    expect(dispatch(engine, 'submitCheckin', ['yildiz', key, { mood: 'good' }]).ok).toBe(true)
    // Aynı veritabanını açan yeni motor (sunucu yeniden başladı)
    const again = new Engine(store, () => T)
    expect(dispatch(again, 'checkinWindow', ['yildiz', key])).toMatchObject({ outcome: 'saved', record: { revision: 2, answers: { mood: 'good' } } })
    expect(store.list('checkins')).toHaveLength(1)
    expect(() => dispatch(engine, 'submitCheckin', ['kimse', key, { mood: 'okay' }, ''])).toThrow()
    expect(() => dispatch(engine, 'skipCheckin', ['yildiz', 42])).toThrow()
    store.close()
  })
})

describe('zihin egzersizi RPC', () => {
  it('sonucu SQLite üzerinde kalıcı saklar, geçersiz girdiyi reddeder ve aynı kimliği iki kez yazmaz', () => {
    const store = new SqliteStore(':memory:')
    const engine = new Engine(store, () => NOW)
    const input = { id: 'ms_server123', ts: NOW - 90_000, endedAt: NOW, exercise: 'memory', score: 3, accuracy: 0.86, trials: 69, endLevel: 3 }
    expect(dispatch(engine, 'saveMindSession', ['yildiz', input])).toEqual({ ok: true })
    expect(dispatch(engine, 'saveMindSession', ['yildiz', input])).toEqual({ ok: true })
    expect(dispatch(engine, 'saveMindSession', ['yildiz', { ...input, id: 'ms_server456', score: 40 }])).toEqual({ ok: false, error: 'invalid' })
    expect(() => dispatch(engine, 'saveMindSession', ['kimse', input])).toThrow()
    // Sunucu yeniden başladı: yeni motor aynı veritabanından okur
    const again = new Engine(store, () => NOW)
    expect(dispatch(again, 'mindSessions', ['yildiz'])).toMatchObject([{ id: 'ms_server123', exercise: 'memory', score: 3, astronaut: 'yildiz' }])
    expect(dispatch(again, 'mindSessions', ['mori'])).toEqual([])
    store.close()
  })
})

describe('içe aktarma', () => {
  it('CSV verisini birim çevirisiyle alır, geçersiz satırları atlar ve kaynağı yazar', () => {
    const engine = new Engine(new SqliteStore(':memory:'), () => NOW)
    const csv = ['time,temp_f', `${new Date(NOW - 2 * HOUR).toISOString()},98.6`, `${new Date(NOW - HOUR).toISOString()},99.5`, 'bozuk,abc'].join('\n')
    const r = importData(engine, { astronaut: 'yildiz', indicator: 'temp', format: 'csv', text: csv, timeColumn: 'time', valueColumn: 'temp_f', unit: 'F', dataset: 'NASA örnek' })
    expect(r).toMatchObject({ ok: true, imported: 2, skipped: 1 })
    const pts = engine.series('yildiz', 'temp', NOW - 3 * HOUR, NOW).points.filter((p) => p.source === 'import:NASA örnek')
    expect(pts).toHaveLength(2)
    expect(pts[0].v).toBeCloseTo(37, 1)
  })
})

describe('HTTP uçları', () => {
  let handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
  beforeAll(async () => {
    process.env.VITALIS_DB = ':memory:'
    handle = (await import('./api')).handle
  })

  function call(method: string, url: string, body?: unknown) {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []) as unknown as IncomingMessage
    Object.assign(req, { method, url })
    return new Promise<{ status: number; json: unknown }>((resolve) => {
      const out = { statusCode: 0 }
      const res = Object.assign(out, {
        setHeader() {},
        end(text: string) {
          resolve({ status: out.statusCode, json: JSON.parse(text) })
        },
      }) as unknown as ServerResponse
      void handle(req, res)
    })
  }

  it('sağlık ucu sunucu modunu bildirir', async () => {
    const r = await call('GET', '/api/health')
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, mode: 'server' })
  })

  it('iki ayrı mürettebat istemcisi: acil yardım isteği alıcıya ulaşır, alındı ve yanıt göndericiye döner', async () => {
    // İstemci A: Yıldız; istemci B: Mori. Aynı sunucuya ayrı HTTP istekleriyle bağlanırlar.
    const rpc = async (name: string, ...args: unknown[]) => {
      const r = await call('POST', `/api/rpc/${name}`, { args })
      return { status: r.status, result: (r.json as { result?: unknown }).result }
    }
    const id = `req_${Date.now().toString(36)}two`
    const sent = await rpc('sendAssistRequest', 'yildiz', id)
    expect(sent.result).toMatchObject({ ok: true, request: { sender: 'yildiz', transport: 'server', location: null } })
    // Sunucu kaydetti ama hiçbir alıcı henüz almadı
    const pending = (await rpc('assistRequests', 'yildiz')).result as { requestId: string; deliveries: object; acks: object }[]
    expect(pending.find((d) => d.requestId === id)).toMatchObject({ deliveries: {}, acks: {} })

    // B kendi gelen kutusunda doğru isteği ve göndereni görür
    const inbox = (await rpc('incomingAssists', 'mori')).result as { requestId: string; sender: string }[]
    expect(inbox.find((d) => d.requestId === id)).toMatchObject({ sender: 'yildiz' })
    // A'nın kendi gelen kutusunda kendi isteği yoktur
    expect(((await rpc('incomingAssists', 'yildiz')).result as { requestId: string }[]).some((d) => d.requestId === id)).toBe(false)

    // Yinelenen olay: B aynı onayı iki kez gönderir
    await rpc('confirmAssistDelivery', 'mori', id)
    expect((await rpc('confirmAssistDelivery', 'mori', id)).result).toMatchObject({ ok: true, duplicate: true })
    await rpc('ackAssist', 'mori', id)
    const done = ((await rpc('assistRequests', 'yildiz')).result as { requestId: string; deliveries: Record<string, { transport: string }>; acks: Record<string, unknown> }[]).find((d) => d.requestId === id)!
    expect(done.deliveries.mori.transport).toBe('server')
    expect(Object.keys(done.acks)).toEqual(['mori'])

    // Geçersiz istek 400
    expect((await rpc('sendAssistRequest', 'kimse', id)).status).toBe(400)
  })

  it('RPC ucu motoru çağırır, hatalı istekte 400 döner', async () => {
    const ok = await call('POST', '/api/rpc/tasks', { args: ['yildiz'] })
    expect(ok.status).toBe(200)
    expect(Array.isArray((ok.json as { result: unknown[] }).result)).toBe(true)
    const bad = await call('POST', '/api/rpc/tasks', { args: ['kimse'] })
    expect(bad.status).toBe(400)
    const unknown = await call('POST', '/api/rpc/yokBoyle', { args: [] })
    expect(unknown.status).toBe(404)
  })
})

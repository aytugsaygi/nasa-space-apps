import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Engine } from '../src/core/engine'
import { importData, type ImportRequest } from '../src/core/importer'
import { dispatch, isRpcName, RpcError } from '../src/core/rpc'
import { SqliteStore } from './db'

/*
 * Vitalis sunucusu (backend). Geliştirmede Vite'ın içinde, yayında server/index.ts ile çalışır.
 *
 * Uçlar:
 * - GET  /api/health          sunucu ve veritabanı çalışıyor mu
 * - POST /api/rpc/:yöntem     çekirdek motorun işlemleri (src/core/rpc.ts), gövde: { "args": [...] }
 * - POST /api/import          CSV/JSON veri içe aktarma (src/core/importer.ts)
 * - GET  /api/nasa/donki      NASA DONKI uzay havası (30 dk önbellek, internet yoksa gömülü anlık görüntü)
 * - GET  /api/nasa/epic       NASA EPIC Dünya fotoğrafları (aynı şekilde)
 *
 * Veritabanı yolu VITALIS_DB ortam değişkeniyle değişir (testlerde ":memory:"). API anahtarları yalnızca sunucuda,
 * ortam değişkenlerinde tutulur; dil modeli bağlantısı da buraya eklenecek.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_BODY = 2 * 1024 * 1024

interface Shared {
  store: SqliteStore
  dbPath: string
  cache: Map<string, { at: number; data: unknown }>
}

/** Vite yeniden yüklemelerinde aynı veritabanı bağlantısı kullanılır; motor ise kodla birlikte yeniden kurulur */
const g = globalThis as unknown as { __vitalisShared?: Shared }
let engine: Engine | null = null

export function state(): Shared & { engine: Engine } {
  if (!g.__vitalisShared) {
    const dbPath = process.env.VITALIS_DB ?? join(ROOT, 'data', 'vitalis.db')
    if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
    g.__vitalisShared = { store: new SqliteStore(dbPath), dbPath, cache: new Map() }
  }
  // Sunucu motoru: bütün istemciler bu veriyi paylaşır (acil yardım isteği diğer mürettebata buradan ulaşır)
  engine ??= new Engine(g.__vitalisShared.store, Date.now, { transport: 'server' })
  return { ...g.__vitalisShared, engine }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY) throw new RpcError('istek çok büyük')
    chunks.push(c as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

/** Canlı NASA verisi; erişilemezse gömülü anlık görüntü (public/data/nasa) */
async function nasa(name: 'donki' | 'epic'): Promise<unknown> {
  const st = state()
  const hit = st.cache.get(name)
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data
  let data: unknown
  try {
    data = name === 'donki' ? await liveDonki() : await liveEpic()
  } catch {
    data = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'nasa', `${name}.json`), 'utf8'))
  }
  st.cache.set(name, { at: Date.now(), data })
  return data
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
async function getJson(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!r.ok) throw new Error(String(r.status))
  const t = await r.text()
  return t ? JSON.parse(t) : []
}

/** DONKI aynı olayı birden çok kez döndürebilir: olay kimliğine göre tekilleştirilir */
const unique = <T extends { id: unknown }>(list: T[]): T[] => [...new Map(list.map((e) => [e.id, e])).values()]

async function liveDonki() {
  const now = Date.now()
  const base = 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get'
  const range = `startDate=${iso(now - 59 * 86_400_000)}&endDate=${iso(now)}`
  const [sep, flr, gst] = await Promise.all([getJson(`${base}/SEP?${range}`), getJson(`${base}/FLR?${range}`), getJson(`${base}/GST?${range}`)])
  // Son bir yılın SEP olayları anlık görüntüde var; canlı veride yalnızca son 60 gün
  const snapshot = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'nasa', 'donki.json'), 'utf8')) as { sep: { id: string }[] }
  type Ev = Record<string, unknown> & { instruments?: { displayName: string }[]; allKpIndex?: { kpIndex: number }[] }
  const liveSep = (sep as Ev[]).map((e) => ({ id: e.sepID, time: e.eventTime, instruments: (e.instruments ?? []).map((i) => i.displayName), link: e.link }))
  const ids = new Set(liveSep.map((e) => e.id))
  return {
    retrieved: new Date(now).toISOString(),
    source: 'NASA CCMC DONKI',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    live: true,
    sep: unique([...snapshot.sep.filter((e) => !ids.has(e.id)), ...liveSep]),
    flr: unique((flr as Ev[]).map((e) => ({ id: e.flrID, time: e.peakTime ?? e.beginTime, classType: e.classType, region: e.activeRegionNum, link: e.link }))),
    gst: unique((gst as Ev[]).map((e) => ({ id: e.gstID, time: e.startTime, kp: Math.max(0, ...(e.allKpIndex ?? []).map((k) => k.kpIndex)), link: e.link }))),
  }
}

async function liveEpic() {
  const list = (await getJson('https://epic.gsfc.nasa.gov/api/natural')) as { image: string; date: string; caption: string; centroid_coordinates: { lat: number; lon: number } }[]
  return {
    retrieved: new Date().toISOString(),
    source: 'NASA EPIC (DSCOVR)',
    url: 'https://epic.gsfc.nasa.gov/about/api',
    live: true,
    images: list.map((e) => {
      const [y, m, d] = e.date.split(' ')[0].split('-')
      return {
        image: e.image,
        date: e.date,
        caption: e.caption,
        lat: e.centroid_coordinates.lat,
        lon: e.centroid_coordinates.lon,
        url: `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/jpg/${e.image}.jpg`,
        thumb: `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/thumbs/${e.image}.jpg`,
      }
    }),
  }
}

/** /api ile başlayan istekleri karşılar; değilse false döner (sonraki katmana geçilir) */
export async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return false
  try {
    if (url.pathname === '/api/health') {
      const st = state()
      send(res, 200, { ok: true, mode: 'server', db: st.dbPath === ':memory:' ? 'memory' : 'sqlite' })
      return true
    }
    if (url.pathname.startsWith('/api/nasa/')) {
      const name = url.pathname.slice('/api/nasa/'.length)
      if (name !== 'donki' && name !== 'epic') return send(res, 404, { error: 'yok' }), true
      send(res, 200, await nasa(name))
      return true
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'yöntem' })
      return true
    }
    const body = (await readBody(req)) as { args?: unknown[] } & Partial<ImportRequest>
    if (url.pathname === '/api/import') {
      send(res, 200, importData(state().engine, body as ImportRequest))
      return true
    }
    const m = /^\/api\/rpc\/([A-Za-z]+)$/.exec(url.pathname)
    if (!m || !isRpcName(m[1])) {
      send(res, 404, { error: 'bilinmeyen işlem' })
      return true
    }
    const result = dispatch(state().engine, m[1], Array.isArray(body.args) ? body.args : [])
    send(res, 200, { result: result ?? null })
  } catch (e) {
    send(res, e instanceof RpcError || e instanceof SyntaxError ? 400 : 500, { error: e instanceof Error ? e.message : 'hata' })
  }
  return true
}

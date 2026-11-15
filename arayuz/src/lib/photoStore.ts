import { PHOTO_LIMITS, type PhotoLimits } from '../core/gallery'

/*
 * Kişisel fotoğraflar (docs/wellbeing GAL, "Fotoğraflarım"): yalnızca bu tarayıcıda, IndexedDB'de ikili veri (Blob) olarak
 * saklanır. localStorage'a ya da base64 olarak yazılmaz, sunucuya ya da başka bir kişiye gönderilmez, incelenmez.
 * Dosya olduğu gibi saklanır: içindeki üst bilgi (ör. çekim yeri) silinmez, şifrelenmez.
 * Uygulamanın veri katmanı (core/store) belge (JSON) içindir; ikili veri için aynı ayrımla (astronota göre kayıt, atomik
 * yazma, hata olursa önceki hal) bu küçük katman kullanılır.
 */

export interface PhotoMeta {
  id: string
  astronaut: string
  name: string
  type: string
  size: number
  addedAt: number
  width: number
  height: number
  favorite: boolean
}
export interface PhotoRecord extends PhotoMeta {
  blob: Blob
}

export type PhotoStoreError = 'quota' | 'unavailable' | 'notFound'
export class PhotoStoreFailure extends Error {
  reason: PhotoStoreError
  constructor(reason: PhotoStoreError) {
    super(reason)
    this.reason = reason
  }
}

export interface PhotoStore {
  list(astronaut: string): Promise<PhotoRecord[]>
  /** Atomik: yer yetmezse hiçbir şey yazılmaz, var olan fotoğraflar korunur */
  add(record: PhotoRecord): Promise<void>
  remove(astronaut: string, id: string): Promise<void>
  setFavorite(astronaut: string, id: string, favorite: boolean): Promise<void>
}

/* ---------- Doğrulama ---------- */

export type PhotoError = 'type' | 'size' | 'empty' | 'count' | 'corrupt'

/** Dosyanın ilk baytlarındaki imzadan gerçek türü bulur (uzantıya ya da tarayıcının bildirdiği türe güvenilmez) */
export function sniffType(head: Uint8Array): PhotoLimits['types'][number] | null {
  const b = (i: number) => head[i]
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg'
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'image/png'
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  return null
}

async function readHead(blob: Blob, n = 16): Promise<Uint8Array> {
  const part = blob.slice(0, n)
  if (typeof part.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer())
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer))
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(part)
  })
}

/** Tarayıcıda görüntüyü çözer; çözülemezse dosya bozuktur */
export async function decodeImage(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob)
    const size = { width: bmp.width, height: bmp.height }
    bmp.close()
    return size
  }
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('decode'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function validatePhoto(
  file: Blob,
  { count, limits = PHOTO_LIMITS, decode = decodeImage }: { count: number; limits?: PhotoLimits; decode?: (b: Blob) => Promise<{ width: number; height: number }> },
): Promise<{ ok: true; type: string; width: number; height: number } | { ok: false; error: PhotoError }> {
  if (count >= limits.maxCount) return { ok: false, error: 'count' }
  if (file.size === 0) return { ok: false, error: 'empty' }
  if (file.size > limits.maxBytes) return { ok: false, error: 'size' }
  let type: string | null
  try {
    type = sniffType(await readHead(file))
  } catch {
    return { ok: false, error: 'corrupt' }
  }
  if (!type || !(limits.types as readonly string[]).includes(type)) return { ok: false, error: 'type' }
  try {
    const { width, height } = await decode(file)
    if (!(width > 0 && height > 0)) return { ok: false, error: 'corrupt' }
    return { ok: true, type, width, height }
  } catch {
    return { ok: false, error: 'corrupt' }
  }
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'vitalis-photos'
const STORE = 'photos'

const isQuota = (e: unknown) => e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new PhotoStoreFailure('unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const os = req.result.createObjectStore(STORE, { keyPath: 'id' })
      os.createIndex('astronaut', 'astronaut')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new PhotoStoreFailure('unavailable'))
  })
}

/** Tek işlem: tamamlanınca çözülür; iptal olursa (ör. kota) hiçbir değişiklik kalmaz */
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (os: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    let result: T | undefined
    let t: IDBTransaction
    try {
      t = db.transaction(STORE, mode)
    } catch {
      return reject(new PhotoStoreFailure('unavailable'))
    }
    const req = run(t.objectStore(STORE))
    if (req) req.onsuccess = () => (result = req.result)
    t.oncomplete = () => resolve(result)
    const fail = () => reject(new PhotoStoreFailure(isQuota(t.error) ? 'quota' : 'unavailable'))
    t.onerror = fail
    t.onabort = fail
  })
}

export function indexedDbPhotoStore(): PhotoStore {
  let db: Promise<IDBDatabase> | null = null
  const get = () => (db ??= openDb().catch((e) => ((db = null), Promise.reject(e))))
  return {
    async list(astronaut) {
      const all = (await tx<PhotoRecord[]>(await get(), 'readonly', (os) => os.index('astronaut').getAll(astronaut))) ?? []
      return all.sort((a, b) => b.addedAt - a.addedAt)
    },
    async add(record) {
      await tx(await get(), 'readwrite', (os) => os.add(record))
    },
    async remove(astronaut, id) {
      const d = await get()
      const rec = await tx<PhotoRecord>(d, 'readonly', (os) => os.get(id))
      if (!rec || rec.astronaut !== astronaut) throw new PhotoStoreFailure('notFound')
      await tx(d, 'readwrite', (os) => os.delete(id))
    },
    async setFavorite(astronaut, id, favorite) {
      const d = await get()
      const rec = await tx<PhotoRecord>(d, 'readonly', (os) => os.get(id))
      if (!rec || rec.astronaut !== astronaut) throw new PhotoStoreFailure('notFound')
      await tx(d, 'readwrite', (os) => os.put({ ...rec, favorite }))
    },
  }
}

/** Bellekte tutan kayıt (testler; kota hatası taklit edilebilir) */
export function memoryPhotoStore(opts: { quotaBytes?: number } = {}): PhotoStore & { records: Map<string, PhotoRecord> } {
  const records = new Map<string, PhotoRecord>()
  const used = () => [...records.values()].reduce((n, r) => n + r.size, 0)
  return {
    records,
    async list(astronaut) {
      return [...records.values()].filter((r) => r.astronaut === astronaut).sort((a, b) => b.addedAt - a.addedAt)
    },
    async add(record) {
      if (opts.quotaBytes !== undefined && used() + record.size > opts.quotaBytes) throw new PhotoStoreFailure('quota')
      records.set(record.id, record)
    },
    async remove(astronaut, id) {
      if (records.get(id)?.astronaut !== astronaut) throw new PhotoStoreFailure('notFound')
      records.delete(id)
    },
    async setFavorite(astronaut, id, favorite) {
      const r = records.get(id)
      if (!r || r.astronaut !== astronaut) throw new PhotoStoreFailure('notFound')
      records.set(id, { ...r, favorite })
    },
  }
}

let shared: PhotoStore | null = null
/** Uygulamanın paylaşılan fotoğraf kaydı */
export const defaultPhotoStore = () => (shared ??= indexedDbPhotoStore())

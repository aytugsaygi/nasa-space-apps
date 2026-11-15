import { Engine } from '../core/engine'
import { importData, type ImportRequest, type ImportResult } from '../core/importer'
import { dispatch, type RpcArgs, type RpcName, type RpcResult } from '../core/rpc'
import { MemoryStore, type Doc } from '../core/store'

/*
 * Arayüzün veri katmanı. Sunucu (server/api.ts) çalışıyorsa her işlem ona gider ve veriler SQLite'ta tutulur.
 * Sunucuya ulaşılamazsa (ör. dosya olarak açılmış demo, internetsiz sunum) aynı çekirdek motor tarayıcıda çalışır ve
 * kayıtlar localStorage'da tutulur. Arayüz iki durumu da aynı şekilde kullanır.
 * Testlerde ?backend=local ile her tarayıcı kendi verisiyle başlar.
 */

export type BackendMode = 'server' | 'local'

export interface Backend {
  mode: BackendMode
  call<K extends RpcName>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>>
  nasa<T = unknown>(name: 'donki' | 'epic' | 'osdr-blood'): Promise<T>
  importData(req: ImportRequest): Promise<ImportResult>
}

const LOCAL_KEY = 'vitalis.db'

/** localStorage'a yazan kayıt (yazmalar kısa bir gecikmeyle toplanır) */
class LocalStore extends MemoryStore {
  private timer = 0
  constructor() {
    super()
    try {
      const raw = localStorage.getItem(LOCAL_KEY)
      if (raw) this.load(JSON.parse(raw) as Record<string, Doc[]>)
    } catch {
      /* Bozuk kayıt: boş başlanır */
    }
    // Sayfa kapanırken ya da yenilenirken bekleyen (gecikmeli) yazma hemen yapılır; yoksa son değişiklik kaybolabilir
    window.addEventListener('pagehide', () => {
      try {
        this.flush()
      } catch {
        /* Depolama doluysa ya da kapalıysa yapılacak bir şey yok */
      }
    })
  }
  protected changed() {
    clearTimeout(this.timer)
    this.timer = window.setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(this.dump()))
      } catch {
        /* Depolama doluysa ya da kapalıysa yalnızca bu oturumda tutulur */
      }
    }, 150)
  }
  /** Hemen yazar; yazılamazsa hata atar (kesin kayıtlar, ör. check-in, bununla doğrulanır) */
  flush() {
    clearTimeout(this.timer)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(this.dump()))
  }
}

async function staticNasa<T>(name: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/nasa/${name}.json`)
  if (!r.ok) throw new Error(String(r.status))
  return (await r.json()) as T
}

class LocalBackend implements Backend {
  mode: BackendMode = 'local'
  // Tarayıcı motoru: veri yalnızca bu tarayıcıda; acil yardım onayları "yerel demo" olarak işaretlenir
  private engine = new Engine(new LocalStore(), Date.now, { transport: 'local' })
  async call<K extends RpcName>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
    return structuredClone(dispatch(this.engine, name, args as unknown[]))
  }
  nasa<T>(name: 'donki' | 'epic' | 'osdr-blood') {
    return staticNasa<T>(name)
  }
  async importData(req: ImportRequest) {
    return importData(this.engine, req)
  }
}

class HttpBackend implements Backend {
  mode: BackendMode = 'server'
  async call<K extends RpcName>(name: K, ...args: RpcArgs<K>): Promise<RpcResult<K>> {
    const r = await fetch(`/api/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args }) })
    const body = (await r.json()) as { result?: RpcResult<K>; error?: string }
    if (!r.ok) throw new Error(body.error ?? String(r.status))
    return body.result as RpcResult<K>
  }
  async nasa<T>(name: 'donki' | 'epic' | 'osdr-blood') {
    // Kan verisi gömülüdür; uzay havası ve Dünya görüntüleri sunucudan canlı gelir
    if (name === 'osdr-blood') return staticNasa<T>(name)
    try {
      const r = await fetch(`/api/nasa/${name}`)
      if (r.ok) return (await r.json()) as T
    } catch {
      /* Gömülü anlık görüntüye dönülür */
    }
    return staticNasa<T>(name)
  }
  async importData(req: ImportRequest) {
    const r = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
    return (await r.json()) as ImportResult
  }
}

/** Sunucu varsa ona, yoksa tarayıcıdaki motora bağlanır */
export async function connect(): Promise<Backend> {
  const forced = new URLSearchParams(location.search).get('backend')
  if (forced === 'local') return new LocalBackend()
  try {
    const r = await fetch('/api/health', { signal: AbortSignal.timeout(1500) })
    if (r.ok && ((await r.json()) as { ok?: boolean }).ok) return new HttpBackend()
  } catch {
    /* Sunucu yok */
  }
  return new LocalBackend()
}

/** Birim testleri ve bileşen testleri için: tarayıcı motoru */
export function localBackend(): Backend {
  return new LocalBackend()
}

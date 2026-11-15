/*
 * Kayıt katmanı: belge koleksiyonları. İki uygulaması var:
 * - Sunucu: SQLite (server/db.ts)
 * - Tarayıcı yedeği: localStorage (src/data/localStore.ts), sunucuya ulaşılamazsa
 * Çekirdek motor (engine.ts) yalnızca bu arayüzü bilir; hangi kayıt yerinin kullanıldığı onu etkilemez.
 */

export type Collection =
  | 'measurements'
  | 'scenarios'
  | 'complaints'
  | 'journal'
  | 'moods'
  | 'water'
  | 'programs'
  | 'tasks'
  | 'taskDone'
  | 'messages'
  | 'seen'
  | 'chats'
  | 'imports'
  | 'profiles'
  | 'meta'
  | 'checkins'
  | 'checkinMeta'
  | 'assists'
  | 'breathingSessions'
  | 'mindSessions'
  | 'galleryFavorites'

export const COLLECTIONS: Collection[] = ['measurements', 'scenarios', 'complaints', 'journal', 'moods', 'water', 'programs', 'tasks', 'taskDone', 'messages', 'seen', 'chats', 'imports', 'profiles', 'meta', 'checkins', 'checkinMeta', 'assists', 'breathingSessions', 'galleryFavorites', 'mindSessions']

export interface Doc {
  id: string
  /** Kaydın sahibi astronot ('*' bütün mürettebat için ortak kayıt) */
  astronaut: string
  ts: number
}

export interface Store {
  list<T extends Doc>(collection: Collection, astronaut?: string): T[]
  get<T extends Doc>(collection: Collection, id: string): T | null
  put<T extends Doc>(collection: Collection, doc: T): void
  remove(collection: Collection, id: string): void
  /** Bir koleksiyonu (ya da hepsini) temizler */
  clear(collection?: Collection): void
  /**
   * Bekleyen yazmaları kalıcı kayda hemen yazar; yazılamazsa hata atar. Yazmaları geciktiren kayıt yerleri (tarayıcıdaki
   * localStorage) uygular. Kesin sonuçlar (ör. check-in) bununla doğrulanır: kalıcı yazılamayan kayıt kesinleşmez.
   */
  flush?(): void
}

/** Bellekte tutulan kayıt (testler ve tarayıcı yedeğinin temeli) */
export class MemoryStore implements Store {
  protected data = new Map<Collection, Map<string, Doc>>()

  protected bucket(c: Collection) {
    let b = this.data.get(c)
    if (!b) {
      b = new Map()
      this.data.set(c, b)
    }
    return b
  }

  list<T extends Doc>(collection: Collection, astronaut?: string): T[] {
    const all = [...this.bucket(collection).values()] as T[]
    const out = astronaut ? all.filter((d) => d.astronaut === astronaut || d.astronaut === '*') : all
    return out.sort((a, b) => a.ts - b.ts)
  }

  get<T extends Doc>(collection: Collection, id: string): T | null {
    return (this.bucket(collection).get(id) as T | undefined) ?? null
  }

  put<T extends Doc>(collection: Collection, doc: T): void {
    this.bucket(collection).set(doc.id, structuredClone(doc))
    this.changed()
  }

  remove(collection: Collection, id: string): void {
    this.bucket(collection).delete(id)
    this.changed()
  }

  clear(collection?: Collection): void {
    if (collection) this.data.delete(collection)
    else this.data.clear()
    this.changed()
  }

  /** Değişiklik sonrası (kalıcı kayıt için alt sınıflar kullanır) */
  protected changed() {}

  /** Bütün kayıtların düz hali (localStorage'a yazmak için) */
  dump(): Record<string, Doc[]> {
    const out: Record<string, Doc[]> = {}
    for (const [c, b] of this.data) out[c] = [...b.values()]
    return out
  }

  load(raw: Record<string, Doc[]>) {
    this.data.clear()
    for (const [c, docs] of Object.entries(raw)) {
      if (!Array.isArray(docs)) continue
      const b = this.bucket(c as Collection)
      for (const d of docs) if (d && typeof d.id === 'string') b.set(d.id, d)
    }
  }
}

let counter = 0
/** Benzersiz kimlik (zaman + sayaç + rastgele) */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

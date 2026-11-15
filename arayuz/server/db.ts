import { DatabaseSync } from 'node:sqlite'
import type { Collection, Doc, Store } from '../src/core/store'

/*
 * Sunucudaki kalıcı kayıt: SQLite (Node'un yerleşik node:sqlite modülü, ek kurulum gerekmez).
 * Bütün koleksiyonlar tek tabloda tutulur; belge JSON olarak saklanır, sık sorgulanan alanlar ayrı sütundadır.
 * Zamanlar UTC milisaniye olarak saklanır (VM-01).
 */
export class SqliteStore implements Store {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        astronaut TEXT NOT NULL,
        ts INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS docs_by_owner ON docs (collection, astronaut, ts);
    `)
  }

  list<T extends Doc>(collection: Collection, astronaut?: string): T[] {
    const rows = astronaut
      ? this.db.prepare('SELECT data FROM docs WHERE collection = ? AND (astronaut = ? OR astronaut = ?) ORDER BY ts').all(collection, astronaut, '*')
      : this.db.prepare('SELECT data FROM docs WHERE collection = ? ORDER BY ts').all(collection)
    return rows.map((r) => JSON.parse(String((r as { data: string }).data)) as T)
  }

  get<T extends Doc>(collection: Collection, id: string): T | null {
    const row = this.db.prepare('SELECT data FROM docs WHERE collection = ? AND id = ?').get(collection, id) as { data: string } | undefined
    return row ? (JSON.parse(String(row.data)) as T) : null
  }

  put<T extends Doc>(collection: Collection, doc: T): void {
    this.db.prepare('INSERT OR REPLACE INTO docs (collection, id, astronaut, ts, data) VALUES (?, ?, ?, ?, ?)').run(collection, doc.id, doc.astronaut, Math.round(doc.ts), JSON.stringify(doc))
  }

  remove(collection: Collection, id: string): void {
    this.db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?').run(collection, id)
  }

  clear(collection?: Collection): void {
    if (collection) this.db.prepare('DELETE FROM docs WHERE collection = ?').run(collection)
    else this.db.exec('DELETE FROM docs')
  }

  close() {
    this.db.close()
  }
}

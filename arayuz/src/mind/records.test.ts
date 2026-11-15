// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Engine } from '../core/engine'
import type { JournalDoc } from '../core/model'
import { MemoryStore } from '../core/store'
import { buildRecords } from './records'

/* Kayıtlarım listesinin kuralları (docs/wellbeing CI-11): birleştirme, sıralama, filtreler */

const utc = (d: number, h: number, mi = 0) => Date.UTC(2026, 10, d, h, mi)

function setup() {
  let now = utc(12, 9)
  const engine = new Engine(new MemoryStore(), () => now)
  return { engine, set: (t: number) => (now = t) }
}

describe('Kayıtlarım listesi', () => {
  it('kayıtlar gerçek kayıt anına göre en yeni önce sıralanır; günlük ve check-in ayrı türdür', () => {
    const { engine, set } = setup()
    engine.submitCheckin('yildiz', '2026-11-12:morning', { mood: 'low' }, 'check-in notu')
    set(utc(12, 14))
    engine.addJournal('yildiz', 'günlük notu')
    set(utc(12, 15))
    const all = buildRecords(engine.wellbeingCheckins('yildiz', 2), engine.journal('yildiz'), 'all')
    expect(all.slice(0, 2).map((r) => r.kind)).toEqual(['journal', 'checkin'])
    for (let i = 1; i < all.length; i++) expect(all[i - 1].at).toBeGreaterThanOrEqual(all[i].at)
    // Check-in notu günlükte görünmez; günlük notu check-in'e eklenmez
    expect(all.filter((r) => r.kind === 'journal').map((r) => r.kind === 'journal' && r.doc.text)).toEqual(['günlük notu'])
  })

  it('açık, ertelenmiş ve açılmamış pencere kayıt değildir; atlanan ve yanıtsız kapanan ayrı ayrı listelenir', () => {
    const { engine, set } = setup()
    engine.skipCheckin('yildiz', '2026-11-12:morning')
    set(utc(12, 21))
    engine.deferCheckin('yildiz', '2026-11-12:evening')
    const items = buildRecords(engine.wellbeingCheckins('yildiz', 1), [], 'checkins')
    expect(items.map((r) => r.kind === 'checkin' && `${r.view.window}:${r.view.outcome}`)).toEqual(['midday:expired', 'morning:skipped'])
  })

  it('filtreler: Tümü, Check-in\'ler, Günlük', () => {
    const { engine } = setup()
    engine.submitCheckin('yildiz', '2026-11-12:morning', { energy: 'tired' }, '')
    engine.addJournal('yildiz', 'not')
    const views = engine.wellbeingCheckins('yildiz', 1)
    const journal = engine.journal('yildiz')
    expect(new Set(buildRecords(views, journal, 'all').map((r) => r.kind))).toEqual(new Set(['checkin', 'journal']))
    expect(buildRecords(views, journal, 'checkins').every((r) => r.kind === 'checkin')).toBe(true)
    expect(buildRecords(views, journal, 'journal').map((r) => r.kind)).toEqual(['journal'])
    expect(buildRecords([], [], 'journal')).toEqual([])
  })

  it('gece yarısından sonra kaydedilen akşam check-in\'i kendi görev tarihini, gerçek kayıt anını taşır', () => {
    const { engine, set } = setup()
    set(utc(13, 1, 30))
    engine.submitCheckin('yildiz', '2026-11-12:evening', { mood: 'okay' }, '')
    const item = buildRecords(engine.wellbeingCheckins('yildiz', 1), [], 'checkins')[0]
    expect(item).toMatchObject({ kind: 'checkin', date: '2026-11-12', at: utc(13, 1, 30) })
  })

  it('günlük notunun görev tarihi görev saat dilimine göredir', () => {
    const doc: JournalDoc = { id: 'j', astronaut: 'yildiz', ts: utc(12, 23, 30), text: 'x', private: true }
    expect(buildRecords([], [doc], 'all', 'Europe/Istanbul')[0].date).toBe('2026-11-13')
    expect(buildRecords([], [doc], 'all', 'UTC')[0].date).toBe('2026-11-12')
  })
})

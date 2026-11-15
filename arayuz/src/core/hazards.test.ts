import { describe, expect, it } from 'vitest'
import { INDICATORS } from './catalog'
import { DAY, HOUR, MISSION } from './crew'
import { Engine } from './engine'
import { HAZARDS, hazardsFor } from './hazards'
import { SOURCES } from './sources'
import { MemoryStore } from './store'

describe('5 tehlike', () => {
  it("NASA'nın beş tehlikesi, her biri kayıtlı bir kaynağa ve var olan göstergelere bağlı", () => {
    expect(HAZARDS.map((h) => h.id)).toEqual(['radiation', 'isolation', 'distance', 'gravity', 'hostile'])
    for (const h of HAZARDS) {
      expect(SOURCES[h.source]).toBeDefined()
      expect(h.url).toMatch(/^https:\/\/www\.nasa\.gov\/hrp\/hazard-/)
      expect(h.name.tr && h.name.en && h.desc.tr && h.desc.en).toBeTruthy()
      for (const id of h.indicators) expect(INDICATORS[id]).toBeDefined()
    }
    expect(hazardsFor('radiation').map((h) => h.id)).toEqual(['radiation'])
    expect(hazardsFor('co2').map((h) => h.id)).toEqual(['hostile'])
  })
})

describe('bir haftadır geçmeyen şikayet', () => {
  it('hafif şikayet bir hafta sürerse dikkat uyarısı olur ve hekime bildirilir (NASA: bir haftadan uzun süren olay kayda değer)', () => {
    let now = MISSION.start - (MISSION.start % DAY) + 142 * DAY + 15 * HOUR
    const engine = new Engine(new MemoryStore(), () => now)
    engine.tick('yildiz')
    const doc = engine.addComplaint('yildiz', { region: 'sirt', side: 'both', muscles: [], bones: [], symptom: 'pain', severity: 3, note: '', origin: 'hologram' })
    engine.tick('yildiz')
    now += 6 * DAY
    expect(engine.tick('yildiz').fresh.some((f) => f.key === `complaint:${doc.id}:w`)).toBe(false)
    now += 2 * DAY
    const week = engine.tick('yildiz').fresh.find((f) => f.key === `complaint:${doc.id}:w`)
    expect(week?.level).toBe('dikkat')
    expect(week?.notifyDoctor).toBe(true)
    expect(week?.sources).toContain('immuneEB')
  })
})

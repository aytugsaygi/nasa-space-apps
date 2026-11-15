import { describe, expect, it } from 'vitest'
import { INDICATOR_IDS, INDICATORS } from './catalog'
import { basisKind, DECISIONS, isNasaSource, NASA_DATASETS, nasaCounts, thresholdRows } from './nasaMap'
import { SOURCE_LIST, SOURCES } from './sources'

describe('NASA verisi haritası', () => {
  it('her bandın dayanağı bir kaynağa ya da Health Atlas kuralına çözülür', () => {
    for (const id of INDICATOR_IDS) {
      for (const b of [...INDICATORS[id].bands, ...(INDICATORS[id].bands2 ?? [])]) {
        expect(b.basis === 'vitalis' || SOURCES[b.basis]).toBeTruthy()
      }
    }
  })

  it('eşik satırları katalogdan üretilir: bant sayıları kataloğa eşit, her gösterge bir kez', () => {
    const rows = thresholdRows()
    expect(rows.map((r) => r.indicator)).toEqual(INDICATOR_IDS)
    for (const r of rows) {
      const ind = INDICATORS[r.indicator]
      expect(r.groups.reduce((n, g) => n + g.bands, 0)).toBe(ind.bands.length + (ind.bands2?.length ?? 0))
    }
  })

  it('NASA sayıları elle değil koddan hesaplanır', () => {
    const c = nasaCounts()
    const expectedIndicators = INDICATOR_IDS.filter((id) => [...INDICATORS[id].bands, ...(INDICATORS[id].bands2 ?? [])].some((b) => basisKind(b.basis) === 'nasa')).length
    expect(c.nasaIndicators).toBe(expectedIndicators)
    expect(c.indicators).toBe(INDICATOR_IDS.length)
    expect(c.sources).toBe(SOURCE_LIST.length)
    expect(c.nasaSources).toBe(SOURCE_LIST.filter((s) => isNasaSource(s.id)).length)
    expect(c.nasaBands).toBeGreaterThan(0)
    expect(c.nasaBands).toBeLessThanOrEqual(c.bands)
  })

  it('uyku eşiği NASA belgesine (TB-041), Health Atlas kuralı ayrı etiketlenir', () => {
    const sleep = thresholdRows().find((r) => r.indicator === 'sleep')!
    expect(sleep.groups.find((g) => g.kind === 'nasa')?.sources).toContain('tb041')
    expect(sleep.groups.some((g) => g.kind === 'rule')).toBe(true)
  })

  it('karar satırlarının kaynakları listede var; deneyim satırları ayrı', () => {
    for (const d of DECISIONS) {
      for (const s of d.sources) expect(SOURCES[s], `${d.id}: ${s}`).toBeDefined()
      expect(d.sources.length + (d.links?.length ?? 0)).toBeGreaterThan(0)
    }
    expect(DECISIONS.filter((d) => d.type === 'experience').map((d) => d.id)).toEqual(['epic'])
    for (const s of NASA_DATASETS) expect(SOURCES[s].kind).toBe('nasaData')
  })
})

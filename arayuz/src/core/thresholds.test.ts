import { describe, expect, it } from 'vitest'
import { delayRangeText } from '../mind/checkinFormat'
import { boneEstimate } from './analysis'
import { evaluate } from './catalog'
import { COMM_DELAY_MS, COMM_DELAY_RANGE_MS } from './engine'

/* Kaynaklardan doğrulanan eşikler (14 Kasım 2026 denetimi) */
describe('kaynaklı eşikler', () => {
  it('uyku: 7 sa ve üstü normal, 6-7 sa dikkat (TB-041: yetişkin 7-9 sa)', () => {
    expect(evaluate('sleep', 7).status).toBe('normal')
    expect(evaluate('sleep', 6.5)).toMatchObject({ status: 'dikkat', basis: 'tb041' })
    expect(evaluate('sleep', 5).status).toBe('dikkat')
    expect(evaluate('sleep', 3.5).status).toBe('kritik')
  })

  it('radyasyon: günlük 1,3 mSv tasarım sınırı (TB-020), güneş olayı ~9 mSv dikkat kalır', () => {
    expect(evaluate('radiation', 0.5)).toMatchObject({ status: 'normal', basis: 'tb020' })
    expect(evaluate('radiation', 1.3).status).toBe('dikkat')
    expect(evaluate('radiation', 9.1).status).toBe('dikkat')
    expect(evaluate('radiation', 12).status).toBe('kritik')
  })

  it('CO₂: 2,3 mmHg üstü hâlâ normal ama etiket belirti bildirildiğini söyler (co2Ops)', () => {
    expect(evaluate('co2', 2).basis).toBe('tb004')
    expect(evaluate('co2', 2.6)).toMatchObject({ status: 'normal', basis: 'co2Ops' })
    expect(evaluate('co2', 3.2).status).toBe('dikkat')
  })

  it('su: günde en az 2 L (nutritionBands Req. 6)', () => {
    expect(evaluate('water', 1900)).toMatchObject({ status: 'dikkat', basis: 'nutritionBands' })
    expect(evaluate('water', 2000).status).toBe('normal')
  })

  it('kemik: egzersizsiz ayda %1,25 (%1-1,5 aralığının ortası); egzersiz kaybı yavaşlatır ama durdurmaz', () => {
    const b = boneEstimate(60, 1)
    expect(b.withoutExercisePct).toBeCloseTo(2.5)
    expect(b.estimatedLossPct).toBeGreaterThan(0)
    expect(b.estimatedLossPct).toBeLessThan(b.withoutExercisePct / 2)
  })

  it('Mars gecikmesi aralık olarak verilir; simülasyonun 12 dakikası bu aralıkta', () => {
    const range = COMM_DELAY_RANGE_MS.mars!
    expect(range[0]).toBeLessThanOrEqual(COMM_DELAY_MS.mars)
    expect(range[1]).toBeGreaterThanOrEqual(COMM_DELAY_MS.mars)
    expect(COMM_DELAY_RANGE_MS.iss).toBeUndefined()
    expect(delayRangeText(range, 'tr').replace(/\s/g, ' ')).toMatch(/^3.22 dakika$/)
    expect(delayRangeText(range, 'en').replace(/\s/g, ' ')).toMatch(/^3.22 minutes$/)
  })
})

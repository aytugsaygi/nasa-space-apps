import { describe, expect, it } from 'vitest'
import { BREATHING_SESSION_CONFIG, pacingPattern } from './breathing'
import { elapsedMs, frameAt, pauseClock, resumeClock, startClock } from './sessionClock'

/* Tek zaman kaynağı: etkin süre saatten hesaplanır, duraklatılan süre sayılmaz (docs/wellbeing BR-03) */
const pattern = pacingPattern(BREATHING_SESSION_CONFIG.pacing)

describe('oturum saati', () => {
  it('duraklatılan süre sayılmaz; sürdürünce kalan süre ve evre aynı kalır', () => {
    let c = startClock(1_000)
    c = pauseClock(c, 8_000)
    const before = frameAt(c, 8_000, 60_000, pattern)
    expect(before.elapsedMs).toBe(7_000)
    expect(frameAt(c, 500_000, 60_000, pattern)).toEqual(before)
    c = resumeClock(c, 500_000)
    expect(frameAt(c, 500_000, 60_000, pattern)).toEqual(before)
    expect(elapsedMs(c, 503_000)).toBe(10_000)
  })

  it('çift duraklatma ve çift sürdürme etkisizdir', () => {
    const c = pauseClock(startClock(0), 2_000)
    expect(pauseClock(c, 9_000)).toBe(c)
    const r = resumeClock(c, 3_000)
    expect(resumeClock(r, 6_000)).toBe(r)
  })

  it('süre, evre ve ölçek aynı andan türetilir; süre dolunca biter', () => {
    const c = startClock(0)
    const f = frameAt(c, 2_500, 60_000, pattern)
    expect(f.phase.phase).toBe('inhale')
    expect(f.remainingSeconds).toBe(58)
    expect(f.scale).toBeGreaterThanOrEqual(0.82)
    expect(f.scale).toBeLessThanOrEqual(1)
    expect(frameAt(c, 5_500, 60_000, pattern).phase.phase).toBe('exhale')
    const end = frameAt(c, 75_000, 60_000, pattern)
    expect(end).toMatchObject({ done: true, remainingMs: 0, elapsedMs: 60_000 })
  })
})

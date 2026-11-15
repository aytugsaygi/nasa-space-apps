import { describe, expect, it } from 'vitest'
import { BREATHING_SESSION_CONFIG, cycleSeconds, defaultSessionSettings, isValidSessionSettings, pacingPattern, PATTERNS, phaseAt, validateSessionConfig } from './breathing'

describe('nefes egzersizi', () => {
  it('tur süreleri: kutu 16 sn, 4-7-8 19 sn, dengeli 10 sn (dakikada 6 nefes)', () => {
    expect(cycleSeconds(PATTERNS.box)).toBe(16)
    expect(cycleSeconds(PATTERNS.relax)).toBe(19)
    expect(cycleSeconds(PATTERNS.even)).toBe(10)
  })

  it('kutu nefeste evreler sırayla gelir ve kalan saniye yukarı yuvarlanır', () => {
    expect(phaseAt(PATTERNS.box, 0)).toMatchObject({ phase: 'inhale', cycle: 1, remaining: 4 })
    expect(phaseAt(PATTERNS.box, 4.2)).toMatchObject({ phase: 'holdIn', remaining: 4 })
    expect(phaseAt(PATTERNS.box, 9)).toMatchObject({ phase: 'exhale', remaining: 3 })
    expect(phaseAt(PATTERNS.box, 15.5)).toMatchObject({ phase: 'holdOut', remaining: 1 })
    expect(phaseAt(PATTERNS.box, 16)).toMatchObject({ phase: 'inhale', cycle: 2 })
  })

  it('çember nefes alırken açılır, tutarken açık kalır, verirken kapanır', () => {
    const p = PATTERNS.relax
    expect(phaseAt(p, 0).openness).toBe(0)
    expect(phaseAt(p, 2).openness).toBeCloseTo(0.5, 5)
    expect(phaseAt(p, 6).openness).toBe(1)
    expect(phaseAt(p, 11 + 4).openness).toBeCloseTo(0.5, 5)
    expect(phaseAt(p, 18.99).openness).toBeLessThan(0.01)
  })

  it('negatif süre başlangıç kabul edilir', () => {
    expect(phaseAt(PATTERNS.even, -3)).toMatchObject({ phase: 'inhale', cycle: 1, remaining: 5 })
  })
})

describe('nefes molası yapılandırması (BR-01)', () => {
  it('yapılandırma geçerli; süreler 1, 3 ve 5 dakika, varsayılan 3 dakika', () => {
    expect(validateSessionConfig(BREATHING_SESSION_CONFIG)).toEqual([])
    expect(BREATHING_SESSION_CONFIG.durationsMin).toEqual([1, 3, 5])
    expect(BREATHING_SESSION_CONFIG.defaultDurationMin).toBe(3)
    expect(validateSessionConfig({ ...BREATHING_SESSION_CONFIG, defaultDurationMin: 2 })).toContain('defaultDuration')
    expect(validateSessionConfig({ ...BREATHING_SESSION_CONFIG, pacing: { ...BREATHING_SESSION_CONFIG.pacing, exhaleSeconds: 0 } })).toContain('pacing')
  })

  it('tempo nefes tutma içermez ve incelenmemiş prototip olarak işaretlidir', () => {
    expect(BREATHING_SESSION_CONFIG.pacing.reviewed).toBe(false)
    const steps = pacingPattern(BREATHING_SESSION_CONFIG.pacing).steps.map((s) => s.phase)
    expect(steps).toEqual(['inhale', 'exhale'])
  })

  it('açılış ayarları: ses ve geçiş tıkı kapalı; hareketi azaltma tercihi görünümü sabit yapar', () => {
    expect(defaultSessionSettings(false)).toEqual({ durationMin: 3, visual: 'animated', audio: 'silent', click: false })
    expect(defaultSessionSettings(true)).toEqual({ durationMin: 3, visual: 'still', audio: 'silent', click: false })
  })

  it('dört ortam sesi geçerlidir; geçersiz ayarlar reddedilir', () => {
    for (const audio of ['silent', 'waves', 'birds', 'fire', 'rain']) expect(isValidSessionSettings({ durationMin: 5, visual: 'still', audio, click: true })).toBe(true)
    expect(isValidSessionSettings({ durationMin: 5, visual: 'still', audio: 'whiteNoise', click: false })).toBe(false)
    expect(isValidSessionSettings({ durationMin: 2, visual: 'still', audio: 'silent', click: false })).toBe(false)
    expect(isValidSessionSettings({ durationMin: 3, visual: 'spin', audio: 'silent', click: false })).toBe(false)
    expect(isValidSessionSettings({ durationMin: 3, visual: 'still', audio: 'music', click: false })).toBe(false)
    expect(isValidSessionSettings({ durationMin: 3, visual: 'still', audio: 'silent' })).toBe(false)
    expect(isValidSessionSettings(null)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { CUPOLA_SESSIONS, formatCoords, placeAt, SESSION_MINUTES, SESSION_SPEEDS } from './wellbeing'

describe('Cupola seansları', () => {
  it('her seansın iki dilde adı, türü ve açıklaması; geçerli koordinatları vardır', () => {
    expect(CUPOLA_SESSIONS.map((s) => s.id)).toEqual(['sunrise', 'sahara', 'ocean', 'cityLights'])
    for (const s of CUPOLA_SESSIONS) {
      for (const text of [s.title, s.kind, s.description]) expect(text.tr && text.en && text.tr !== text.en).toBeTruthy()
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(s.sunLat)).toBeLessThanOrEqual(23.5)
      expect(Math.abs(s.lon)).toBeLessThanOrEqual(180)
    }
    expect([...SESSION_MINUTES]).toEqual([3, 5, 10])
    expect([...SESSION_SPEEDS]).toEqual([1, 8])
  })

  it('seanslar adlarına uygun yerden başlar', () => {
    const at = (id: string) => {
      const s = CUPOLA_SESSIONS.find((x) => x.id === id)!
      return placeAt(s.lat, s.lon, 'tr')
    }
    expect(at('sunrise')).toBe('Pasifik Okyanusu')
    expect(at('sahara')).toBe('Sahra Çölü')
    expect(at('ocean')).toBe('Hint Okyanusu')
    expect(at('cityLights')).toBe('Avrupa')
  })

  it('gün doğumu seansı gece tarafında, gündüz seansları gündüz tarafında başlar', () => {
    const rad = (d: number) => (d * Math.PI) / 180
    const cosAngle = (s: (typeof CUPOLA_SESSIONS)[number]) =>
      Math.sin(rad(s.lat)) * Math.sin(rad(s.sunLat)) + Math.cos(rad(s.lat)) * Math.cos(rad(s.sunLat)) * Math.cos(rad(s.lon - s.sunLon))
    const byId = Object.fromEntries(CUPOLA_SESSIONS.map((s) => [s.id, cosAngle(s)]))
    expect(byId.sunrise).toBeLessThan(0)
    expect(byId.cityLights).toBeLessThan(-0.5)
    expect(byId.sahara).toBeGreaterThan(0.5)
    expect(byId.ocean).toBeGreaterThan(0.5)
  })
})

describe('placeAt', () => {
  it('küçük ve belirgin yerler büyük bölgelerden önce gelir', () => {
    expect(placeAt(26, 31.2, 'tr')).toBe('Nil Vadisi')
    expect(placeAt(28, 86, 'en')).toBe('Himalayas')
    expect(placeAt(-75, 20, 'tr')).toBe('Antarktika')
  })

  it('boylam -180/180 sınırını aşsa da doğru bölgeyi bulur', () => {
    expect(placeAt(-25, 135 + 360, 'tr')).toBe('Avustralya')
    expect(placeAt(0, -170, 'en')).toBe('Pacific Ocean')
  })
})

describe('formatCoords', () => {
  it('yön harfleriyle ve dile göre ondalık ayırıcıyla yazar', () => {
    expect(formatCoords(18, 8, 'tr')).toBe('18,0° K · 8,0° D')
    expect(formatCoords(-22.35, -62, 'en')).toBe('22.4° S · 62.0° W')
    expect(formatCoords(0, 190, 'en')).toBe('0.0° N · 170.0° W')
  })
})

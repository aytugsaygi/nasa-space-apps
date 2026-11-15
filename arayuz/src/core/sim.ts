import type { IndicatorId } from './catalog'
import { CREW, DAY, HOUR, MISSION, dayStart, missionDay, type CrewId, type CrewMember } from './crew'
import type { ScenarioId } from './scenarios'

/*
 * Belirli (deterministik) simülatör: aynı astronot, gösterge ve zaman için her zaman aynı değeri üretir.
 * Simüle geçmiş saklanmaz, istendiğinde hesaplanır; veritabanı yalnızca gerçek olayları (elle girişler, içe aktarılan
 * veriler, senaryolar, şikayetler) tutar. Böylece 13 Kasım'da gelecek veriler simülasyonun yerine doğrudan geçer.
 *
 * Modelin dayandığı bilgiler (kaynaklar sources.ts'de):
 * - İstasyonda ortalama uyku ~6,1 saat; NASA 8,5 saat planlar (sleepStudy)
 * - Günde ortalama iki saat egzersiz (nasaExercise)
 * - Günde ~0,5 mSv radyasyon (tb020'deki referans analiz)
 * - Kabin CO₂ 1 saatlik ortalaması normalde 3 mmHg altında (tb004)
 */

export type PointSource = 'sim' | 'manual' | 'demo' | 'sensor' | `import:${string}`

export interface Point {
  t: number
  v: number
  /** İkinci değer (tansiyonda küçük tansiyon) */
  v2?: number
  source: PointSource
}

export interface ScenarioEvent {
  id: string
  astronaut: CrewId
  scenario: ScenarioId
  ts: number
}

/* ---------- Belirli gürültü ---------- */

function hash(a: number, b: number, c = 0, d = 0): number {
  let h = 2166136261 ^ Math.imul(a | 0, 374761393)
  h = Math.imul(h ^ (b | 0), 668265263)
  h = Math.imul(h ^ (c | 0), 2246822519)
  h = Math.imul(h ^ (d | 0), 3266489917)
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** -1..1 arası, x boyunca yumuşak değişen gürültü */
function smooth(seed: number, channel: number, x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash(seed, channel, i) * 2 - 1
  const b = hash(seed, channel, i + 1) * 2 - 1
  const u = (1 - Math.cos(f * Math.PI)) / 2
  return a + (b - a) * u
}

/** -1..1 arası, her tamsayı adımda bağımsız gürültü */
function jitter(seed: number, channel: number, i: number): number {
  return hash(seed, channel, i) * 2 - 1
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits

/* ---------- Gün planı (istasyon GMT saatini kullanır) ---------- */

/** Uyku 22:00-06:00, direnç egzersizi 09:30-10:30, aerobik 16:00-16:45 */
const hourOf = (t: number) => ((t % DAY) + DAY) % DAY / HOUR
const asleep = (h: number) => h >= 22 || h < 6
function exerciseLoad(h: number): number {
  const bump = (from: number, to: number) => (h >= from && h < to ? Math.sin(((h - from) / (to - from)) * Math.PI) : 0)
  return Math.max(bump(9.5, 10.5) * 0.8, bump(16, 16.75))
}

/** Planlı antrenman saatlerinde mi (istasyon saati, GMT): bu sırada nabzın yükselmesi beklenir */
export function exercisingAt(t: number): boolean {
  return exerciseLoad(hourOf(t)) > 0.1
}

/** Uyku saatlerinde mi (istasyon saati, GMT 22:00-06:00): bu sırada nabzın düşmesi beklenir */
export function asleepAt(t: number): boolean {
  return asleep(hourOf(t))
}

/** Görev ilerledikçe (ay cinsinden) */
const monthsIn = (t: number) => Math.max(0, (t - MISSION.start) / (30 * DAY))

/* ---------- Senaryo etkileri ---------- */

const active = (events: ScenarioEvent[], id: ScenarioId, t: number, durationMs: number) =>
  events.find((e) => e.scenario === id && t >= e.ts && t < e.ts + durationMs)

const sameDayAs = (events: ScenarioEvent[], id: ScenarioId, t: number) => events.find((e) => e.scenario === id && dayStart(e.ts) === dayStart(t) && t >= e.ts)

/* ---------- Gösterge modelleri ---------- */

function hrAt(m: CrewMember, t: number, events: ScenarioEvent[]): number {
  const h = hourOf(t)
  const seed = m.seed
  let v = m.baseline.hr + 0.25 * monthsIn(t) + smooth(seed, 1, t / (3 * HOUR)) * 3 + jitter(seed, 2, Math.floor(t / 60000)) * 1.2
  if (asleep(h)) v -= 9
  v += exerciseLoad(h) * 48
  v += m.traits.stress * 3 * Math.max(0, smooth(seed, 3, t / (8 * HOUR)))
  if (active(events, 'hrHigh', t, 0.5 * HOUR)) v = 112 + Math.abs(jitter(seed, 4, Math.floor(t / 20000))) * 6
  if (active(events, 'fever', t, 24 * HOUR)) v += 12
  if (active(events, 'bpLow', t, 8 * HOUR)) v += 14
  return v
}

function spo2At(m: CrewMember, t: number, events: ScenarioEvent[]): number {
  const h = hourOf(t)
  let v = m.baseline.spo2 + smooth(m.seed, 5, t / (2 * HOUR)) * 0.8 + jitter(m.seed, 6, Math.floor(t / 120000)) * 0.4
  if (asleep(h)) v -= 0.6
  const ev = active(events, 'spo2Low', t, 0.75 * HOUR)
  if (ev) v = 91 + jitter(m.seed, 7, Math.floor(t / 60000)) * 0.6
  return clamp(v, 50, 100)
}

function tempAt(m: CrewMember, t: number, events: ScenarioEvent[]): number {
  const h = hourOf(t)
  let v = m.baseline.temp + 0.25 * Math.sin(((h - 10) / 24) * 2 * Math.PI) + smooth(m.seed, 8, t / (4 * HOUR)) * 0.08
  v += exerciseLoad(h) * 0.35
  const ev = active(events, 'fever', t, 24 * HOUR)
  if (ev) v = 38.3 + Math.min(1, (t - ev.ts) / HOUR) * 0.2 + smooth(m.seed, 9, t / HOUR) * 0.1
  return v
}

function respAt(m: CrewMember, t: number): number {
  const h = hourOf(t)
  let v = m.baseline.resp + smooth(m.seed, 10, t / (2 * HOUR)) * 1.2
  if (asleep(h)) v -= 1.5
  v += exerciseLoad(h) * 9
  return v
}

function bpAt(m: CrewMember, day: number, events: ScenarioEvent[], t: number): [number, number] {
  const months = monthsIn(t)
  let sys = m.baseline.sys + m.traits.bpDrift * months + smooth(m.seed, 11, day / 5) * 4 + jitter(m.seed, 12, day) * 3
  let dia = m.baseline.dia + m.traits.bpDrift * 0.5 * months + smooth(m.seed, 13, day / 5) * 3 + jitter(m.seed, 14, day) * 2
  if (active(events, 'bpLow', t, 8 * HOUR)) {
    sys = 86 + jitter(m.seed, 15, day) * 2
    dia = 55 + jitter(m.seed, 16, day) * 2
  }
  if (active(events, 'bpHigh', t, 8 * HOUR)) {
    sys = 152 + jitter(m.seed, 17, day) * 3
    dia = 96 + jitter(m.seed, 18, day) * 2
  }
  return [sys, dia]
}

function glucoseAt(m: CrewMember, day: number, events: ScenarioEvent[], t: number): number {
  if (active(events, 'glucoseLow', t, 6 * HOUR)) return 62
  return m.baseline.glucose + smooth(m.seed, 19, day / 4) * 4 + jitter(m.seed, 20, day) * 3
}

function sleepOn(m: CrewMember, day: number, events: ScenarioEvent[], t: number): number {
  // İlk iki hafta uyum dönemi: uyku daha kısa
  const adapt = day < 14 ? -0.6 * (1 - day / 14) : 0
  // Doğal dalgalanma ±0,35 saat: haftalık düşüş en fazla 0,7 saattir; "uyku azalıyor" uyarısı (0,8 saat) yalnızca demo senaryosuyla çıkar
  let v = m.baseline.sleep - 0.35 + m.traits.sleep * 0.35 + smooth(m.seed, 21, day / 4) * 0.2 + jitter(m.seed, 22, day) * 0.15 + adapt
  // "Bir haftadır uyku azalıyor": olaydan önceki 7 gece düzenli azalır
  const debt = events.find((e) => e.scenario === 'sleepDebt' && day <= missionDay(e.ts) && day > missionDay(e.ts) - 7 && t <= e.ts + 24 * HOUR)
  if (debt) {
    const k = missionDay(debt.ts) - day // 6..0
    v = 6.2 - (6 - k) * 0.27
  }
  return clamp(v, 3, 10)
}

function moodOn(m: CrewMember, day: number, events: ScenarioEvent[], t: number): number {
  const sleep = sleepOn(m, day, events, t)
  let v = m.baseline.mood - 0.25 * m.traits.stress + smooth(m.seed, 23, day / 6) * 0.45 + (sleep - 6.5) * 0.18 + jitter(m.seed, 24, day) * 0.15
  const low = events.find((e) => e.scenario === 'moodLow' && day <= missionDay(e.ts) && day > missionDay(e.ts) - 3 && t <= e.ts + 24 * HOUR)
  if (low) v = 2 + jitter(m.seed, 25, day) * 0.2
  return clamp(v, 1, 5)
}

function exerciseOn(m: CrewMember, day: number): number {
  const r = hash(m.seed, 26, day)
  if (r < m.traits.adherence) return 108 + Math.round(jitter(m.seed, 27, day) * 14)
  if (r < m.traits.adherence + (1 - m.traits.adherence) * 0.7) return 45 + Math.round(jitter(m.seed, 28, day) * 15)
  return 0
}

function waterOn(m: CrewMember, day: number): number {
  return 2450 + smooth(m.seed, 29, day / 3) * 220 + jitter(m.seed, 30, day) * 120
}

/** Günün o saatine kadar içilen suyun günlük toplamdaki payı */
export function waterFraction(h: number): number {
  return clamp((h - 6.5) / 15, 0, 1) ** 0.95
}

function radiationOn(m: CrewMember, day: number, events: ScenarioEvent[], t: number): number {
  let v = 0.48 + smooth(7, 31, day / 9) * 0.05 + jitter(m.seed, 32, day) * 0.02
  if (sameDayAs(events, 'radiationSpe', t)) v += 8.6
  return v
}

/** Kabin CO₂ istasyonun ortak havasıdır; her astronot için aynıdır */
function co2At(t: number, events: ScenarioEvent[]): number {
  const h = hourOf(t)
  let v = 2.15 + 0.3 * Math.sin(((h - 13) / 24) * 2 * Math.PI) + smooth(101, 33, t / (9 * HOUR)) * 0.28 + exerciseLoad(h) * 0.25
  const ev = events.find((e) => e.scenario === 'co2High' && t >= e.ts - 40 * HOUR && t < e.ts + 48 * HOUR)
  if (ev) v += 1.35 + smooth(102, 34, t / (3 * HOUR)) * 0.2
  return clamp(v, 0.8, 6)
}

function reactionOn(m: CrewMember, day: number, events: ScenarioEvent[], t: number): number {
  let week = 0
  for (let k = 0; k < 7; k++) week += sleepOn(m, day - k, events, t)
  week /= 7
  return m.baseline.reaction * (1 + 0.07 * Math.max(0, 6.5 - week)) + jitter(m.seed, 35, day) * 8
}

/* ---------- Örnekleme ---------- */

/** Günlük göstergelerin ölçüm saati */
const DAILY_HOUR: Partial<Record<IndicatorId, number>> = { bp: 7, glucose: 7.25, sleep: 6.5, mood: 20, exercise: 21.5, water: 22, radiation: 23.9 }

export const LIVE_STEP = 30 * 60_000

/** Göstergenin o andaki simüle değeri (canlı göstergeler için) */
export function liveValue(id: IndicatorId, astronaut: CrewId, t: number, events: ScenarioEvent[]): Point {
  const m = CREW[astronaut]
  const day = missionDay(t)
  switch (id) {
    case 'hr':
      return { t, v: Math.round(hrAt(m, t, events)), source: 'sim' }
    case 'spo2':
      return { t, v: Math.round(spo2At(m, t, events)), source: 'sim' }
    case 'temp':
      return { t, v: round(tempAt(m, t, events), 1), source: 'sim' }
    case 'resp':
      return { t, v: Math.round(respAt(m, t)), source: 'sim' }
    case 'co2':
      return { t, v: round(co2At(t, events), 1), source: 'sim' }
    case 'bp': {
      const [s, d] = bpAt(m, day, events, t)
      return { t, v: Math.round(s), v2: Math.round(d), source: 'sim' }
    }
    case 'glucose':
      return { t, v: Math.round(glucoseAt(m, day, events, t)), source: 'sim' }
    default:
      return { t, v: 0, source: 'sim' }
  }
}

/** Bir günün simüle değeri (günlük göstergeler) */
function dailyValue(id: IndicatorId, m: CrewMember, day: number, events: ScenarioEvent[], t: number): Point | null {
  switch (id) {
    case 'bp': {
      const [s, d] = bpAt(m, day, events, t)
      return { t, v: Math.round(s), v2: Math.round(d), source: 'sim' }
    }
    case 'glucose':
      return { t, v: Math.round(glucoseAt(m, day, events, t)), source: 'sim' }
    case 'sleep':
      return { t, v: round(sleepOn(m, day, events, t), 1), source: 'sim' }
    case 'mood':
      return { t, v: round(moodOn(m, day, events, t), 1), source: 'sim' }
    case 'exercise':
      return { t, v: exerciseOn(m, day), source: 'sim' }
    case 'water':
      return { t, v: Math.round(waterOn(m, day) / 10) * 10, source: 'sim' }
    case 'radiation':
      return { t, v: round(radiationOn(m, day, events, t), 2), source: 'sim' }
    default:
      return null
  }
}

/**
 * Simüle seri: [from, to] aralığında, göstergenin ölçüm sıklığına göre noktalar.
 * Günlük göstergelerde bugünün değeri, ölçüm saati geçmediyse yoktur (su ve egzersizin bugünkü toplamını motor hesaplar).
 */
export function simSeries(id: IndicatorId, astronaut: CrewId, from: number, to: number, events: ScenarioEvent[], now: number): Point[] {
  const m = CREW[astronaut]
  const out: Point[] = []
  const end = Math.min(to, now)
  const start = Math.max(from, MISSION.start)
  if (end <= start) return out

  const cadence = id === 'hr' || id === 'spo2' || id === 'temp' || id === 'resp' ? 'live' : id === 'co2' ? 'hourly' : id === 'reaction' ? 'weekly' : 'daily'

  if (cadence === 'live' || cadence === 'hourly') {
    const step = cadence === 'live' ? LIVE_STEP : HOUR
    // Uzun aralıklarda nokta sayısı sınırlanır (grafik zaten günlük özet gösterir)
    const span = end - start
    const stride = span > 60 * DAY ? 4 : span > 14 * DAY ? 2 : 1
    for (let t = Math.ceil(start / step) * step; t <= end; t += step * stride) out.push(liveValue(id, astronaut, t, events))
    return out
  }

  if (cadence === 'weekly') {
    for (let day = missionDay(start); day <= missionDay(end); day++) {
      if (day % 7 !== 3) continue
      const t = MISSION.start + day * DAY + 10 * HOUR - (MISSION.start % DAY)
      if (t < start || t > end) continue
      out.push({ t, v: Math.round(reactionOn(m, day, events, t)), source: 'sim' })
    }
    return out
  }

  const hour = DAILY_HOUR[id] ?? 12
  for (let d = dayStart(start); d <= end; d += DAY) {
    const t = d + hour * HOUR
    if (t < start || t > end) continue
    const p = dailyValue(id, m, missionDay(t), events, t)
    if (p) out.push(p)
  }
  return out
}

/** Bugün o saate kadar simüle edilen su miktarı (mL); "su içilmedi" senaryosunda çok düşük kalır */
export function simWaterSoFar(astronaut: CrewId, now: number, events: ScenarioEvent[]): number {
  const m = CREW[astronaut]
  const day = missionDay(now)
  const frac = waterFraction(hourOf(now))
  const missed = sameDayAs(events, 'waterMissed', now)
  const base = waterOn(m, day) * frac * 0.55
  return Math.round((missed ? base * 0.35 : base) / 10) * 10
}

/** Belirli bir günün simüle değeri (analiz ve koç için) */
export function simDaily(id: IndicatorId, astronaut: CrewId, day: number, events: ScenarioEvent[], now: number): number | null {
  const m = CREW[astronaut]
  const t = Math.min(now, MISSION.start - (MISSION.start % DAY) + day * DAY + (DAILY_HOUR[id] ?? 12) * HOUR)
  const p = dailyValue(id, m, day, events, t)
  return p ? p.v : null
}

/** Toplam radyasyon dozu (mSv): önceki görevler + bu görevin günlük dozları */
export function cumulativeDose(astronaut: CrewId, now: number, events: ScenarioEvent[], overrides: Point[] = []): number {
  const m = CREW[astronaut]
  let total = m.priorDoseMsv
  const today = missionDay(now)
  for (let day = 0; day < today; day++) total += radiationOn(m, day, events, MISSION.start + day * DAY + 20 * HOUR)
  // Bugünün o ana kadarki payı
  total += radiationOn(m, today, events, now) * (hourOf(now) / 24)
  for (const p of overrides) total += p.v
  return total
}

export { hash as _hash }

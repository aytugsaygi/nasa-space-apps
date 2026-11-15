import { CHECKIN_CONFIG } from '../core/checkins'
import { civilDate, minuteOfDay, parseCivilDate, zonedTimeToUtc } from '../core/zonedTime'

/*
 * Check-in saat ve tarihlerinin biçimi. Saatler görev saat diliminde gösterilir (cihazın saatine göre değil);
 * sayılar ve tarihler Intl ile, arayüz dilinin yerel ayarıyla biçimlenir.
 */

const timeFormats = new Map<string, Intl.DateTimeFormat>()

/** Görev saatinde "08:00" */
export function missionTime(t: number, locale: string, timeZone = CHECKIN_CONFIG.timeZone): string {
  const key = `${locale}|${timeZone}`
  let f = timeFormats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
    timeFormats.set(key, f)
  }
  return f.format(t)
}

/** Görev saat diliminin kısa adı ("UTC", "CST") */
export function missionZone(t: number, locale: string, timeZone = CHECKIN_CONFIG.timeZone): string {
  return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(t).find((p) => p.type === 'timeZoneName')?.value ?? timeZone
}

/** Görev tarihi ("12 Kasım Perşembe"); tarih metni sayılarla çözülür, saat diliminden bağımsızdır */
export function missionDate(date: string, locale: string): string {
  const p = parseCivilDate(date)
  if (!p) return date
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(Date.UTC(p.year, p.month - 1, p.day, 12))
}

/** "1, 2 ya da 5" (dile göre) */
export function orList(values: readonly number[], locale: string): string {
  return new Intl.ListFormat(locale, { type: 'disjunction' }).format(values.map((v) => new Intl.NumberFormat(locale).format(v)))
}

/** İletişim gecikmesi: bir dakikadan kısaysa saniye, uzunsa dakika ("1 saniye", "12 dakika") */
export function delayText(ms: number, locale: string): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  if (seconds < 60) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(seconds)
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(Math.round(seconds / 60))
}

/** Gecikme aralığı dakika olarak ("3–22 dakika"); Mars'ta gecikme gezegenlerin konumuna göre değişir */
export function delayRangeText([from, to]: readonly [number, number], locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).formatRange(Math.round(from / 60_000), Math.round(to / 60_000))
}

/** Tam zaman damgası saat dilimiyle: "12 Kas 2026 09:00:00 UTC" */
export function fullTime(t: number, locale: string, timeZone = CHECKIN_CONFIG.timeZone): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone, timeZoneName: 'short' }).format(t)
}

/** Tarih/saat alanının değeri ("YYYY-AA-GGTSS:DD") görev saat diliminde: alan cihaz saatine göre değil, görev saatine göre okunur */
export function toLocalInput(t: number, timeZone = CHECKIN_CONFIG.timeZone): string {
  const date = civilDate(t, timeZone)
  const m = minuteOfDay(t, timeZone)
  return `${date}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Tarih/saat alanının değerini görev saat diliminde ana çevirir; okunamazsa NaN */
export function fromLocalInput(value: string, timeZone = CHECKIN_CONFIG.timeZone): number {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!m || !parseCivilDate(m[1])) return Number.NaN
  const h = Number(m[2])
  const mi = Number(m[3])
  if (h > 23 || mi > 59) return Number.NaN
  return zonedTimeToUtc(m[1], h * 60 + mi, timeZone)
}

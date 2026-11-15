/*
 * Görev saat dilimindeki takvim ve saat hesapları.
 * Cihazın yerel saat dilimi hiç kullanılmaz (getHours, toLocaleString gibi yerel işlevler yok): her hesap verilen IANA
 * saat dilimine göre Intl.DateTimeFormat ile yapılır. Tarih metni Date.parse ile ayrıştırılmaz; takvim tarihi
 * "YYYY-AA-GG" biçiminde tutulur ve sayılarla işlenir.
 */

/** Görev saat dilimindeki takvim tarihi: "YYYY-AA-GG" */
export type CivilDate = string

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    // Geçersiz saat dilimi adında RangeError atar
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formatters.set(timeZone, f)
  }
  return f
}

/** Saat dilimi adı geçerli mi */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** t anının verilen saat dilimindeki takvim ve saat parçaları */
export function zonedParts(t: number, timeZone: string): ZonedParts {
  const out: Record<string, number> = {}
  for (const p of formatter(timeZone).formatToParts(t)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second }
}

/** Saat diliminin t anındaki UTC farkı (ms; doğuda artı) */
export function offsetAt(t: number, timeZone: string): number {
  const whole = Math.floor(t / 1000) * 1000
  const p = zonedParts(whole, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** t anının verilen saat dilimindeki takvim tarihi */
export function civilDate(t: number, timeZone: string): CivilDate {
  const p = zonedParts(t, timeZone)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** Günün başından beri geçen dakika (verilen saat diliminde) */
export function minuteOfDay(t: number, timeZone: string): number {
  const p = zonedParts(t, timeZone)
  return p.hour * 60 + p.minute
}

/** "YYYY-AA-GG" metnini sayılara çevirir; geçersiz ya da var olmayan tarihte (ör. 2026-02-30) null */
export function parseCivilDate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return { year, month, day }
}

/** Takvim tarihine gün ekler (saat diliminden bağımsız takvim hesabı) */
export function addDays(date: CivilDate, days: number): CivilDate {
  const p = parseCivilDate(date)
  if (!p) throw new RangeError(`geçersiz tarih: ${date}`)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Saat dilimindeki bir takvim tarihinin, gün içindeki bir dakikasına karşılık gelen an (UTC ms).
 * Yaz saati geçişinde fark değişebileceği için hesap bir kez düzeltilir. İleri alınan saatte var olmayan bir yerel saat
 * (ör. 02:30) geçişten sonraki ana denk gelir.
 */
export function zonedTimeToUtc(date: CivilDate, minute: number, timeZone: string): number {
  const p = parseCivilDate(date)
  if (!p) throw new RangeError(`geçersiz tarih: ${date}`)
  const guess = Date.UTC(p.year, p.month - 1, p.day, 0, minute)
  const first = guess - offsetAt(guess, timeZone)
  const second = guess - offsetAt(first, timeZone)
  return first === second ? first : second
}

/*
 * Sağlık Asistanı için Türkçe ve İngilizce tarih çözümleme (kural tabanlı, çevrimdışı).
 * Metin önce sadeleştirilir (fold: küçük harf, Türkçe karakterler ASCII'ye), sonra aşağıdaki kalıplar aranır:
 * - Takvim: "12 kasım", "12 Kasım'daki", "12.11", "november 12", "12 nov"
 * - Görev günü: "90. gün", "90. günkü", "görevin 90. günü", "day 90"
 * - Göreli: bugün, dün, evvelsi gün, N gün önce, bu hafta / son hafta, geçen hafta, son N gün, bu ay / son ay
 * - Kan tahlili için: uçuş öncesi, ilk, son / en son
 * Bütün günler UTC'dir (görev saati UTC).
 */

const DAY = 86_400_000

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/** Küçük harf, Türkçe karakterler ASCII'ye, noktalama boşluğa (sayı içindeki nokta ve eğik çizgi korunur) */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9./\s-]/g, ' ')
    .replace(/(\D)\.(\D|$)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

const TR_MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik']
const EN_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const EN_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export type DateQuery =
  | { kind: 'day'; from: number; to: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'missionDay'; day: number }
  | { kind: 'preflight' }
  | { kind: 'first' }
  | { kind: 'last' }

const startOfDay = (t: number) => Math.floor(t / DAY) * DAY

/** Ay adı: Türkçede ekli hâli de olur ("kasımdaki"); İngilizcede tam ad ya da kısaltma ("maybe" mayıs sayılmaz) */
function monthIndex(word: string): number {
  const tr = TR_MONTHS.findIndex((m) => word.startsWith(m))
  if (tr >= 0) return tr
  const en = EN_MONTHS.indexOf(word)
  if (en >= 0) return en
  return EN_SHORT.indexOf(word)
}

/** Ay ve gün: yıl, şu anki yıldır; o tarih gelecekteyse geçen yıl kabul edilir */
function calendarDay(day: number, month: number, now: number): number | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null
  const year = new Date(now).getUTCFullYear()
  let t = Date.UTC(year, month, day)
  if (t > now + DAY) t = Date.UTC(year - 1, month, day)
  return t
}

/**
 * Metindeki tarih isteği. missionStart verilirse "90. gün" görev gününe çevrilir.
 * labs: kan tahlili sorusu ("ilk", "son", "uçuş öncesi" yalnızca orada anlamlıdır).
 */
export function parseDate(raw: string, now: number, opts: { labs?: boolean } = {}): DateQuery | null {
  const q = fold(raw)
  const today = startOfDay(now)

  // Görev günü: "90. gun", "90 gun", "gorevin 90", "day 90" ("son 7 gun" ve "7 gun once" değil)
  const md = q.match(/(?:^|\s)(\d{1,3})\s*\.?\s*gun(?:u|un|unku|unde|deki|ki)?\b/)
  if (md && !/(son|gecen|last)\s+\d{1,3}\s*\.?\s*gun/.test(q) && !/\d{1,3}\s*gun\s*(once|onceki)/.test(q)) return { kind: 'missionDay', day: Number(md[1]) }
  const mdEn = q.match(/\bday\s*(\d{1,3})\b/)
  if (mdEn && !/(last|past)\s+\d/.test(q)) return { kind: 'missionDay', day: Number(mdEn[1]) }

  // Takvim: "12 kasim", "november 12", "12 nov"
  const dm = q.match(/\b(\d{1,2})\s*([a-z]{3,9})/)
  if (dm) {
    const m = monthIndex(dm[2])
    if (m >= 0) {
      const t = calendarDay(Number(dm[1]), m, now)
      if (t !== null) return { kind: 'day', from: t, to: t + DAY }
    }
  }
  // "november 12", "kasım 12" ("aralık" burada ay sayılmaz: "aralık 5" çoğu zaman bir aralığı anlatır)
  const mdw = q.match(/\b([a-z]{3,9})\s*(\d{1,2})\b/)
  if (mdw) {
    const m = monthIndex(mdw[1])
    if (m >= 0 && !mdw[1].startsWith('aralik')) {
      const t = calendarDay(Number(mdw[2]), m, now)
      if (t !== null) return { kind: 'day', from: t, to: t + DAY }
    }
  }
  // Sayısal: "12.11", "12/11" (gün.ay)
  const num = q.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)
  if (num) {
    const t = calendarDay(Number(num[1]), Number(num[2]) - 1, now)
    if (t !== null) return { kind: 'day', from: t, to: t + DAY }
  }

  // Göreli
  if (/\b(evvelsi gun|onceki gun|day before yesterday)\b/.test(q)) return { kind: 'day', from: today - 2 * DAY, to: today - DAY }
  if (/\b(dun|dunku|dunun|dunden|yesterday)\b/.test(q)) return { kind: 'day', from: today - DAY, to: today }
  if (/\b(bugun|bugunku|today|todays)\b/.test(q)) return { kind: 'day', from: today, to: now }
  const ago = q.match(/\b(\d{1,3})\s*(gun once|gun onceki|days? ago)\b/)
  if (ago) {
    const d = today - Number(ago[1]) * DAY
    return { kind: 'day', from: d, to: d + DAY }
  }
  const lastN = q.match(/\b(son|last|past)\s+(\d{1,3})\s*(gun|days?)\b/)
  if (lastN) return { kind: 'range', from: today - (Number(lastN[2]) - 1) * DAY, to: now }
  if (/\b(gecen hafta|gecen haftaki|previous week)\b/.test(q)) return { kind: 'range', from: today - 13 * DAY, to: today - 6 * DAY }
  if (/\b(bu hafta|bu haftaki|son hafta|son bir hafta|this week|last week|past week)\b/.test(q)) return { kind: 'range', from: today - 6 * DAY, to: now }
  if (/\b(bu ay|bu ayki|son ay|son bir ay|this month|last month|past month)\b/.test(q)) return { kind: 'range', from: today - 29 * DAY, to: now }

  if (opts.labs) {
    if (/\b(ucus oncesi|ucustan once|baslangic|pre ?flight|before (the )?flight|baseline)\b/.test(q)) return { kind: 'preflight' }
    if (/\b(ilk|first|earliest)\b/.test(q)) return { kind: 'first' }
    if (/\b(son|en son|sonuncu|latest|last|most recent|recent)\b/.test(q)) return { kind: 'last' }
  }
  return null
}

import { MISSION } from './crew'
import type { Doc } from './store'
import { addDays, civilDate, isValidTimeZone, minuteOfDay, parseCivilDate, zonedTimeToUtc, type CivilDate } from './zonedTime'

export type { CivilDate }

/*
 * İyi oluş check-in'leri (Wellbeing sayfası, docs/wellbeing/revision-spec.md: CI-01…CI-12).
 *
 * Her görev gününde isteğe bağlı birkaç check-in penceresi vardır. Pencere, başlangıç saatinden bir sonraki pencerenin
 * başlangıcına kadar açık kalır; günün son penceresi ertesi günün ilk penceresine kadar sürer. Pencere, açıldığı günün
 * takvim tarihine aittir: gece yarısından sonra verilen akşam check-in'i yine bir önceki tarihe yazılır.
 * Bütün saatler görev saat dilimine göredir (cihazın saat dilimi kullanılmaz).
 *
 * Pencere sonuçları:
 * - pending: açık, henüz kesin bir sonuç yok
 * - deferred: açık; kullanıcı formu kapat düğmesiyle kapattı, check-in hâlâ yapılabilir
 * - saved: en az bir cevap ya da boş olmayan bir not kaydedildi
 * - skipped: kullanıcı bu pencereyi bilerek atladı
 * - expired: pencere kesin bir sonuç olmadan kapandı (türetilir, hiçbir zaman kaydedilmez ve atlama sayılmaz)
 * - upcoming: pencere henüz açılmadı (türetilir; gönderim kabul edilmez)
 * Yalnızca saved ve skipped kalıcı kayıttır (checkins koleksiyonu). Otomatik sorunun gösterilmesi, kapatma, formun
 * açılması ve taslak ayrı bir koleksiyonda (checkinMeta) tutulur; bunlar sonucu değiştirmez.
 *
 * Cevaplardan toplam puan, klinik değerlendirme ya da uyarı üretilmez (CI-02, CI-09).
 * Yapılandırmadaki değerler ürün ayarıdır; sorular ve seçenekler henüz kesinleşmedi (OQ-06).
 */

export interface CheckinWindowDef {
  id: string
  /** Pencerenin açıldığı saat: gün başından itibaren dakika (görev saat diliminde) */
  startMinute: number
}

export interface CheckinQuestion {
  id: string
  /**
   * Seçilebilecek cevapların anahtarları (metinleri arayüz sözlüğünde). "notSure" de bir cevaptır; boş bırakılan soru
   * ise cevapsızdır (null) ve nötr ya da sağlıklı sayılmaz. Cevaplar toplanmaz, puanlanmaz ve sınıflandırılmaz.
   */
  options: readonly string[]
  /** Bu cevaplar seçilince formda "uçuş hekimine bildir" önerisi görünür (cevap yine puanlanmaz, kimseye gönderilmez) */
  advise?: readonly string[]
}

export interface CheckinConfig {
  /** IANA saat dilimi (görev saati) */
  timeZone: string
  /** Başlangıç saatine göre sıralı pencereler */
  windows: readonly CheckinWindowDef[]
  questions: readonly CheckinQuestion[]
  /** Notun en fazla kelime sayısı (countWords kuralıyla) */
  noteMaxWords: number
  /** Notun en fazla karakter sayısı: kelime sınırının yanında, çok uzun tek "kelime"ye karşı bir güvenlik sınırı */
  noteMaxChars: number
  /** Pencere kapanmadan açılmış bir form, kapandıktan sonra bu kadar dakika daha gönderilebilir */
  lateSubmissionGraceMinutes: number
  /** Arayüzde gösterilen tahmini süre (dakika); yalnızca bilgi */
  estimatedMinutes: number
}

export const CHECKIN_CONFIG: CheckinConfig = {
  timeZone: MISSION.timeZone,
  windows: [
    { id: 'morning', startMinute: 8 * 60 },
    { id: 'midday', startMinute: 13 * 60 },
    { id: 'evening', startMinute: 20 * 60 },
  ],
  /*
   * Bağımsız, isteğe bağlı sorular; hiçbiri önceden seçili gelmez. İlk dördü görev 4 tanımı.
   * team: NASA Standard Measures'ta yatmadan önceki ankette takım uyumu sorulur (standardMeasures).
   * vision: uzun görevlerde mürettebatın ~%70'inde göz değişikliğinin erken belirtileri, yakın görme şikayeti %48 (sansEB).
   */
  questions: [
    { id: 'physical', options: ['comfortable', 'mildDiscomfort', 'significantDiscomfort', 'notSure'] },
    { id: 'mood', options: ['good', 'okay', 'low', 'veryLow', 'notSure'] },
    { id: 'pressure', options: ['calm', 'somePressure', 'lotOfPressure', 'struggling', 'notSure'] },
    { id: 'energy', options: ['energized', 'littleTired', 'tired', 'veryTired', 'notSure'] },
    { id: 'team', options: ['good', 'okay', 'tense', 'notSure'] },
    { id: 'vision', options: ['noChange', 'slightChange', 'clearChange', 'notSure'], advise: ['clearChange'] },
  ],
  noteMaxWords: 100,
  noteMaxChars: 4000,
  lateSubmissionGraceMinutes: 120,
  // Geçici tahmin (yaklaşık 1 dakika); gerçek kullanımla güncellenecek
  estimatedMinutes: 1,
}

/** Yapılandırmayı denetler; hatalı yapılandırma uygulama açılırken fark edilsin diye hata atar */
export function validateCheckinConfig(c: CheckinConfig): void {
  if (!isValidTimeZone(c.timeZone)) throw new Error(`check-in: geçersiz saat dilimi ${c.timeZone}`)
  if (!c.windows.length) throw new Error('check-in: en az bir pencere gerekir')
  const ids = new Set<string>()
  c.windows.forEach((w, i) => {
    if (!/^[a-z][a-zA-Z0-9]*$/.test(w.id) || ids.has(w.id)) throw new Error(`check-in: pencere kimliği geçersiz ${w.id}`)
    ids.add(w.id)
    if (!Number.isInteger(w.startMinute) || w.startMinute < 0 || w.startMinute >= 1440) throw new Error(`check-in: başlangıç saati geçersiz ${w.id}`)
    if (i > 0 && w.startMinute <= c.windows[i - 1].startMinute) throw new Error('check-in: pencereler başlangıç saatine göre sıralı olmalı')
  })
  const qs = new Set<string>()
  for (const q of c.questions) {
    if (!q.id || qs.has(q.id) || !q.options.length) throw new Error(`check-in: soru geçersiz ${q.id}`)
    qs.add(q.id)
  }
  if (!(c.noteMaxWords > 0) || !(c.noteMaxChars > 0) || !(c.lateSubmissionGraceMinutes >= 0) || !(c.estimatedMinutes > 0)) throw new Error('check-in: süre ya da uzunluk geçersiz')
}

/* ---------- Pencereler ---------- */

export interface CheckinWindow {
  /** Pencerenin kimliği: "YYYY-AA-GG:pencere" */
  key: string
  /** Pencerenin ait olduğu görev tarihi (açıldığı gün, görev saat diliminde) */
  date: CivilDate
  window: string
  opensAt: number
  closesAt: number
}

export const windowKey = (date: CivilDate, window: string) => `${date}:${window}`

export function parseWindowKey(key: string): { date: CivilDate; window: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}):([a-z][a-zA-Z0-9]*)$/.exec(key)
  if (!m || !parseCivilDate(m[1])) return null
  return { date: m[1], window: m[2] }
}

/** Bir tarihin belirli penceresi; yapılandırmada yoksa null */
export function windowFor(date: CivilDate, window: string, c: CheckinConfig = CHECKIN_CONFIG): CheckinWindow | null {
  const i = c.windows.findIndex((w) => w.id === window)
  if (i < 0 || !parseCivilDate(date)) return null
  const next = c.windows[i + 1]
  const opensAt = zonedTimeToUtc(date, c.windows[i].startMinute, c.timeZone)
  const closesAt = next ? zonedTimeToUtc(date, next.startMinute, c.timeZone) : zonedTimeToUtc(addDays(date, 1), c.windows[0].startMinute, c.timeZone)
  return { key: windowKey(date, window), date, window, opensAt, closesAt }
}

export function windowByKey(key: string, c: CheckinConfig = CHECKIN_CONFIG): CheckinWindow | null {
  const k = parseWindowKey(key)
  return k ? windowFor(k.date, k.window, c) : null
}

/** t anında açık olan pencere. İlk pencereden önceki saatler bir önceki günün son penceresine aittir. */
export function windowAt(t: number, c: CheckinConfig = CHECKIN_CONFIG): CheckinWindow {
  const date = civilDate(t, c.timeZone)
  const minute = minuteOfDay(t, c.timeZone)
  const today = [...c.windows].reverse().find((w) => w.startMinute <= minute)
  const w = today ? windowFor(date, today.id, c) : windowFor(addDays(date, -1), c.windows[c.windows.length - 1].id, c)
  return w!
}

/** Bir tarihin bütün pencereleri (açılış sırasıyla) */
export function windowsForDate(date: CivilDate, c: CheckinConfig = CHECKIN_CONFIG): CheckinWindow[] {
  return c.windows.map((w) => windowFor(date, w.id, c)!)
}

/* ---------- Kayıtlar ---------- */

/** Bir sorunun cevabı; null: soru boş bırakıldı */
export type CheckinAnswers = Record<string, string | null>

/** Kesin sonuç (checkins koleksiyonu). Kimlik kişi ve pencereye göre sabittir: aynı pencere için ikinci kayıt oluşmaz. */
export interface CheckinDoc extends Doc {
  date: CivilDate
  window: string
  outcome: 'saved' | 'skipped'
  /** Yapılandırmadaki her soru için cevap ya da null */
  answers: CheckinAnswers
  /** Check-in notu (günlükten ayrı bir kayıttır) */
  note: string
  /** Gönderimin gerçekleştiği an (Doc.ts ile aynı) */
  submittedAt: number
  /** Pencere kapandıktan sonra, kapanmadan açılmış formdan gönderildi */
  late: boolean
  /** Cevaplanan ve boş bırakılan sorular (kısmi cevap bilgisi) */
  answered: number
  omitted: string[]
  /** Aynı pencere için kaçıncı gönderim (pencere açıkken düzeltilebilir) */
  revision: number
}

export interface CheckinDraft {
  answers: CheckinAnswers
  note: string
  updatedAt: number
}

/** Sunum bilgisi (checkinMeta koleksiyonu): sonucu belirlemez, yalnızca arayüzün davranışını yönetir */
export interface CheckinMetaDoc extends Doc {
  date: CivilDate
  window: string
  /** Otomatik check-in sorusunun gösterildiği an (bir pencerede bir kez gösterilir) */
  promptedAt?: number
  /** Formun kapat düğmesiyle kapatıldığı an (deferred) */
  dismissedAt?: number
  /** Formun ilk açıldığı an (geç gönderim için) */
  openedAt?: number
  draft?: CheckinDraft
}

export const checkinRecordId = (astronaut: string, w: Pick<CheckinWindow, 'date' | 'window'>) => `ck:${astronaut}:${w.date}:${w.window}`
export const checkinMetaId = (astronaut: string, w: Pick<CheckinWindow, 'date' | 'window'>) => `ckm:${astronaut}:${w.date}:${w.window}`

/* ---------- Durum ---------- */

export type CheckinOutcome = 'pending' | 'deferred' | 'saved' | 'skipped' | 'expired' | 'upcoming'

export interface CheckinWindowView extends CheckinWindow {
  outcome: CheckinOutcome
  record: CheckinDoc | null
  draft: CheckinDraft | null
  promptedAt: number | null
  dismissedAt: number | null
  openedAt: number | null
  /** Şu an gönderim kabul ediliyor mu (açık pencere ya da geç gönderim süresi) */
  acceptsSubmission: boolean
  /** Pencere kapandıysa, açık formdan gönderimin kabul edileceği son an */
  lateUntil: number | null
  /** Arayüz bu pencere için otomatik soruyu göstermeli mi */
  autoPrompt: boolean
}

export type SubmissionCheck = { ok: true; late: boolean } | { ok: false; error: 'notOpen' | 'expired' }

/** Bu anda pencereye gönderim yapılabilir mi; pencere kapandıysa yalnızca kapanmadan açılmış form süre içinde gönderebilir */
export function submissionAllowed(w: CheckinWindow, meta: Pick<CheckinMetaDoc, 'openedAt'> | null, now: number, c: CheckinConfig = CHECKIN_CONFIG): SubmissionCheck {
  if (now < w.opensAt) return { ok: false, error: 'notOpen' }
  if (now < w.closesAt) return { ok: true, late: false }
  const opened = meta?.openedAt
  if (opened !== undefined && opened >= w.opensAt && opened < w.closesAt && now < w.closesAt + c.lateSubmissionGraceMinutes * 60_000) return { ok: true, late: true }
  return { ok: false, error: 'expired' }
}

export function deriveView(w: CheckinWindow, record: CheckinDoc | null, meta: CheckinMetaDoc | null, now: number, c: CheckinConfig = CHECKIN_CONFIG): CheckinWindowView {
  const open = now >= w.opensAt && now < w.closesAt
  const outcome: CheckinOutcome = record ? record.outcome : now < w.opensAt ? 'upcoming' : open ? (meta?.dismissedAt !== undefined ? 'deferred' : 'pending') : 'expired'
  const allowed = submissionAllowed(w, meta, now, c)
  const lateEligible = meta?.openedAt !== undefined && meta.openedAt >= w.opensAt && meta.openedAt < w.closesAt
  return {
    ...w,
    outcome,
    record,
    draft: meta?.draft ?? null,
    promptedAt: meta?.promptedAt ?? null,
    dismissedAt: meta?.dismissedAt ?? null,
    openedAt: meta?.openedAt ?? null,
    // Atlanan pencere açıkken yine kaydedilebilir (kullanıcı fikrini değiştirebilir)
    acceptsSubmission: allowed.ok,
    lateUntil: lateEligible ? w.closesAt + c.lateSubmissionGraceMinutes * 60_000 : null,
    // Otomatik soru bir pencerede yalnızca bir kez, kullanıcı henüz hiçbir şey yapmamışken gösterilir
    autoPrompt: outcome === 'pending' && meta?.promptedAt === undefined && meta?.openedAt === undefined,
  }
}

/* ---------- Gönderim ---------- */

/**
 * Not için kelime sayma kuralı (arayüzdeki sayaç ve motordaki sınır aynı işlevi kullanır):
 * metin boşluk karakterlerinden (Unicode, satır sonu dahil) bölünür; içinde en az bir harf ya da rakam olan her parça bir
 * kelimedir. "iyi-kötü", "Dünya'nın" ve "3" birer kelimedir; yalnızca noktalama ya da simgeden oluşan parçalar ("—", "...")
 * sayılmaz.
 */
export function countWords(text: string): number {
  let n = 0
  for (const part of text.split(/\s+/u)) if (/[\p{L}\p{N}]/u.test(part)) n++
  return n
}

export type CheckinInputError = 'invalid' | 'empty' | 'noteTooLong'

export type NormalizedSubmission =
  | { ok: true; answers: CheckinAnswers; note: string; answered: number; omitted: string[] }
  | { ok: false; error: CheckinInputError }

/**
 * Cevapları ve notu denetler: bilinmeyen soru ya da seçenek reddedilir, eksik sorular null (boş bırakıldı) olur.
 * - submit: hiç cevap ve boş olmayan not yoksa 'empty' (boş gönderim kaydedilmez); not kelime ya da karakter sınırını
 *   aşarsa 'noteTooLong'. Metin hiçbir zaman sessizce kısaltılmaz.
 * - draft: boş taslak ve sınırı aşan not serbesttir (kişinin yazdığı tamamen korunur); yalnızca karakter güvenlik
 *   sınırı uygulanır.
 */
export function normalizeSubmission(answers: unknown, note: unknown, c: CheckinConfig = CHECKIN_CONFIG, mode: 'submit' | 'draft' = 'submit'): NormalizedSubmission {
  if (answers !== undefined && answers !== null && (typeof answers !== 'object' || Array.isArray(answers))) return { ok: false, error: 'invalid' }
  if (note !== undefined && note !== null && typeof note !== 'string') return { ok: false, error: 'invalid' }
  const given = (answers ?? {}) as Record<string, unknown>
  for (const id of Object.keys(given)) if (!c.questions.some((q) => q.id === id)) return { ok: false, error: 'invalid' }
  const out: CheckinAnswers = {}
  const omitted: string[] = []
  for (const q of c.questions) {
    const v = given[q.id]
    if (v === undefined || v === null) {
      out[q.id] = null
      omitted.push(q.id)
    } else if (typeof v === 'string' && q.options.includes(v)) out[q.id] = v
    else return { ok: false, error: 'invalid' }
  }
  const raw = note ?? ''
  if (raw.length > c.noteMaxChars) return { ok: false, error: 'noteTooLong' }
  const text = raw.trim()
  const answered = c.questions.length - omitted.length
  if (mode === 'draft') return { ok: true, answers: out, note: raw, answered, omitted }
  if (countWords(text) > c.noteMaxWords) return { ok: false, error: 'noteTooLong' }
  if (answered === 0 && !text) return { ok: false, error: 'empty' }
  return { ok: true, answers: out, note: text, answered, omitted }
}

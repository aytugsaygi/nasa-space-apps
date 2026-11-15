import type { IndicatorId } from './catalog'
import { FLIGHT_SURGEON, HOUR, DAY } from './crew'
import type { Tx } from './tx'

/*
 * Hekimle iletişim (Acil destek → "Hekimle iletişime geç"; docs/wellbeing EM-02, EM-04).
 *
 * Alıcılar: yalnızca uygulamada yapılandırılmış kişiler. Bugün tek yapılandırılmış tıbbi rol uçuş hekimidir (crew.ts,
 * FLIGHT_SURGEON; kurgusal görevin kurgusal hekimi). Uydurma bir operasyonel iletişim bilgisi eklenmez.
 *
 * Sağlık verisi ekleri: hiçbir kategori varsayılan olarak seçili değildir; kategoriler bağımsız seçilir. Hazır aralıklar
 * (son 24 saat / 3 gün / 7 gün) yalnızca kolaylıktır; açıkça belirtilen bir referans andan geriye hesaplanır. Aralık iki
 * uçta da kapsayıcıdır: from <= t <= to. Günlük ve check-in notları eklenemez (serbest metin paylaşımı desteklenmez).
 *
 * Gözden geçirilen içerik onaylanınca değişmez bir anlık görüntü olarak gönderilir; kaynak veri sonradan değişse de
 * gönderilen mesaj değişmez. Aynı istek kimliğiyle ikinci gönderim yeni mesaj açmaz.
 */

export interface MedicalContact {
  id: 'surgeon'
  name: string
  role: Tx
}

/** Yapılandırılmış tıbbi alıcılar (bugün yalnızca uçuş hekimi) */
export const MEDICAL_CONTACTS: readonly MedicalContact[] = [{ id: FLIGHT_SURGEON.id, name: FLIGHT_SURGEON.name, role: FLIGHT_SURGEON.role }]

/** Bildirilebilecek belirtiler; hiçbiri zorunlu değildir */
export const CONTACT_SYMPTOMS = ['headache', 'dizziness', 'nausea', 'pain', 'breathing', 'sleep', 'anxiety', 'vision'] as const
export type ContactSymptom = (typeof CONTACT_SYMPTOMS)[number]

/** Eklenebilecek veri kategorileri (katalogdaki göstergeler) */
export const ATTACHMENT_CATEGORIES = ['hr', 'bp', 'spo2', 'temp', 'resp', 'glucose', 'sleep'] as const satisfies readonly IndicatorId[]
export type AttachmentCategoryId = (typeof ATTACHMENT_CATEGORIES)[number]

export type RangePreset = '24h' | '3d' | '7d'
export const RANGE_PRESETS: Record<RangePreset, number> = { '24h': 24 * HOUR, '3d': 3 * DAY, '7d': 7 * DAY }
/** Özel aralığın en uzun süresi */
export const MAX_CUSTOM_RANGE_MS = 30 * DAY
export const EXPLANATION_MAX_CHARS = 1000

/** Hazır aralık: referans andan geriye (to = referans an, from = referans an − süre) */
export function presetRange(preset: RangePreset, reference: number): { from: number; to: number } {
  return { from: reference - RANGE_PRESETS[preset], to: reference }
}

export type DateRangeError = 'invalid' | 'empty' | 'endAfterReference' | 'tooLong'

/** Aralık denetimi: başlangıç bitişten önce, bitiş referans andan sonra değil, en fazla 30 gün */
export function checkRange(from: number, to: number, reference: number): DateRangeError | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'invalid'
  if (to <= from) return 'empty'
  if (to > reference) return 'endAfterReference'
  if (to - from > MAX_CUSTOM_RANGE_MS) return 'tooLong'
  return null
}

export interface AttachmentPoint {
  t: number
  v: number
  v2?: number
  source: string
}

export interface AttachmentCategory {
  id: AttachmentCategoryId
  count: number
  /** İlk ve son kaydın anı (kayıt yoksa null): kapsanmayan kısımlar bunlarla gösterilir */
  first: number | null
  last: number | null
  /** Kaynağa göre sayılar (simülasyon, elle, demo, içe aktarma) */
  sources: Record<string, number>
  points: AttachmentPoint[]
}

/** Gönderilecek ek: gözden geçirme anındaki anlık görüntü */
export interface AttachmentSnapshot {
  /** Hazır aralıkların hesaplandığı referans an */
  reference: number
  from: number
  to: number
  timeZone: string
  categories: AttachmentCategory[]
}

/** Gönderim isteği: gözden geçirilen içeriğin aynısı */
export interface DoctorRequest {
  /** Çift gönderimi önleyen istek kimliği (gözden geçirme başlayınca bir kez üretilir) */
  requestId: string
  recipient: MedicalContact['id']
  symptoms: ContactSymptom[]
  /** "Başka bir konuyu konuşmak istiyorum" */
  other: boolean
  explanation: string
  /** Hekime giden metin (gözden geçirme ekranında gösterilenin aynısı) */
  text: string
  attachment: AttachmentSnapshot | null
}

export type DoctorRequestError = 'noRecipient' | 'empty' | 'invalid' | 'tooLong' | 'range'

/** İsteğin biçimini denetler; metin kısaltılmaz, sınırı aşan istek reddedilir */
export function checkDoctorRequest(req: DoctorRequest, contacts: readonly MedicalContact[] = MEDICAL_CONTACTS): DoctorRequestError | null {
  if (!req || typeof req !== 'object') return 'invalid'
  if (typeof req.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(req.requestId)) return 'invalid'
  if (!contacts.some((c) => c.id === req.recipient)) return 'noRecipient'
  if (!Array.isArray(req.symptoms) || req.symptoms.some((s) => !(CONTACT_SYMPTOMS as readonly string[]).includes(s))) return 'invalid'
  if (typeof req.explanation !== 'string' || typeof req.text !== 'string' || typeof req.other !== 'boolean') return 'invalid'
  if (req.explanation.length > EXPLANATION_MAX_CHARS || req.text.length > 8000) return 'tooLong'
  if (!req.symptoms.length && !req.other && !req.explanation.trim()) return 'empty'
  const a = req.attachment
  if (a !== null) {
    if (!a || typeof a !== 'object' || !Array.isArray(a.categories) || a.categories.length === 0) return 'invalid'
    if (checkRange(a.from, a.to, a.reference)) return 'range'
    for (const c of a.categories) {
      if (!(ATTACHMENT_CATEGORIES as readonly string[]).includes(c.id) || !Array.isArray(c.points) || c.points.length !== c.count || c.count > 5000) return 'invalid'
      if (c.points.some((p) => typeof p.t !== 'number' || p.t < a.from || p.t > a.to || typeof p.v !== 'number')) return 'invalid'
    }
  }
  return null
}

/** Bir nesneyi ve içindekileri derinlemesine dondurur (gönderilen anlık görüntü değiştirilemesin) */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

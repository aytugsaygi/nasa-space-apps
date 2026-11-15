import type { CrewId } from './crew'
import { CREW } from './crew'
import type { Doc } from './store'
import type { Point } from './sim'

/*
 * Kişisel bilgiler ve kişisel normal (U-04, D-10, D-11).
 *
 * MedlinePlus'a göre normal yaşamsal değerler yaşa, cinsiyete, kiloya, kondisyona ve genel sağlığa göre değişir (mpVitals),
 * ama bu etkiler için sayısal bir formül vermez. Bu yüzden Vitalis yaş ve kiloya göre aralık uydurmaz; bunun yerine her
 * astronotun kendi verisinden bir "kişisel normal" hesaplar:
 *   kişisel normal = son 14 günün ortancası ± 2,5 × (1,4826 × ortanca mutlak sapma), en az ±8 atım/dk ya da ±0,5 °C
 *   (ortanca kullanılır ki antrenman sırasındaki kısa yükselişler normali genişletmesin)
 * Profil (yaş, boy, kilo) değiştirilince kişisel normal yeniden öğrenilir: değişiklikten önceki veriler hesaba katılmaz.
 * En az bir günlük veri birikene kadar uçuş öncesi başlangıç değeri kullanılır.
 *
 * Vücut kitle indeksi CDC'nin yetişkin kategorilerine göre hesaplanır (cdcBmi).
 */

export interface ProfileDoc extends Doc {
  age: number
  heightCm: number
  weightKg: number
  /** Profilin son değiştiği an (kişisel normal bu andan sonraki verilerle hesaplanır) */
  changedAt: number
}

export type BmiCategory = 'under' | 'healthy' | 'over' | 'obese'

export interface Profile {
  astronaut: CrewId
  name: string
  sex: 'f' | 'm'
  age: number
  heightCm: number
  weightKg: number
  /** Varsayılan (görev öncesi kayıtlı) değerlerden farklı mı */
  edited: boolean
  changedAt: number | null
  bmi: number
  bmiCategory: BmiCategory
}

/** Girilebilecek değerler: yetişkin astronot aralığı (geçersiz değer kaydedilmez) */
export const PROFILE_LIMITS = { age: [18, 75], heightCm: [140, 210], weightKg: [40, 150] } as const

export type ProfilePatch = Partial<Pick<ProfileDoc, 'age' | 'heightCm' | 'weightKg'>>

/** CDC: kilo (kg) / boy (m)²; yetişkin kategorileri 18,5 / 25 / 30 */
export function bmiOf(heightCm: number, weightKg: number): { bmi: number; category: BmiCategory } {
  const m = heightCm / 100
  const bmi = Math.round((weightKg / (m * m)) * 10) / 10
  const category: BmiCategory = bmi < 18.5 ? 'under' : bmi < 25 ? 'healthy' : bmi < 30 ? 'over' : 'obese'
  return { bmi, category }
}

export function profileOf(astronaut: CrewId, doc: ProfileDoc | null): Profile {
  const c = CREW[astronaut]
  const age = doc?.age ?? c.age
  const heightCm = doc?.heightCm ?? c.heightCm
  const weightKg = doc?.weightKg ?? c.weightKg
  const { bmi, category } = bmiOf(heightCm, weightKg)
  return {
    astronaut,
    name: c.name,
    sex: c.sex,
    age,
    heightCm,
    weightKg,
    edited: !!doc && (doc.age !== c.age || doc.heightCm !== c.heightCm || doc.weightKg !== c.weightKg),
    changedAt: doc?.changedAt ?? null,
    bmi,
    bmiCategory: category,
  }
}

/** Girilen değerler sınırlar içinde mi (ondalık kilo kabul edilir; yaş ve boy tam sayı) */
export function validProfilePatch(p: ProfilePatch): boolean {
  const ok = (v: number | undefined, [lo, hi]: readonly [number, number]) => v === undefined || (Number.isFinite(v) && v >= lo && v <= hi)
  return ok(p.age, PROFILE_LIMITS.age) && ok(p.heightCm, PROFILE_LIMITS.heightCm) && ok(p.weightKg, PROFILE_LIMITS.weightKg)
}

/* ---------- Kişisel normal ---------- */

export type PersonalId = 'hr' | 'temp'
export const PERSONAL_IDS: PersonalId[] = ['hr', 'temp']

/** Kişisel normal penceresi ve bandın en dar yarı genişliği */
export const PERSONAL_WINDOW_DAYS = 14
const MIN_HALF: Record<PersonalId, number> = { hr: 8, temp: 0.5 }
const K = 2.5
const DIGITS: Record<PersonalId, number> = { hr: 0, temp: 1 }

export interface PersonalNormal {
  low: number
  high: number
  mean: number
  /** Hesaba giren günlerin sayısı (0 ise uçuş öncesi başlangıç kullanıldı) */
  days: number
  /** Hesap profil değişikliğinden sonra başladıysa o an */
  since: number | null
  basis: 'data' | 'baseline'
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/**
 * Noktalardan kişisel normal. Bir günden az veri varsa uçuş öncesi başlangıç ± en dar yarı genişlik kullanılır.
 * Ölçülen son değerin kendisi hesaba katılmasın diye çağıran taraf son saati dışarıda bırakır.
 */
export function personalNormal(id: PersonalId, points: Point[], baseline: number, from: number, to: number, since: number | null): PersonalNormal {
  const d = DIGITS[id]
  const spanDays = (to - from) / 86_400_000
  if (points.length < 12 || spanDays < 1) {
    return { low: round(baseline - MIN_HALF[id], d), high: round(baseline + MIN_HALF[id], d), mean: baseline, days: 0, since, basis: 'baseline' }
  }
  // Ortanca ve ortanca mutlak sapma: antrenman sırasındaki yüksek nabız gibi kısa sapmalar normali genişletmesin
  const med = median(points.map((p) => p.v))
  const sigma = 1.4826 * median(points.map((p) => Math.abs(p.v - med)))
  const half = Math.max(K * sigma, MIN_HALF[id])
  return { low: round(med - half, d), high: round(med + half, d), mean: round(med, d), days: Math.round(spanDays), since, basis: 'data' }
}

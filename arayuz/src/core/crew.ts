import { tx, type Tx } from './tx'

/*
 * Kurgusal görev ve mürettebat. Hiçbir kişi gerçek değildir; sağlık verileri simülatörden gelir (gerçek kişi verisi yok).
 * Başlangıç değerleri (baseline) uçuş öncesi ölçümlerdir; analiz uçuştaki değerleri bunlarla da karşılaştırır.
 */

export type CrewId = 'yildiz' | 'lindqvist' | 'mori' | 'okafor'
export const CREW_IDS: CrewId[] = ['yildiz', 'lindqvist', 'mori', 'okafor']

export interface Baseline {
  hr: number
  sys: number
  dia: number
  spo2: number
  temp: number
  resp: number
  glucose: number
  sleep: number
  mood: number
  reaction: number
}

export interface CrewMember {
  id: CrewId
  name: string
  role: Tx
  sex: 'f' | 'm'
  age: number
  heightCm: number
  weightKg: number
  baseline: Baseline
  /** Önceki görevlerden gelen radyasyon dozu (mSv) */
  priorDoseMsv: number
  /** Simülasyon karakteri: uyku kalitesi (-1 kötü, 1 iyi), stres eğilimi (0-1), egzersize uyum (0-1), tansiyon eğilimi (mmHg/ay) */
  traits: { sleep: number; stress: number; adherence: number; bpDrift: number }
  seed: number
}

export const CREW: Record<CrewId, CrewMember> = {
  yildiz: {
    id: 'yildiz',
    name: 'E. Yıldız',
    role: tx('Görev uzmanı', 'Mission specialist'),
    sex: 'f',
    age: 36,
    heightCm: 168,
    weightKg: 61,
    baseline: { hr: 66, sys: 112, dia: 72, spo2: 98, temp: 36.7, resp: 14, glucose: 86, sleep: 7.9, mood: 4, reaction: 248 },
    priorDoseMsv: 38,
    traits: { sleep: 0.1, stress: 0.35, adherence: 1, bpDrift: 0.2 },
    seed: 11,
  },
  lindqvist: {
    id: 'lindqvist',
    name: 'M. Lindqvist',
    role: tx('Komutan', 'Commander'),
    sex: 'f',
    age: 47,
    heightCm: 172,
    weightKg: 66,
    baseline: { hr: 62, sys: 112, dia: 72, spo2: 97, temp: 36.6, resp: 13, glucose: 91, sleep: 7.9, mood: 4.2, reaction: 262 },
    priorDoseMsv: 142,
    traits: { sleep: 0.2, stress: 0.25, adherence: 1, bpDrift: 0.3 },
    seed: 23,
  },
  mori: {
    id: 'mori',
    name: 'K. Mori',
    role: tx('Uçuş mühendisi', 'Flight engineer'),
    sex: 'm',
    age: 41,
    heightCm: 176,
    weightKg: 74,
    baseline: { hr: 64, sys: 111, dia: 72, spo2: 98, temp: 36.7, resp: 14, glucose: 89, sleep: 7.8, mood: 3.9, reaction: 255 },
    priorDoseMsv: 96,
    traits: { sleep: 0.3, stress: 0.55, adherence: 1, bpDrift: 0.2 },
    seed: 37,
  },
  okafor: {
    id: 'okafor',
    name: 'A. Okafor',
    role: tx('Pilot', 'Pilot'),
    sex: 'm',
    age: 33,
    heightCm: 181,
    weightKg: 79,
    baseline: { hr: 58, sys: 112, dia: 70, spo2: 98, temp: 36.8, resp: 13, glucose: 84, sleep: 7.8, mood: 4.3, reaction: 236 },
    priorDoseMsv: 12,
    traits: { sleep: 0.5, stress: 0.15, adherence: 1, bpDrift: 0.1 },
    seed: 53,
  },
}

/** Yer ekibindeki uçuş hekimi (kurgusal) */
export const FLIGHT_SURGEON = { id: 'surgeon' as const, name: 'Dr. S. Demir', role: tx('Uçuş hekimi', 'Flight surgeon') }

export type Environment = 'iss' | 'orion' | 'moon' | 'mars'

/** Seçilebilecek görev ortamları (iletişim gecikmesi ve egzersiz programı buna göre değişir) */
export const ENVIRONMENTS: Environment[] = ['iss', 'orion', 'moon', 'mars']

export const MISSION = {
  name: tx('Kuzey Işığı-3', 'Northern Light-3'),
  /** Görevin başladığı an (UTC). Simülasyon bu tarihe göre belirlidir: aynı gün her açılışta aynı değerler görünür. */
  start: Date.UTC(2026, 5, 19, 3, 0, 0),
  durationDays: 180,
  environment: 'iss' as Environment,
  /**
   * Görev saat dilimi (IANA adı). İstasyon GMT kullanır; takvim ve saat hesapları (ör. check-in pencereleri) cihazın
   * yerel saatine göre değil, buna göre yapılır. Yaz saati uygulayan bir bölgeye (ör. 'America/Chicago') geçilebilir.
   */
  timeZone: 'UTC' as string,
}

export const DAY = 86_400_000
export const HOUR = 3_600_000

export function missionDay(t: number): number {
  return Math.floor((t - MISSION.start) / DAY)
}

/** Görevin t anındaki günün başlangıcı (UTC gece yarısı; istasyon GMT saatini kullanır) */
export function dayStart(t: number): number {
  return Math.floor(t / DAY) * DAY
}

export function isCrewId(v: unknown): v is CrewId {
  return typeof v === 'string' && (CREW_IDS as string[]).includes(v)
}

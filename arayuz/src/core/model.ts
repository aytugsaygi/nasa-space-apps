import type { PersonalId, PersonalNormal, Profile } from './personal'
import type { BodyRegion, IndicatorId, Status } from './catalog'
import type { CrewId } from './crew'
import type { ScenarioId } from './scenarios'
import type { PointSource } from './sim'
import type { SourceId } from './sources'
import type { AttachmentSnapshot, ContactSymptom } from './doctorContact'
import type { Doc } from './store'
import type { Tx } from './tx'

/* Kayıtların ve motor çıktılarının tipleri (arayüz, sunucu ve testler aynı tipleri kullanır). */

export type RegionId = Exclude<BodyRegion, 'tum'>
/** Kaslarda bildirilebilen belirtiler */
export type MuscleSymptom = 'pain' | 'cramp' | 'tight' | 'numb' | 'weak'
/** Kemiklerde bildirilebilen belirtiler (kırık ve çatlak şüphe olarak bildirilir; tanı hekimindir) */
export type BoneSymptom = 'pain' | 'fracture' | 'crack' | 'impact' | 'swelling' | 'other'
export type Symptom = MuscleSymptom | BoneSymptom
export type Side = 'right' | 'left' | 'both'
export type ComplaintStatus = 'active' | 'improving' | 'resolved'

export interface MeasurementDoc extends Doc {
  indicator: IndicatorId
  v: number
  v2?: number
  source: PointSource
}

export interface ScenarioDoc extends Doc {
  scenario: ScenarioId
}

export interface ComplaintUpdate {
  ts: number
  severity: number
  status: ComplaintStatus
  note?: string
}

export interface ComplaintDoc extends Doc {
  region: RegionId
  side: Side
  /** Seçilen kasların adları (iki dilde) */
  muscles: Tx[]
  /** Seçilen kemiklerin adları (iki dilde; kemik şikayetinde) */
  bones?: Tx[]
  symptom: Symptom
  /** 0-10 */
  severity: number
  note: string
  status: ComplaintStatus
  updates: ComplaintUpdate[]
  origin: 'hologram' | 'assistant' | 'demo' | 'coach'
}

export interface JournalDoc extends Doc {
  text: string
  mood?: number
  /** Kayıt hekimle paylaşılmaz (yalnızca astronot görür) */
  private: boolean
}

export interface MoodDoc extends Doc {
  value: number
  tags: string[]
}

export interface WaterDoc extends Doc {
  ml: number
}

export interface TaskDoc extends Doc {
  title: string
  day: number
  done: boolean
}

export interface TaskDoneDoc extends Doc {
  done: boolean
}

export interface MessageDoc extends Doc {
  from: CrewId | 'surgeon' | 'system'
  to: CrewId | 'surgeon'
  text: string
  /** Sistem bildirimlerinde metnin iki dilli hali */
  i18n?: Tx
  /** Tek yönlü iletişim gecikmesi (ms) */
  delayMs: number
  deliverAt: number
  kind: 'message' | 'report' | 'alert'
  /** Kesinti sırasında gönderildiyse kuyrukta bekler */
  queued?: boolean
  /** Mürettebat bildirimi alıcının ekranında gösterildi (bir kez gösterilir) */
  ack?: boolean
  /** Hekimle iletişim isteği: çift gönderimi önleyen kimlik, belirtiler ve gönderim anındaki veri eki (değişmez) */
  requestId?: string
  symptoms?: ContactSymptom[]
  other?: boolean
  attachment?: AttachmentSnapshot | null
}

export interface SeenDoc extends Doc {
  level: AlertLevel
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  ts: number
}

export interface ChatDoc extends Doc {
  title: string
  mode: AssistantMode
  messages: ChatMessage[]
  /** Psikolog modundaki konuşmalar hekimle paylaşılmaz */
  private: boolean
}

export interface ImportDoc extends Doc {
  dataset: string
  /** Verinin kaynağı (ör. "NASA Space Apps 2026 Resources") */
  provider?: string
  url?: string
  indicator: IndicatorId
  count: number
  from: number
  to: number
  /** Yükleyenin rolü */
  by?: 'astronaut' | 'surgeon'
}

export type AlertLevel = 'bilgi' | 'dikkat' | 'kritik'
export type AssistantMode = 'general' | 'coach' | 'psych' | 'friend' | 'medical'

/** Analizin bulduğu durum (uyarı) */
export interface Finding {
  /** Aynı durum için sabit anahtar (U-12: durum değişmedikçe tekrar uyarılmaz) */
  key: string
  level: AlertLevel
  indicator?: IndicatorId
  region?: BodyRegion
  title: Tx
  /** Neden verildiği (sayılarla, sade dille) */
  reason: Tx
  /** Ne yapılmalı */
  action: Tx
  sources: (SourceId | 'vitalis')[]
  ts: number
  /** Kritik durumlar uçuş hekimine otomatik bildirilir (D-01) */
  notifyDoctor: boolean
  /** İlgili sayfa (0 ana, 1 zihin, 2 spor, 3 doktor) */
  page: number
}

export interface IndicatorState {
  id: IndicatorId
  value: number | null
  value2?: number
  t: number | null
  status: Status
  label: Tx
  basis: SourceId | 'vitalis'
  source: PointSource | null
  /** Kişisel başlangıç değeri */
  baseline?: number
  baseline2?: number
}

export type Fitness = 'fit' | 'caution' | 'unfit'

export interface Snapshot {
  astronaut: CrewId
  now: number
  /** Yaş, boy, kilo ve vücut kitle indeksi (düzenlenebilir) */
  profile: Profile
  /** Kişisel normal (U-04): son 14 günün verisinden; profil değişince yeniden öğrenilir */
  personal: Record<PersonalId, PersonalNormal>
  missionDay: number
  indicators: Record<IndicatorId, IndicatorState>
  findings: Finding[]
  /** 0-100 genel sağlık puanı ve dökümü (hekim görünümü) */
  score: number
  scoreParts: { label: Tx; delta: number }[]
  overall: Status
  /** Toplam radyasyon dozu ve kariyer sınırına oranı */
  dose: { totalMsv: number; percent: number; todayMsv: number }
  water: { todayMl: number; targetMl: number; expectedMl: number }
  exercise: { todayMin: number; plannedMin: number; targetMin: number; doneItems: number; totalItems: number }
  co2: { latest: number; avg7: number }
  /** Göreve uygunluk (U-06): uyku ve tepki süresinden */
  fitness: { state: Fitness; reason: Tx }
  /** Kemik kaybı tahmini (U-08): egzersize uyumla birlikte */
  bone: { estimatedLossPct: number; withoutExercisePct: number; adherence: number }
  activeComplaints: ComplaintDoc[]
  /** delayMs: simülasyonun kullandığı gecikme. rangeMs: gerçekte değiştiği aralık (yalnızca Mars'ta; gezegenlerin konumuna bağlı) */
  comm: { blackout: boolean; delayMs: number; rangeMs?: [number, number] }
}

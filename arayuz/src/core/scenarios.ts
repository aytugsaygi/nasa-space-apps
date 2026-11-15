import type { IndicatorId } from './catalog'
import { tx, type Tx } from './tx'

/*
 * Demo senaryoları: sunumda bir düğmeyle tetiklenen sağlık durumları.
 * Bir senaryo veriye bir "olay" olarak yazılır; simülatör o andan sonraki değerleri değiştirir, analiz uyarıyı kendisi bulur.
 * Yani demo, gerçek bir ölçüm geldiğinde sistemin yapacağı şeyin aynısını gösterir.
 */

export type ScenarioId =
  | 'bpLow'
  | 'bpHigh'
  | 'hrHigh'
  | 'spo2Low'
  | 'fever'
  | 'glucoseLow'
  | 'waterMissed'
  | 'sleepDebt'
  | 'workoutMissed'
  | 'radiationSpe'
  | 'co2High'
  | 'moodLow'
  | 'impactHand'
  | 'commBlackout'

export type ScenarioGroup = 'vitals' | 'routine' | 'environment' | 'mind'

export interface ScenarioDef {
  id: ScenarioId
  group: ScenarioGroup
  label: Tx
  /** Senaryonun etkilediği göstergeler */
  indicators: IndicatorId[]
  /** Etkinin süresi (ms); günlük senaryolar o günün sonuna kadar sürer */
  durationMs: number
}

const H = 3_600_000

export const SCENARIOS: ScenarioDef[] = [
  { id: 'bpLow', group: 'vitals', label: tx('Tansiyon düştü', 'Blood pressure dropped'), indicators: ['bp', 'hr'], durationMs: 8 * H },
  { id: 'bpHigh', group: 'vitals', label: tx('Tansiyon yükseldi', 'Blood pressure rose'), indicators: ['bp'], durationMs: 8 * H },
  { id: 'hrHigh', group: 'vitals', label: tx('Nabız yükseldi', 'Heart rate rose'), indicators: ['hr'], durationMs: 0.5 * H },
  { id: 'spo2Low', group: 'vitals', label: tx('Oksijen düştü', 'Oxygen dropped'), indicators: ['spo2'], durationMs: 0.75 * H },
  { id: 'fever', group: 'vitals', label: tx('Ateş çıktı', 'Fever started'), indicators: ['temp', 'hr'], durationMs: 24 * H },
  { id: 'glucoseLow', group: 'vitals', label: tx('Kan şekeri düştü', 'Blood sugar dropped'), indicators: ['glucose'], durationMs: 6 * H },
  { id: 'waterMissed', group: 'routine', label: tx('Su içilmedi', 'Water not drunk'), indicators: ['water'], durationMs: 24 * H },
  { id: 'sleepDebt', group: 'routine', label: tx('Bir haftadır uyku azalıyor', 'Sleep falling for a week'), indicators: ['sleep', 'reaction'], durationMs: 24 * H },
  { id: 'workoutMissed', group: 'routine', label: tx('Antrenman yapılmadı', 'Workout skipped'), indicators: ['exercise'], durationMs: 24 * H },
  { id: 'moodLow', group: 'mind', label: tx('Ruh hali 3 gündür düşük', 'Mood low for 3 days'), indicators: ['mood'], durationMs: 24 * H },
  { id: 'radiationSpe', group: 'environment', label: tx('Güneş parçacık olayı', 'Solar particle event'), indicators: ['radiation'], durationMs: 24 * H },
  { id: 'co2High', group: 'environment', label: tx('Kabin CO₂ yükseldi', 'Cabin CO₂ rose'), indicators: ['co2'], durationMs: 48 * H },
  { id: 'impactHand', group: 'vitals', label: tx('Sağ elde darbe', 'Impact on right hand'), indicators: [], durationMs: 0 },
  { id: 'commBlackout', group: 'environment', label: tx('İletişim kesintisi (Mars kavuşumu)', 'Communication blackout (Mars conjunction)'), indicators: [], durationMs: 72 * H },
]

export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<ScenarioId, ScenarioDef>

export const SCENARIO_GROUPS: { id: ScenarioGroup; label: Tx }[] = [
  { id: 'vitals', label: tx('Yaşamsal değerler', 'Vital signs') },
  { id: 'routine', label: tx('Günlük rutin', 'Daily routine') },
  { id: 'mind', label: tx('Zihinsel sağlık', 'Mental health') },
  { id: 'environment', label: tx('Ortam ve iletişim', 'Environment and communication') },
]

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && SCENARIOS.some((s) => s.id === v)
}

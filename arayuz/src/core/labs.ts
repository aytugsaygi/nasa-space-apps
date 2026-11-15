import { CREW, DAY, MISSION, missionDay, type CrewId } from './crew'
import { _hash } from './sim'
import { tx, type Tx } from './tx'

/*
 * Kan tahlilleri. İstasyonda alınan kan örnekleri santrifüjlenip dondurulur ve sonradan incelenir (nasaBloodBlog).
 * Bu yüzden son örneğin sonucu "analiz bekliyor" görünür; önceki örneklerin sonuçları gelmiştir.
 *
 * Referans aralıkları NASA OSDR'deki Inspiration4 verisinin (OSD-569 tam kan sayımı, OSD-575 metabolik panel) laboratuvar
 * aralıklarıdır. Mürettebatımızın değerleri kurgusaldır (simülasyon); gerçek NASA verisi ayrıca, kendi grafiğinde gösterilir.
 */

export interface Analyte {
  /** OSDR dosyasındaki adı */
  key: string
  name: Tx
  unit: string
  panel: 'CBC' | 'CMP'
  /** Referans aralıkları (OSDR, cinsiyete göre) */
  range: { m: [number, number]; f: [number, number] }
  digits: number
}

export const ANALYTES: Analyte[] = [
  { key: 'HEMOGLOBIN', name: tx('Hemoglobin', 'Hemoglobin'), unit: 'g/dL', panel: 'CBC', range: { m: [13.2, 17.1], f: [11.7, 15.5] }, digits: 1 },
  { key: 'HEMATOCRIT', name: tx('Hematokrit', 'Hematocrit'), unit: '%', panel: 'CBC', range: { m: [38.5, 50], f: [35, 45] }, digits: 1 },
  { key: 'WHITE BLOOD CELL COUNT', name: tx('Lökosit (beyaz kan hücresi)', 'White blood cells'), unit: '×10³/µL', panel: 'CBC', range: { m: [3.8, 10.8], f: [3.8, 10.8] }, digits: 1 },
  { key: 'PLATELET COUNT', name: tx('Trombosit', 'Platelets'), unit: '×10³/µL', panel: 'CBC', range: { m: [140, 400], f: [140, 400] }, digits: 0 },
  { key: 'GLUCOSE', name: tx('Glikoz', 'Glucose'), unit: 'mg/dL', panel: 'CMP', range: { m: [65, 99], f: [65, 99] }, digits: 0 },
  { key: 'CALCIUM', name: tx('Kalsiyum', 'Calcium'), unit: 'mg/dL', panel: 'CMP', range: { m: [8.6, 10.3], f: [8.6, 10.3] }, digits: 1 },
  { key: 'CREATININE', name: tx('Kreatinin', 'Creatinine'), unit: 'mg/dL', panel: 'CMP', range: { m: [0.6, 1.35], f: [0.5, 1.1] }, digits: 2 },
  { key: 'SODIUM', name: tx('Sodyum', 'Sodium'), unit: 'mmol/L', panel: 'CMP', range: { m: [135, 146], f: [135, 146] }, digits: 0 },
  { key: 'POTASSIUM', name: tx('Potasyum', 'Potassium'), unit: 'mmol/L', panel: 'CMP', range: { m: [3.5, 5.3], f: [3.5, 5.3] }, digits: 1 },
  { key: 'ALBUMIN', name: tx('Albümin', 'Albumin'), unit: 'g/dL', panel: 'CMP', range: { m: [3.6, 5.1], f: [3.6, 5.1] }, digits: 1 },
  { key: 'ALT', name: tx('ALT (karaciğer)', 'ALT (liver)'), unit: 'U/L', panel: 'CMP', range: { m: [9, 46], f: [6, 29] }, digits: 0 },
  { key: 'AST', name: tx('AST (karaciğer)', 'AST (liver)'), unit: 'U/L', panel: 'CMP', range: { m: [10, 40], f: [10, 30] }, digits: 0 },
]

export type Flag = 'normal' | 'low' | 'high'

export interface LabDraw {
  /** Görev günü */
  day: number
  ts: number
  /** Sonuç geldi mi (örnek dondurucuda bekliyorsa false) */
  analyzed: boolean
  results: { key: string; value: number; flag: Flag }[]
}

/** Planlı örnek günleri: uçuş öncesi başlangıç (-30) ve görevin 15., 30., 60., 90., 120., 150. günleri */
export const DRAW_DAYS = [-30, 15, 30, 60, 90, 120, 150]

/**
 * Sonucun gelmesi için geçen süre (gün): örnekler bir sonraki kargo dönüşüyle incelenir (demo varsayımı).
 * 30 gün seçildi: her an en az bir örnek "analiz bekliyor" görünür (ör. 142. günde 120. günün örneği).
 */
export const ANALYSIS_DELAY_DAYS = 30

export function labDraws(astronaut: CrewId, now: number): LabDraw[] {
  const m = CREW[astronaut]
  const today = missionDay(now)
  return DRAW_DAYS.filter((d) => d <= today).map((day) => {
    const ts = MISSION.start + day * DAY + 5 * 3_600_000
    const analyzed = day < 0 || today - day >= ANALYSIS_DELAY_DAYS
    const results = ANALYTES.map((a, i) => {
      const [lo, hi] = m.sex === 'f' ? a.range.f : a.range.m
      const mid = (lo + hi) / 2
      const span = hi - lo
      // Kişiye özgü başlangıç (aralığın içinde) + örnekten örneğe küçük değişim
      const personal = (_hash(m.seed, 900 + i) - 0.5) * span * 0.45
      let value = mid + personal + (_hash(m.seed, 1000 + i, day + 40) - 0.5) * span * 0.25
      // Mori'nin karaciğer enzimleri son örneklerde hafif yüksek (hekim görünümünde örnek bir bulgu)
      if (astronaut === 'mori' && (a.key === 'ALT' || a.key === 'AST') && day >= 90) value = hi * 1.12
      value = Math.round(value * 10 ** a.digits) / 10 ** a.digits
      const flag: Flag = value < lo ? 'low' : value > hi ? 'high' : 'normal'
      return { key: a.key, value, flag }
    })
    return { day, ts, analyzed, results }
  })
}

import type { SourceId } from './sources'
import { tx, type Tx } from './tx'

/*
 * Gösterge kataloğu: uygulamanın izlediği her göstergenin adı, birimi, normal aralığı, eşikleri ve kaynakları.
 *
 * Esnek yapı: NASA'nın 13 Kasım'da vereceği veriler ya da ekip hekiminin kararlarıyla eşikler değişirse yalnızca bu dosya
 * değişir; arayüz, analiz, rapor ve asistan buradan okur. Eşiklerin dayanağı her bantta yazılıdır:
 * - "source": eşik o kaynaktan alınmıştır
 * - "vitalis": kaynakta eşik yoktur; demo için konmuş Vitalis kuralıdır ve arayüzde öyle etiketlenir
 * Normal aralıklar Dünya'daki sağlıklı yetişkinler içindir; uzayda değerler kişiden kişiye değişir. Bu yüzden analiz
 * her astronotun uçuş öncesi başlangıç değeriyle de karşılaştırır (analysis.ts).
 */

export type Status = 'normal' | 'dikkat' | 'kritik'

export type IndicatorId = 'hr' | 'bp' | 'spo2' | 'temp' | 'resp' | 'glucose' | 'sleep' | 'mood' | 'reaction' | 'exercise' | 'water' | 'radiation' | 'co2'

export type BodyRegion = 'bas' | 'gogus' | 'sirt' | 'ustKol' | 'onKol' | 'eller' | 'bacaklar' | 'ayaklar' | 'tum'

export interface Band {
  status: Status
  /** Alt sınır (dahil) */
  min?: number
  /** Üst sınır (hariç) */
  max?: number
  label: Tx
  /** Eşiğin dayanağı: bir kaynak ya da Vitalis'in demo kuralı */
  basis: SourceId | 'vitalis'
}

export interface Indicator {
  id: IndicatorId
  name: Tx
  unit: Tx
  /** Ondalık basamak sayısı */
  digits: number
  /** Ölçüm sıklığı: canlı (sensör), günlük, saatlik, haftalık */
  cadence: 'live' | 'daily' | 'hourly' | 'weekly'
  /** Kartın altında gösterilen referans aralığı */
  range: Tx
  rangeSource: SourceId
  /** Grafikteki normal bant [alt, üst] */
  band: [number, number]
  /** Grafik ekseninin önerilen sınırları */
  axis: [number, number]
  bands: Band[]
  /** İkinci değer (tansiyonda küçük tansiyon) */
  bands2?: Band[]
  /** Elle girişte kabul edilen değerler (ör. negatif nabız reddedilir) */
  valid: [number, number]
  valid2?: [number, number]
  sources: SourceId[]
  region: BodyRegion
  /** Uzayda neden önemli (kartta ve raporda) */
  space: Tx
  /** Günlük hedef (su, egzersiz, uyku) */
  target?: number
}

const T = tx

export const INDICATORS: Record<IndicatorId, Indicator> = {
  hr: {
    id: 'hr',
    name: T('Nabız', 'Heart rate'),
    unit: T('atım/dk', 'bpm'),
    digits: 0,
    cadence: 'live',
    range: T('Dinlenmede 60–100 atım/dk', '60–100 bpm at rest'),
    rangeSource: 'mpVitals',
    band: [60, 100],
    axis: [40, 140],
    bands: [
      { status: 'kritik', max: 40, label: T('Çok düşük', 'Very low'), basis: 'vitalis' },
      { status: 'dikkat', min: 40, max: 50, label: T('Düşük', 'Low'), basis: 'vitalis' },
      { status: 'normal', min: 50, max: 101, label: T('Normal', 'Normal'), basis: 'mpVitals' },
      { status: 'dikkat', min: 101, max: 130, label: T('Dinlenme için yüksek', 'High for rest'), basis: 'mpVitals' },
      { status: 'kritik', min: 130, label: T('Çok yüksek', 'Very high'), basis: 'vitalis' },
    ],
    valid: [25, 230],
    sources: ['mpVitals', 'tb033'],
    region: 'gogus',
    space: T(
      'Ağırlıksız ortamda vücut sıvıları yer değiştirir ve kalp-damar sistemi buna uyum sağlar. Nabız, astronotun kendi başlangıç değeriyle birlikte izlenir.',
      'In weightlessness body fluids shift and the cardiovascular system adapts. Heart rate is tracked together with the astronaut\'s own baseline.',
    ),
  },
  bp: {
    id: 'bp',
    name: T('Tansiyon', 'Blood pressure'),
    unit: T('mmHg', 'mmHg'),
    digits: 0,
    cadence: 'daily',
    range: T('Normal: 120/80 altı (90/60 üstü)', 'Normal: below 120/80 (above 90/60)'),
    rangeSource: 'mpBloodPressure',
    band: [90, 120],
    axis: [50, 190],
    bands: [
      { status: 'kritik', max: 70, label: T('Çok düşük', 'Very low'), basis: 'vitalis' },
      { status: 'dikkat', min: 70, max: 90, label: T('Düşük tansiyon', 'Low blood pressure'), basis: 'mpVitals' },
      { status: 'normal', min: 90, max: 120, label: T('Normal', 'Normal'), basis: 'mpBloodPressure' },
      { status: 'dikkat', min: 120, max: 130, label: T('Yükselmiş', 'Elevated'), basis: 'mpBloodPressure' },
      { status: 'dikkat', min: 130, max: 140, label: T('Yüksek tansiyon, evre 1', 'High blood pressure, stage 1'), basis: 'mpBloodPressure' },
      { status: 'dikkat', min: 140, max: 181, label: T('Yüksek tansiyon, evre 2', 'High blood pressure, stage 2'), basis: 'mpBloodPressure' },
      { status: 'kritik', min: 181, label: T('Tansiyon krizi', 'Hypertensive crisis'), basis: 'mpBloodPressure' },
    ],
    bands2: [
      { status: 'kritik', max: 40, label: T('Çok düşük', 'Very low'), basis: 'vitalis' },
      { status: 'dikkat', min: 40, max: 60, label: T('Düşük tansiyon', 'Low blood pressure'), basis: 'mpVitals' },
      { status: 'normal', min: 60, max: 80, label: T('Normal', 'Normal'), basis: 'mpBloodPressure' },
      { status: 'dikkat', min: 80, max: 90, label: T('Yüksek tansiyon, evre 1', 'High blood pressure, stage 1'), basis: 'mpBloodPressure' },
      { status: 'dikkat', min: 90, max: 121, label: T('Yüksek tansiyon, evre 2', 'High blood pressure, stage 2'), basis: 'mpBloodPressure' },
      { status: 'kritik', min: 121, label: T('Tansiyon krizi', 'Hypertensive crisis'), basis: 'mpBloodPressure' },
    ],
    valid: [50, 260],
    valid2: [25, 160],
    sources: ['mpBloodPressure', 'mpVitals', 'tb033'],
    region: 'gogus',
    space: T(
      'Uzayda vücuttaki sıvı hacmi %12-15 azalır ve sıvılar baş bölgesine kayar. Tansiyon bu değişimi izlemenin temel yoludur.',
      'In space whole-body fluid volume drops by 12-15% and fluids shift toward the head. Blood pressure is a key way to follow this change.',
    ),
  },
  spo2: {
    id: 'spo2',
    name: T('Oksijen', 'Oxygen'),
    unit: T('%', '%'),
    digits: 0,
    cadence: 'live',
    range: T('Normal: %95–100', 'Normal: 95–100%'),
    rangeSource: 'mpPulseOx',
    band: [95, 100],
    axis: [80, 100],
    bands: [
      { status: 'kritik', max: 89, label: T('Acil (%88 ve altı)', 'Urgent (88% or lower)'), basis: 'mpPulseOx' },
      { status: 'dikkat', min: 89, max: 93, label: T('Hekime danış (%92 ve altı)', 'Call a doctor (92% or lower)'), basis: 'mpPulseOx' },
      { status: 'dikkat', min: 93, max: 95, label: T('Normalin altında', 'Below normal'), basis: 'mpPulseOx' },
      { status: 'normal', min: 95, label: T('Normal', 'Normal'), basis: 'mpPulseOx' },
    ],
    valid: [50, 100],
    sources: ['mpPulseOx', 'tb004'],
    region: 'gogus',
    space: T(
      'Kabin havası ve solunum sorunlarını gösterir. Ölçüm gerçek değerden %2-4 sapabilir. Eşikler genel klinik eşiklerdir; astronotlara özel yayımlanmış bir aralık bulunamadı.',
      'Reflects cabin air and breathing problems. Readings can be 2-4% off the true value. These are general clinical thresholds; no published astronaut-specific range was found.',
    ),
  },
  temp: {
    id: 'temp',
    name: T('Vücut ısısı', 'Body temperature'),
    unit: T('°C', '°C'),
    digits: 1,
    cadence: 'live',
    range: T('Normal: 36,5–37,3 °C', 'Normal: 36.5–37.3 °C'),
    rangeSource: 'mpVitals',
    band: [36.5, 37.3],
    axis: [35, 40],
    bands: [
      { status: 'kritik', max: 35, label: T('Çok düşük', 'Very low'), basis: 'vitalis' },
      { status: 'dikkat', min: 35, max: 36.1, label: T('Normalin altında', 'Below normal'), basis: 'vitalis' },
      { status: 'normal', min: 36.1, max: 37.4, label: T('Normal', 'Normal'), basis: 'mpVitals' },
      { status: 'dikkat', min: 37.4, max: 38, label: T('Hafif yüksek', 'Slightly high'), basis: 'mpVitals' },
      { status: 'dikkat', min: 38, max: 39.5, label: T('Ateş', 'Fever'), basis: 'vitalis' },
      { status: 'kritik', min: 39.5, label: T('Yüksek ateş', 'High fever'), basis: 'vitalis' },
    ],
    valid: [30, 44],
    sources: ['mpVitals'],
    region: 'tum',
    space: T('Enfeksiyonun ilk belirtisi olabilir. Kapalı ortamda bir mürettebatın hastalığı diğerlerini de etkiler.', 'Can be the first sign of an infection. In a closed habitat one crew member\'s illness affects the others.'),
  },
  resp: {
    id: 'resp',
    name: T('Solunum', 'Breathing rate'),
    unit: T('nefes/dk', 'breaths/min'),
    digits: 0,
    cadence: 'live',
    range: T('Dinlenmede 12–18 nefes/dk', '12–18 breaths/min at rest'),
    rangeSource: 'mpVitals',
    band: [12, 18],
    axis: [6, 32],
    bands: [
      { status: 'kritik', max: 8, label: T('Çok yavaş', 'Very slow'), basis: 'vitalis' },
      { status: 'dikkat', min: 8, max: 12, label: T('Yavaş', 'Slow'), basis: 'mpVitals' },
      { status: 'normal', min: 12, max: 19, label: T('Normal', 'Normal'), basis: 'mpVitals' },
      { status: 'dikkat', min: 19, max: 30, label: T('Hızlı', 'Fast'), basis: 'mpVitals' },
      { status: 'kritik', min: 30, label: T('Çok hızlı', 'Very fast'), basis: 'vitalis' },
    ],
    valid: [3, 70],
    sources: ['mpVitals'],
    region: 'gogus',
    space: T('Kabin CO₂ seviyesi ve efor solunumu etkiler.', 'Cabin CO₂ and effort affect breathing.'),
  },
  glucose: {
    id: 'glucose',
    name: T('Kan şekeri', 'Blood sugar'),
    unit: T('mg/dL', 'mg/dL'),
    digits: 0,
    cadence: 'daily',
    range: T('Açlık: 70–99 mg/dL', 'Fasting: 70–99 mg/dL'),
    rangeSource: 'cdcDiabetes',
    band: [70, 99],
    axis: [40, 160],
    bands: [
      { status: 'kritik', max: 54, label: T('Ciddi düşük', 'Seriously low'), basis: 'mpLowSugar' },
      { status: 'dikkat', min: 54, max: 70, label: T('Düşük', 'Low'), basis: 'mpLowSugar' },
      { status: 'normal', min: 70, max: 100, label: T('Normal', 'Normal'), basis: 'cdcDiabetes' },
      { status: 'dikkat', min: 100, max: 126, label: T('Prediyabet aralığı', 'Prediabetes range'), basis: 'cdcDiabetes' },
      { status: 'dikkat', min: 126, max: 250, label: T('Diyabet aralığı (tanı aralığıdır, acil değildir)', 'Diabetes range (a diagnostic range, not an emergency)'), basis: 'cdcDiabetes' },
      { status: 'kritik', min: 250, label: T('Çok yüksek', 'Very high'), basis: 'vitalis' },
    ],
    valid: [20, 600],
    sources: ['cdcDiabetes', 'mpLowSugar'],
    region: 'tum',
    space: T(
      'Beslenmenin ve enerji dengesinin göstergesidir. Konu metni bu birimi örnek veriyor. Eşikler genel klinik eşiklerdir; astronotlara özel yayımlanmış bir aralık bulunamadı.',
      'A marker of nutrition and energy balance. The challenge text gives this unit as an example. These are general clinical thresholds; no published astronaut-specific range was found.',
    ),
  },
  sleep: {
    id: 'sleep',
    name: T('Uyku', 'Sleep'),
    unit: T('sa', 'h'),
    digits: 1,
    cadence: 'daily',
    range: T('Yetişkin için 7–9 sa · NASA 8,5 sa planlar', 'Adults need 7–9 h · NASA schedules 8.5 h'),
    rangeSource: 'tb041',
    band: [7, 9],
    axis: [3, 10],
    bands: [
      { status: 'kritik', max: 4, label: T('Çok az', 'Far too little'), basis: 'vitalis' },
      { status: 'dikkat', min: 4, max: 6, label: T('Planlananın çok altında', 'Well below plan'), basis: 'vitalis' },
      // TB-041: 7 gün boyunca 6 saat uyku, 24-36 saat hiç uyumamaya eşdeğer performans kaybı yapar
      { status: 'dikkat', min: 6, max: 7, label: T('Önerilen 7 saatin altında', 'Below the recommended 7 hours'), basis: 'tb041' },
      { status: 'normal', min: 7, label: T('Normal', 'Normal'), basis: 'tb041' },
    ],
    valid: [0, 16],
    sources: ['sleepStudy', 'tb033', 'std3001v1', 'tb041'],
    region: 'bas',
    target: 8.5,
    space: T(
      'İstasyonda ortalama uyku 6,09 saattir ve uyku ilacı kullanımı yaygındır (mürettebatın ~%71\'i). NASA\'ya göre yedi gün boyunca 6 saat uyumak, 24-36 saat hiç uyumamak kadar performans düşürür.',
      'Average sleep on the station is 6.09 hours and sleep medication use is common (~71% of crew). NASA notes that seven days of six hours of sleep lowers performance as much as 24 to 36 hours without sleep.',
    ),
  },
  mood: {
    id: 'mood',
    name: T('Ruh hali', 'Mood'),
    unit: T('/5', '/5'),
    digits: 1,
    cadence: 'daily',
    range: T('Kişiye göre · kendi başlangıcınla kıyaslanır', 'Personal · compared with your own baseline'),
    rangeSource: 'tb016',
    band: [3, 5],
    axis: [1, 5],
    bands: [
      { status: 'dikkat', max: 2, label: T('Çok kötü', 'Very low'), basis: 'vitalis' },
      { status: 'dikkat', min: 2, max: 2.6, label: T('Düşük', 'Low'), basis: 'vitalis' },
      { status: 'normal', min: 2.6, label: T('İyi', 'Good'), basis: 'tb016' },
    ],
    valid: [1, 5],
    sources: ['tb016', 'hrpHazards'],
    region: 'bas',
    space: T('Yalnızlık ve kapalı ortam, insan uzay uçuşunun beş tehlikesinden biridir.', 'Isolation and confinement is one of the five hazards of human spaceflight.'),
  },
  reaction: {
    id: 'reaction',
    name: T('Tepki süresi', 'Reaction time'),
    unit: T('ms', 'ms'),
    digits: 0,
    cadence: 'weekly',
    range: T('Uçuş öncesi başlangıcınla kıyaslanır', 'Compared with your pre-flight baseline'),
    rangeSource: 'tb016',
    band: [220, 300],
    axis: [180, 450],
    // Mutlak eşik yok; analiz başlangıca oranla değerlendirir (analysis.ts → relativeStatus)
    bands: [{ status: 'normal', label: T('Kişisel başlangıca göre', 'Relative to baseline'), basis: 'tb016' }],
    valid: [100, 2000],
    sources: ['tb016'],
    region: 'bas',
    space: T(
      'NASA bilişsel testleri ayda bir yapar ve sonucu astronotun uçuş öncesi değeriyle karşılaştırır.',
      'NASA runs cognitive tests monthly and compares them with the astronaut\'s pre-flight values.',
    ),
  },
  exercise: {
    id: 'exercise',
    name: T('Egzersiz', 'Exercise'),
    unit: T('dk', 'min'),
    digits: 0,
    cadence: 'daily',
    range: T('Hedef: günde ~120 dk', 'Target: ~120 min a day'),
    rangeSource: 'nasaExercise',
    band: [100, 140],
    axis: [0, 160],
    bands: [
      { status: 'dikkat', max: 60, label: T('Planlananın yarısından az', 'Less than half of the plan'), basis: 'vitalis' },
      { status: 'normal', min: 60, label: T('Normal', 'Normal'), basis: 'nasaExercise' },
    ],
    valid: [0, 400],
    sources: ['nasaExercise', 'tb033', 'boneFracture'],
    region: 'bacaklar',
    target: 120,
    space: T(
      'Egzersiz, uzayda ayda %1-1,5 olan kemik kaybını büyük ölçüde yavaşlatır; ama kayıp tamamen durmaz.',
      'Exercise greatly slows the 1-1.5% monthly bone loss in space, but it does not stop it completely.',
    ),
  },
  water: {
    id: 'water',
    name: T('Su', 'Water'),
    unit: T('mL', 'mL'),
    digits: 0,
    cadence: 'daily',
    range: T('Hedef: günde 2,5 L · en az 2 L', 'Target: 2.5 L a day · at least 2 L'),
    rangeSource: 'tb027',
    band: [2200, 2800],
    axis: [0, 3200],
    bands: [
      // nutritionBands Req. 6: sıvı 1-1,5 mL/kcal, en az 2000 mL; günde 2 L altı belgede kırmızı banttır
      { status: 'dikkat', max: 2000, label: T('Günlük en az 2 L\'nin altında', 'Below the daily minimum of 2 L'), basis: 'nutritionBands' },
      { status: 'normal', min: 2000, label: T('Normal', 'Normal'), basis: 'nutritionBands' },
    ],
    valid: [0, 6000],
    sources: ['tb027', 'nutritionBands'],
    region: 'tum',
    target: 2500,
    space: T(
      'Vücut ağırlığının %2,5\'i kadar su kaybı karar vermeyi ve konsantrasyonu bozar, fiziksel performansı %35 düşürür.',
      'Losing water equal to 2.5% of body weight impairs decision-making and concentration and cuts physical performance by 35%.',
    ),
  },
  radiation: {
    id: 'radiation',
    name: T('Radyasyon', 'Radiation'),
    unit: T('mSv/gün', 'mSv/day'),
    digits: 2,
    cadence: 'daily',
    range: T('Kariyer sınırı 600 mSv · olay başına 250 mSv', 'Career limit 600 mSv · 250 mSv per event'),
    rangeSource: 'tb020',
    band: [0, 0.8],
    axis: [0, 2],
    bands: [
      // TB-020: araç tasarımı GCR doz hızını serbest uzayda 1,3 mSv/gün (yüzeyde 0,9) altına indirmeli
      { status: 'normal', max: 1.3, label: T('Tasarım sınırının altında', 'Below the design limit'), basis: 'tb020' },
      { status: 'dikkat', min: 1.3, max: 10, label: T('Tasarım sınırının üstünde', 'Above the design limit'), basis: 'tb020' },
      { status: 'kritik', min: 10, label: T('Güneş parçacık olayı düzeyi', 'Solar particle event level'), basis: 'vitalis' },
    ],
    valid: [0, 500],
    sources: ['tb020', 'donki'],
    region: 'tum',
    space: T(
      'Uzay radyasyonu uzun vadede kanser riskini artırır. Toplam doz, NASA\'nın 600 mSv kariyer sınırına göre izlenir. NASA, araçların günlük kozmik ışın dozunu serbest uzayda 1,3 mSv, gezegen yüzeyinde 0,9 mSv altına indirmesini ister.',
      'Space radiation raises long-term cancer risk. Total dose is tracked against NASA\'s 600 mSv career limit. NASA requires vehicles to keep the daily cosmic-ray dose below 1.3 mSv in free space and 0.9 mSv on planetary surfaces.',
    ),
  },
  co2: {
    id: 'co2',
    name: T('Kabin CO₂', 'Cabin CO₂'),
    unit: T('mmHg', 'mmHg'),
    digits: 1,
    cadence: 'hourly',
    range: T('1 saatlik ortalama ≤3 mmHg · 7 günlük <2,5', '1-hour average ≤3 mmHg · 7-day <2.5'),
    rangeSource: 'tb004',
    band: [0, 3],
    axis: [0, 6],
    bands: [
      { status: 'normal', max: 2.3, label: T('Sınırın altında', 'Below the limit'), basis: 'tb004' },
      // co2Ops: ISS mürettebatı belirtileri 2,3 mmHg'den itibaren bildirdi; durum değişmez, yalnızca etiket uyarır
      { status: 'normal', min: 2.3, max: 3.05, label: T('Sınırın altında (bazı mürettebat belirti bildirdi)', 'Below the limit (some crews reported symptoms)'), basis: 'co2Ops' },
      { status: 'dikkat', min: 3.05, max: 4.5, label: T('Sınırın üstünde (baş ağrısı bildirilen aralık)', 'Above the limit (range where headaches are reported)'), basis: 'tb004' },
      { status: 'kritik', min: 4.5, label: T('Yorgunluk ve halsizlik bildirilen aralık', 'Range where fatigue and malaise are reported'), basis: 'tb004' },
    ],
    valid: [0, 20],
    sources: ['tb004', 'co2Ops', 'std3001v2'],
    region: 'bas',
    space: T(
      'Kabinde CO₂ birikebilir. 7 günlük ortalama 2,5 mmHg altında tutulursa baş ağrısı riski %1\'in altında kalır. ISS mürettebatı belirtileri 2,3 mmHg\'den itibaren bildirdi; NASA\'ya göre 0,5-2,0 mmHg sağlık ve performansı koruyabilir.',
      'CO₂ can build up in the cabin. Keeping the 7-day average below 2.5 mmHg keeps headache risk below 1%. ISS crews reported symptoms from 2.3 mmHg; NASA notes 0.5-2.0 mmHg may maintain health and performance.',
    ),
  },
}

export const INDICATOR_IDS = Object.keys(INDICATORS) as IndicatorId[]

/** Ana sayfadaki göstergeler (kart sırası) */
export const MAIN_INDICATORS = ['hr', 'bp', 'spo2', 'temp', 'glucose', 'sleep', 'radiation', 'mood'] as const satisfies readonly IndicatorId[]

/** Kariyer radyasyon sınırı (mSv, TB-020) */
export const CAREER_LIMIT_MSV = 600

const SEVERITY: Record<Status, number> = { normal: 0, dikkat: 1, kritik: 2 }
export const worse = (a: Status, b: Status): Status => (SEVERITY[a] >= SEVERITY[b] ? a : b)
export const severity = (s: Status) => SEVERITY[s]

export function bandFor(bands: Band[], value: number): Band {
  return bands.find((b) => (b.min === undefined || value >= b.min) && (b.max === undefined || value < b.max)) ?? bands[bands.length - 1]
}

export interface Evaluation {
  status: Status
  label: Tx
  basis: SourceId | 'vitalis'
}

/** Bir ölçümü katalogdaki bantlara göre değerlendirir; tansiyonda iki değerden kötü olanı geçerlidir */
export function evaluate(id: IndicatorId, value: number, value2?: number): Evaluation {
  const ind = INDICATORS[id]
  const a = bandFor(ind.bands, value)
  if (ind.bands2 && value2 !== undefined) {
    const b = bandFor(ind.bands2, value2)
    const pick = severity(b.status) > severity(a.status) ? b : a
    return { status: pick.status, label: pick.label, basis: pick.basis }
  }
  return { status: a.status, label: a.label, basis: a.basis }
}

/** Tepki süresi gibi kişisel göstergeler: başlangıca oranla değerlendirilir (Vitalis kuralı, TB-016'daki başlangıç yöntemine dayanır) */
export function relativeStatus(value: number, baseline: number): Evaluation {
  const r = value / baseline
  if (r >= 1.35) return { status: 'kritik', label: T('Başlangıcından çok yavaş', 'Much slower than baseline'), basis: 'vitalis' }
  if (r >= 1.15) return { status: 'dikkat', label: T('Başlangıcından yavaş', 'Slower than baseline'), basis: 'vitalis' }
  return { status: 'normal', label: T('Başlangıcına yakın', 'Close to baseline'), basis: 'tb016' }
}

/** Elle girilen değerin geçerliliği (V-02): katalogdaki aralık dışındaki değerler kabul edilmez */
export function isValid(id: IndicatorId, value: number, value2?: number): boolean {
  const ind = INDICATORS[id]
  if (!Number.isFinite(value) || value < ind.valid[0] || value > ind.valid[1]) return false
  if (ind.valid2) {
    if (value2 === undefined || !Number.isFinite(value2) || value2 < ind.valid2[0] || value2 > ind.valid2[1]) return false
    if (value2 >= value) return false
  }
  return true
}

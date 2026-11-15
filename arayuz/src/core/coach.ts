import type { CrewId, Environment } from './crew'
import type { ComplaintDoc, RegionId } from './model'
import type { SourceId } from './sources'
import type { Doc } from './store'
import { tx, type Tx } from './tx'

/*
 * Spor koçu: günlük program bulunulan ortamın cihazlarına göre kurulur (R-06).
 * - Uzay istasyonu: ARED direnç, T2 koşu bandı ve CEVIS bisiklet. NASA'ya göre astronotlar günde ortalama iki saat
 *   egzersiz yapar (nasaExercise); program bu yüzden ~120 dakikadır.
 * - Orion uzay aracı: yalnızca kablolu uçan tekerlek (flywheel); günde 30 dakika squat, deadlift, kürek ve topuk
 *   kaldırma (orionLife, orionFlywheel).
 * - Ay ve Mars üssü: NASA'nın yayımlanmış bir üs egzersiz programı yok. Kısmi yerçekimi kas ve kemiği korumaya yetmediği
 *   için egzersiz sürer (partialGravity); taşınabilir uçan tekerlek hareketleri ısınma ve esnetmeyle birlikte kullanılır.
 *   Cihaz ve süre seçimi bir Vitalis varsayımıdır ve programda öyle yazar.
 *
 * Program, astronotun şikayetlerine göre uyarlanır: şikayet edilen bölgeyi yükleyen hareketler şiddete göre hafifletilir
 * ya da aynı kas grubunu çalıştıran, o bölgeyi yormayan bir hareketle değiştirilir. Kurallar açıklanabilir ve sabittir
 * (yapay zeka program üretmez; dil modeli bağlanınca yalnızca açıklamayı yazar).
 */

export type ExerciseId =
  | 'warmup'
  | 'aredSquat'
  | 'aredDeadlift'
  | 'aredHeelRaise'
  | 'aredBench'
  | 'aredRow'
  | 't2Run'
  | 'cevisCycle'
  | 'coreBrace'
  | 'spineStretch'
  | 'flySquat'
  | 'flyDeadlift'
  | 'flyBentRow'
  | 'flyHeelRaise'
  | 'flyRowing'

export type Device = 'ARED' | 'T2' | 'CEVIS' | 'Flywheel' | 'none'

/** Bir hareketin vücut bölgelerine yükü: 0 yok, 1 hafif, 2 orta, 3 yoğun */
export type Load = Partial<Record<RegionId, number>>

export interface Exercise {
  id: ExerciseId
  name: Tx
  device: Device
  kind: 'resistance' | 'aerobic' | 'mobility'
  sets?: number
  reps?: number
  minutes: number
  load: Load
  /** Çalışan kaslar (hologramda parlar) */
  targets: RegionId[]
  /** Doğru form için ipuçları */
  cues: Tx[]
  /** Hareketin kısa açıklaması */
  about: Tx
}

const T = tx

export const EXERCISES: Record<ExerciseId, Exercise> = {
  warmup: {
    id: 'warmup',
    name: T('Omuz ve kalça ısınması', 'Shoulder and hip warm-up'),
    device: 'none',
    kind: 'mobility',
    minutes: 6,
    load: { ustKol: 1, sirt: 1 },
    targets: ['ustKol', 'sirt', 'bacaklar'],
    cues: [T('Kolları geniş daireler çizerek çevir', 'Circle your arms in wide loops'), T('Ayakları ayak tutucuya sabitle', 'Lock your feet into the foot restraints')],
    about: T('Omuz ve kalça eklemlerini ısıtır, kaslara kan akışını artırır. Ağır setlerden önce yapılınca sakatlanma riskini azaltır.', 'Warms up the shoulder and hip joints and increases blood flow to the muscles. Done before heavy sets, it lowers injury risk.'),
  },
  aredSquat: {
    id: 'aredSquat',
    name: T('ARED squat', 'ARED squat'),
    device: 'ARED',
    kind: 'resistance',
    sets: 3,
    reps: 8,
    minutes: 12,
    load: { bacaklar: 3, sirt: 2, ayaklar: 1, ustKol: 1, eller: 1 },
    targets: ['bacaklar', 'sirt'],
    cues: [
      T('Bar omuzlarının üstünde, sırtın düz', 'Bar on your shoulders, back straight'),
      T('Dizlerin ayak uçlarının yönünde', 'Knees track over your toes'),
      T('Kalçanı diz hizasına kadar indir', 'Lower your hips to knee level'),
    ],
    about: T('Bacak ve kalça kaslarını çalıştırır. Ağırlıksız ortamda bacak kemikleri yük almadığı için kemik kaybını yavaşlatmanın temel hareketidir.', 'Works the leg and hip muscles. Leg bones carry no load in weightlessness, so this is the key move for slowing bone loss.'),
  },
  aredDeadlift: {
    id: 'aredDeadlift',
    name: T('ARED deadlift', 'ARED deadlift'),
    device: 'ARED',
    kind: 'resistance',
    sets: 3,
    reps: 8,
    minutes: 12,
    load: { eller: 3, onKol: 2, sirt: 3, bacaklar: 2, ustKol: 1 },
    targets: ['sirt', 'bacaklar', 'onKol'],
    cues: [T('Barı iki elinle omuz genişliğinde kavra', 'Grip the bar shoulder-width with both hands'), T('Kalçadan menteşe gibi eğil', 'Hinge at the hips'), T('Bel düz, bar bacaklarına yakın', 'Flat back, bar close to your legs')],
    about: T('Sırt, kalça ve arka bacak kaslarını birlikte çalıştırır; kavrama gücünü korur. Dünya\'ya dönüşte yerden yük kaldırmaya hazırlar.', 'Works the back, hips and hamstrings together and keeps grip strength. Prepares you to lift loads from the floor back on Earth.'),
  },
  aredHeelRaise: {
    id: 'aredHeelRaise',
    name: T('ARED topuk kaldırma', 'ARED heel raise'),
    device: 'ARED',
    kind: 'resistance',
    sets: 3,
    reps: 12,
    minutes: 8,
    load: { ayaklar: 3, bacaklar: 2, eller: 1 },
    targets: ['bacaklar', 'ayaklar'],
    cues: [T('Parmak uçlarına yüksel, 1 saniye bekle', 'Rise onto your toes, hold for 1 second'), T('Yavaşça in', 'Lower slowly')],
    about: T('Baldır kaslarını ve ayak kemiklerini çalıştırır. Uzayda en hızlı zayıflayan kaslardandır; dönüşte ayakta durmayı ve yürümeyi kolaylaştırır.', 'Works the calf muscles and foot bones. They are among the fastest to weaken in space; keeping them strong makes standing and walking easier after landing.'),
  },
  aredBench: {
    id: 'aredBench',
    name: T('ARED bench press', 'ARED bench press'),
    device: 'ARED',
    kind: 'resistance',
    sets: 3,
    reps: 10,
    minutes: 10,
    load: { eller: 2, onKol: 2, ustKol: 3, gogus: 3 },
    targets: ['gogus', 'ustKol'],
    cues: [T('Dirsekler gövdeye 45 derece', 'Elbows at 45 degrees to your body'), T('Barı göğüs hizasından it', 'Push the bar from chest level')],
    about: T('Göğüs, omuz ve kolun arka kaslarını çalıştırır. Üst gövde gücünü korur; istasyonda ekipman taşımak ve itmek için gerekir.', 'Works the chest, shoulders and the backs of the arms. Keeps upper-body strength for moving and pushing equipment on the station.'),
  },
  aredRow: {
    id: 'aredRow',
    name: T('ARED kürek çekme', 'ARED row'),
    device: 'ARED',
    kind: 'resistance',
    sets: 3,
    reps: 10,
    minutes: 10,
    load: { eller: 2, onKol: 2, ustKol: 2, sirt: 2 },
    targets: ['sirt', 'ustKol'],
    cues: [T('Kürek kemiklerini birbirine yaklaştır', 'Squeeze your shoulder blades together'), T('Barı göbeğine doğru çek', 'Pull the bar toward your navel')],
    about: T('Sırtın üst kısmını ve kürek kemiklerini çevreleyen kasları güçlendirir. İtme hareketlerini dengeler, duruşu düzgün tutar.', 'Strengthens the upper back and the muscles around the shoulder blades. Balances pushing moves and keeps your posture upright.'),
  },
  t2Run: {
    id: 't2Run',
    name: T('T2 koşu bandı', 'T2 treadmill run'),
    device: 'T2',
    kind: 'aerobic',
    minutes: 30,
    load: { bacaklar: 3, ayaklar: 3, sirt: 1 },
    targets: ['bacaklar', 'ayaklar', 'gogus'],
    cues: [T('Askı sistemini (harness) omuz ve kalçana tak', 'Clip the harness to your shoulders and hips'), T('Kısa ve sık adımlar', 'Short, quick steps')],
    about: T('Kalp-damar kondisyonunu korur. Askı sistemi seni banda bastırır; her adımda bacak kemikleri yük alır, bu da kemik kaybını yavaşlatır.', 'Keeps cardiovascular fitness. The harness holds you to the belt, so your leg bones take load with every step, which slows bone loss.'),
  },
  cevisCycle: {
    id: 'cevisCycle',
    name: T('CEVIS bisiklet', 'CEVIS cycle'),
    device: 'CEVIS',
    kind: 'aerobic',
    minutes: 30,
    load: { bacaklar: 3, ayaklar: 2 },
    targets: ['bacaklar', 'gogus'],
    cues: [T('Ayakları pedallara kilitle', 'Clip your feet into the pedals'), T('Sabit tempo, 60-80 devir', 'Steady pace, 60-80 rpm')],
    about: T('Kalp ve akciğer kondisyonunu korur. Ellere ve sırta yük bindirmediği için sırt ya da el şikayeti olan günlerde de yapılabilir.', 'Keeps heart and lung fitness. It puts no load on the hands or back, so it suits days with a back or hand complaint.'),
  },
  coreBrace: {
    id: 'coreBrace',
    name: T('Gövde sabitleme', 'Core bracing'),
    device: 'none',
    kind: 'mobility',
    sets: 3,
    minutes: 6,
    load: { sirt: 1 },
    targets: ['sirt', 'gogus'],
    cues: [T('Karın kaslarını sık, nefesi tutma', 'Brace your abs, keep breathing'), T('30 saniye tut, 30 saniye dinlen', 'Hold 30 seconds, rest 30 seconds')],
    about: T('Omurgayı destekleyen derin karın ve sırt kaslarını güçlendirir. Uzayda sık görülen bel ağrısına iyi gelir, diğer hareketlerde gövdeyi sabit tutar.', 'Strengthens the deep abdominal and back muscles that support the spine. Helps with lower back pain, common in space, and keeps your trunk steady in other moves.'),
  },
  spineStretch: {
    id: 'spineStretch',
    name: T('Omurga esnetme', 'Spine stretch'),
    device: 'none',
    kind: 'mobility',
    minutes: 6,
    load: { sirt: 1 },
    targets: ['sirt'],
    cues: [T('Dizlerini göğsüne çek, 20 saniye tut', 'Pull your knees to your chest, hold 20 seconds'), T('Yavaş ve derin nefes al', 'Breathe slowly and deeply')],
    about: T('Ağırlıksız ortamda omurlar arası açılır ve omurga uzar; bu bel ağrısı yapabilir. Dizleri göğse çekmek sırt kaslarını gevşetir, omurgayı rahatlatır.', 'In weightlessness the spaces between vertebrae open and the spine lengthens, which can cause back pain. Pulling the knees to the chest relaxes the back muscles and eases the spine.'),
  },
  flySquat: {
    id: 'flySquat',
    name: T('Uçan tekerlek squat', 'Flywheel squat'),
    device: 'Flywheel',
    kind: 'resistance',
    sets: 3,
    reps: 10,
    minutes: 7,
    load: { bacaklar: 3, sirt: 2, ayaklar: 1, eller: 1 },
    targets: ['bacaklar', 'sirt'],
    cues: [T('Kabloyu iki elinle göğüs hizasında tut', 'Hold the cable at chest level with both hands'), T('Kalçanı diz hizasına kadar indir, sırtın düz', 'Lower your hips to knee level, back straight')],
    about: T('Uçan tekerlek, çektiğin kadar yük verir (yo-yo gibi). Küçük araçta tek cihazla bacak kaslarını ve kemiklerini korur.', 'The flywheel gives as much load as you put in (like a yo-yo). In a small vehicle it keeps leg muscles and bones with a single device.'),
  },
  flyDeadlift: {
    id: 'flyDeadlift',
    name: T('Uçan tekerlek deadlift', 'Flywheel deadlift'),
    device: 'Flywheel',
    kind: 'resistance',
    sets: 3,
    reps: 8,
    minutes: 7,
    load: { eller: 3, onKol: 2, sirt: 3, bacaklar: 2 },
    targets: ['sirt', 'bacaklar', 'onKol'],
    cues: [T('Kalçadan menteşe gibi eğil', 'Hinge at the hips'), T('Kabloyu bacaklarına yakın çek', 'Pull the cable close to your legs')],
    about: T('Sırt, kalça ve arka bacak kaslarını birlikte çalıştırır; kavrama gücünü korur. Dünya\'ya dönüşte yerden yük kaldırmaya hazırlar.', 'Works the back, hips and hamstrings together and keeps grip strength. Prepares you to lift loads from the floor back on Earth.'),
  },
  flyBentRow: {
    id: 'flyBentRow',
    name: T('Uçan tekerlek eğilerek kürek', 'Flywheel bent row'),
    device: 'Flywheel',
    kind: 'resistance',
    sets: 3,
    reps: 10,
    minutes: 5,
    load: { eller: 2, onKol: 2, ustKol: 2, sirt: 2 },
    targets: ['sirt', 'ustKol'],
    cues: [T('Öne eğil, sırtın düz', 'Lean forward, back straight'), T('Kabloyu göbeğine doğru çek', 'Pull the cable toward your navel')],
    about: T('Sırtın üst kısmını ve kürek kemiklerini çevreleyen kasları güçlendirir. İtme hareketlerini dengeler, duruşu düzgün tutar.', 'Strengthens the upper back and the muscles around the shoulder blades. Balances pushing moves and keeps your posture upright.'),
  },
  flyHeelRaise: {
    id: 'flyHeelRaise',
    name: T('Uçan tekerlek topuk kaldırma', 'Flywheel heel raise'),
    device: 'Flywheel',
    kind: 'resistance',
    sets: 3,
    reps: 12,
    minutes: 4,
    load: { ayaklar: 3, bacaklar: 2, eller: 1 },
    targets: ['bacaklar', 'ayaklar'],
    cues: [T('Parmak uçlarına yüksel, 1 saniye bekle', 'Rise onto your toes, hold for 1 second'), T('Yavaşça in', 'Lower slowly')],
    about: T('Baldır kaslarını ve ayak kemiklerini çalıştırır. Uzayda en hızlı zayıflayan kaslardandır; dönüşte ayakta durmayı ve yürümeyi kolaylaştırır.', 'Works the calf muscles and foot bones. They are among the fastest to weaken in space; keeping them strong makes standing and walking easier after landing.'),
  },
  flyRowing: {
    id: 'flyRowing',
    name: T('Uçan tekerlek kürek çekme (aerobik)', 'Flywheel rowing (aerobic)'),
    device: 'Flywheel',
    kind: 'aerobic',
    minutes: 7,
    load: { eller: 2, onKol: 1, sirt: 2, bacaklar: 2 },
    targets: ['sirt', 'bacaklar', 'gogus'],
    cues: [T('Bacaklarla it, sonra kollarla çek', 'Push with your legs, then pull with your arms'), T('Sabit ve akıcı bir tempo', 'A steady, smooth pace')],
    about: T('Bacak, sırt ve kolları birlikte çalıştıran bir kürek hareketi. Küçük araçta tek cihazla kalp ve akciğer kondisyonunu korur.', 'A rowing move that works the legs, back and arms together. In a small vehicle it keeps heart and lung fitness with a single device.'),
  },
}

export interface ProgramItem {
  exercise: ExerciseId
  sets?: number
  reps?: number
  minutes: number
  intensity: 'normal' | 'light'
  done: boolean
  doneAt?: number
  /** Uyarlama notu (ör. "Sağ elin için hafifletildi") */
  note?: Tx
  /** Bu hareket bir başkasının yerine geldiyse, değiştirilen hareket */
  replaces?: ExerciseId
}

export interface ProgramDoc extends Doc {
  day: number
  items: ProgramItem[]
  /** Programı etkileyen şikayetler */
  adaptedFor: string[]
  notes: Tx[]
  /** Bugün şikayet sorgusuna verilen cevap */
  checkin?: { complaintId: string; answer: CheckinAnswer; ts: number }
  skipped?: boolean
  /** Programın üretildiği ortam (istasyon, Orion, Ay üssü, Mars üssü) */
  environment?: Environment
}

export type CheckinAnswer = 'same' | 'better' | 'gone'

const REGION_NAMES: Record<RegionId, Tx> = {
  bas: T('baş', 'head'),
  gogus: T('göğüs', 'chest'),
  sirt: T('sırt', 'back'),
  ustKol: T('üst kol', 'upper arm'),
  onKol: T('ön kol', 'forearm'),
  eller: T('el', 'hand'),
  bacaklar: T('bacak', 'leg'),
  ayaklar: T('ayak', 'foot'),
}

/** "sağ elin", "sol bacağın", "sırtın" gibi bölge adı */
export function bodyPart(region: RegionId, side: ComplaintDoc['side']): Tx {
  const n = REGION_NAMES[region]
  const paired = region === 'eller' || region === 'ayaklar' || region === 'bacaklar' || region === 'ustKol' || region === 'onKol'
  if (!paired || side === 'both') return n
  return { tr: `${side === 'right' ? 'sağ' : 'sol'} ${n.tr}`, en: `${side === 'right' ? 'right' : 'left'} ${n.en}` }
}

/** Ortama göre günlük plan, günlük hedef süre ve dayanılan kaynaklar */
export interface EnvPlan {
  plan: (day: number) => ExerciseId[]
  /** Günlük hedef (dakika) */
  targetMin: number
  sources: SourceId[]
  /** Ortamın egzersize etkisi (programın altında görünür) */
  note: Tx
  /** Planın NASA tarafından yayımlanmış bir programa değil, Vitalis varsayımına dayandığı */
  assumption?: boolean
}

/**
 * Spor programı her zaman uzay istasyonu programıdır (NASA'nın yayımladığı ARED, T2, CEVIS düzeni). Görev ortamı
 * (iletişim gecikmesi) değişse de program değişmez; diğer ortam planları başvuru için durur.
 */
export const PROGRAM_ENVIRONMENT: Environment = 'iss'

export const ENV_PLANS: Record<Environment, EnvPlan> = {
  // Uzay istasyonu: günde ~2 saat (nasaExercise). Tek ve çift günlerde üst vücut hareketi değişir.
  iss: {
    plan: (day) => ['warmup', 'aredSquat', 'aredDeadlift', 'aredHeelRaise', day % 2 === 0 ? 'aredBench' : 'aredRow', 't2Run', 'cevisCycle', 'coreBrace', 'spineStretch'],
    targetMin: 120,
    sources: ['nasaExercise'],
    note: T('İstasyonda ARED, T2 ve CEVIS ile günde yaklaşık iki saat egzersiz yapılır.', 'On the station, about two hours of exercise a day with ARED, T2 and CEVIS.'),
  },
  // Orion: yalnızca uçan tekerlek, günde 30 dakika (orionLife, orionFlywheel)
  orion: {
    plan: () => ['flySquat', 'flyDeadlift', 'flyBentRow', 'flyHeelRaise', 'flyRowing'],
    targetMin: 30,
    sources: ['orionLife', 'orionFlywheel'],
    note: T(
      'Orion\'da istasyonun büyük cihazları yok; tek bir uçan tekerlekle günde 30 dakika direnç ve aerobik egzersiz yapılır.',
      'Orion has none of the station\'s large machines; a single flywheel gives 30 minutes of resistance and aerobic exercise a day.',
    ),
  },
  // Ay üssü: yerçekimi 1/6 (moonFacts); kısmi yerçekimi yetmez (partialGravity); uzun yüzey yürüyüşlerine hazırlık (orionFlywheel)
  moon: {
    plan: () => ['warmup', 'flySquat', 'flyDeadlift', 'flyBentRow', 'flyHeelRaise', 'flyRowing', 'spineStretch'],
    targetMin: 42,
    sources: ['moonFacts', 'partialGravity', 'orionFlywheel'],
    note: T(
      'Ay\'da yerçekimi Dünya\'nın altıda biri; bu kas ve kemiği korumaya yetmez, egzersiz sürer. Uzun Ay yüzeyi yürüyüşleri için güç gerekir. Üs için NASA programı yayımlanmadı: cihaz ve süre Health Atlas varsayımı.',
      'Gravity on the Moon is one-sixth of Earth\'s; this is not enough to keep muscle and bone, so exercise continues. Long lunar spacewalks need strength. NASA has not published a base program: device and duration are a Health Atlas assumption.',
    ),
    assumption: true,
  },
  // Mars üssü: yerçekimi %38 (humansToMars); kısmi yerçekimi yetmez (partialGravity)
  mars: {
    plan: () => ['warmup', 'flySquat', 'flyDeadlift', 'flyBentRow', 'flyHeelRaise', 'flyRowing', 'spineStretch'],
    targetMin: 42,
    sources: ['humansToMars', 'partialGravity', 'orionFlywheel'],
    note: T(
      'Mars\'ta yerçekimi Dünya\'nın %38\'i; 0,4 g\'nin altı kas, kemik ve kondisyonu korumaya yetmez, egzersiz sürer. Üs için NASA programı yayımlanmadı: cihaz ve süre Health Atlas varsayımı.',
      'Mars gravity is 38% of Earth\'s; below 0.4 g is not enough to keep muscle, bone and fitness, so exercise continues. NASA has not published a base program: device and duration are a Health Atlas assumption.',
    ),
    assumption: true,
  },
}


/** Bir hareketin yerine geçebilecek, şikayet bölgesini yormayan alternatifler (sırayla denenir) */
const ALTERNATIVES: Record<ExerciseId, ExerciseId[]> = {
  warmup: ['spineStretch'],
  aredSquat: ['aredHeelRaise', 'cevisCycle'],
  aredDeadlift: ['coreBrace', 'aredSquat'],
  aredHeelRaise: ['cevisCycle'],
  aredBench: ['coreBrace'],
  aredRow: ['coreBrace'],
  t2Run: ['cevisCycle'],
  cevisCycle: ['coreBrace'],
  coreBrace: ['spineStretch'],
  spineStretch: ['coreBrace'],
  flySquat: ['flyHeelRaise', 'coreBrace'],
  flyDeadlift: ['coreBrace', 'flySquat'],
  flyBentRow: ['coreBrace'],
  flyHeelRaise: ['coreBrace'],
  flyRowing: ['coreBrace'],
}

const activeComplaints = (list: ComplaintDoc[]) => list.filter((c) => c.status !== 'resolved')

/** Bir hareketin şikayetlere göre durumu: uygun, hafifletilmeli ya da çıkarılmalı */
function fitFor(ex: Exercise, complaints: ComplaintDoc[]): { verdict: 'ok' | 'light' | 'avoid'; complaint?: ComplaintDoc } {
  let worst: { verdict: 'ok' | 'light' | 'avoid'; complaint?: ComplaintDoc } = { verdict: 'ok' }
  for (const c of activeComplaints(complaints)) {
    const load = ex.load[c.region] ?? 0
    if (!load) continue
    // Şiddet 5 ve üstünde orta/yoğun yük çıkarılır; daha hafif şikayette hareket hafifletilir
    const sev = c.status === 'improving' ? c.severity - 2 : c.severity
    const verdict = sev >= 5 && load >= 2 ? 'avoid' : sev >= 3 && load >= 2 ? 'light' : sev >= 6 && load >= 1 ? 'light' : 'ok'
    const rank = { ok: 0, light: 1, avoid: 2 }
    if (rank[verdict] > rank[worst.verdict]) worst = { verdict, complaint: c }
  }
  return worst
}

/**
 * Günün programını üretir. Şikayetlere göre:
 * - "avoid": hareket çıkarılır, alternatifi gelir (alternatif de uygun değilse hareket tamamen kalkar)
 * - "light": set sayısı bir azalır, hafif yükle yapılır
 */
export function generateProgram(astronaut: CrewId, day: number, complaints: ComplaintDoc[], ts: number, environment: Environment = 'iss'): ProgramDoc {
  const items: ProgramItem[] = []
  const notes: Tx[] = []
  const used = new Set<ExerciseId>()
  const adaptedFor = new Set<string>()

  for (const id of ENV_PLANS[environment].plan(day)) {
    const ex = EXERCISES[id]
    const fit = fitFor(ex, complaints)
    if (fit.verdict === 'ok') {
      if (used.has(id)) continue
      used.add(id)
      items.push({ exercise: id, sets: ex.sets, reps: ex.reps, minutes: ex.minutes, intensity: 'normal', done: false })
      continue
    }
    const c = fit.complaint!
    adaptedFor.add(c.id)
    const part = bodyPart(c.region, c.side)
    if (fit.verdict === 'light') {
      if (used.has(id)) continue
      used.add(id)
      items.push({
        exercise: id,
        sets: ex.sets ? Math.max(1, ex.sets - 1) : undefined,
        reps: ex.reps,
        minutes: Math.round(ex.minutes * 0.75),
        intensity: 'light',
        done: false,
        note: { tr: `${cap(part.tr)} için hafif yükle`, en: `Light load for your ${part.en}` },
      })
      continue
    }
    // Çıkarılan hareketin yerine uygun bir alternatif aranır
    const alt = ALTERNATIVES[id].find((a) => !used.has(a) && fitFor(EXERCISES[a], complaints).verdict === 'ok')
    if (alt) {
      used.add(alt)
      const ax = EXERCISES[alt]
      items.push({
        exercise: alt,
        sets: ax.sets,
        reps: ax.reps,
        minutes: ax.minutes,
        intensity: 'normal',
        done: false,
        replaces: id,
        note: { tr: `${ex.name.tr} yerine (${part.tr} dinlensin)`, en: `Instead of ${ex.name.en} (rest your ${part.en})` },
      })
    }
    notes.push({ tr: `${ex.name.tr} bugün çıkarıldı: ${part.tr} bölgesini yoruyor.`, en: `${ex.name.en} removed today: it strains your ${part.en}.` })
  }

  // Sırt şikayetinde omurgayı destekleyen hareket eklenir (uzayda sırt ağrısı %52, tb033)
  if (activeComplaints(complaints).some((c) => c.region === 'sirt') && !used.has('coreBrace')) {
    items.splice(Math.max(1, items.length - 1), 0, { exercise: 'coreBrace', sets: 3, minutes: 6, intensity: 'light', done: false, note: T('Sırt ağrısı için eklendi', 'Added for back pain') })
  }

  return { id: programId(astronaut, day), astronaut, ts, day, items, adaptedFor: [...adaptedFor], notes, environment }
}

export const programId = (astronaut: CrewId, day: number) => `${astronaut}:${day}`
const cap = (s: string) => s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1)

export const programMinutes = (p: ProgramDoc) => p.items.reduce((n, i) => n + i.minutes, 0)
export const doneMinutes = (p: ProgramDoc) => p.items.reduce((n, i) => n + (i.done ? i.minutes : 0), 0)

/**
 * Koçun bugün sorması gereken şikayet: dünden (ya da daha önceden) kalan, çözülmemiş ve bugün hakkında
 * henüz cevap verilmemiş en yeni şikayet.
 */
export function pendingCheckin(complaints: ComplaintDoc[], program: ProgramDoc | null, todayStart: number): ComplaintDoc | null {
  if (program?.checkin) return null
  const open = activeComplaints(complaints).filter((c) => lastTouch(c) < todayStart)
  return open.sort((a, b) => lastTouch(b) - lastTouch(a))[0] ?? null
}

const lastTouch = (c: ComplaintDoc) => Math.max(c.ts, ...c.updates.map((u) => u.ts))

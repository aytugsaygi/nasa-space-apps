import type { Doc } from './store'

/*
 * Zihin egzersizleri: uzun görevde zihni canlı tutmak için üç kısa egzersizin saf mantığı (React ve tarayıcı API'si yok;
 * aynı kod sunucuda ve tarayıcıda çalışır). Seçim, uçuşta yavaşladığı ölçülen becerilere ve eğitim kanıtına dayanır
 * (kaynaklar core/sources.ts → mindIss, actSpeed, visuospatial, spatialTraining, nbackMeta):
 * - speed (Hızlı bakış): işlem hızı. Ortadaki nesneyi tanı, çevredeki sinyalin yerini bul; gösterim süresi başarıya göre
 *   kısalır (yararlı görüş alanı tipi hız eğitimi).
 * - memory (Bellek akışı): görsel-uzamsal çalışma belleği. 3×3 ızgarada yanan pencere n adım önceki ile aynı mı;
 *   n blok sonuçlarına göre artar ya da azalır.
 * - spatial (Zihinde döndür): zihinsel döndürme. İki 3B blok figür aynı mı yoksa ayna görüntüsü mü; açı farkı başarıya
 *   göre büyür.
 * Zorluk kuralları ve puanlar Health Atlas kuralıdır (kaynaklarda sayı verilmez); tanı koymaz, klinik ölçü değildir.
 */

export type MindExercise = 'speed' | 'memory' | 'spatial'
export const MIND_EXERCISES: MindExercise[] = ['speed', 'memory', 'spatial']

/** Ana sonucun yönü: hızda daha kısa gösterim süresi, bellekte daha yüksek seviye, döndürmede daha çok doğru iyidir */
export const MIND_BETTER: Record<MindExercise, 'lower' | 'higher'> = { speed: 'lower', memory: 'higher', spatial: 'higher' }

export interface MindSessionDoc extends Doc {
  /** Oturumun başladığı an (Doc.ts) ve bittiği an */
  endedAt: number
  exercise: MindExercise
  /** Ana sonuç. speed: eşik gösterim süresi (ms); memory: ulaşılan en yüksek n; spatial: doğru sayısı */
  score: number
  /** Doğru oranı (0-1) */
  accuracy: number
  /** Cevaplanan deneme sayısı */
  trials: number
  /** spatial: doğru cevapların ortalama süresi (ms); memory: oturumun bittiği seviye */
  avgMs?: number
  endLevel?: number
}

export type MindSessionInput = Omit<MindSessionDoc, 'astronaut'>

const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** Biçim denetimi: geçersiz kayıt saklanmaz (sunucuya dışarıdan gelen veri de buradan geçer) */
export function checkMindSession(s: MindSessionInput): boolean {
  if (!s || typeof s !== 'object') return false
  if (typeof s.id !== 'string' || !/^ms_[A-Za-z0-9_-]{6,64}$/.test(s.id)) return false
  if (!MIND_EXERCISES.includes(s.exercise)) return false
  if (!finite(s.ts, 0, Number.MAX_SAFE_INTEGER) || !finite(s.endedAt, s.ts, s.ts + 3_600_000)) return false
  if (!finite(s.accuracy, 0, 1) || !Number.isInteger(s.trials) || !finite(s.trials, 1, 500)) return false
  const scoreRange: Record<MindExercise, [number, number]> = { speed: [SPEED.minMs, SPEED.maxMs], memory: [1, MEMORY.maxN], spatial: [0, SPATIAL.trials] }
  const [lo, hi] = scoreRange[s.exercise]
  if (!finite(s.score, lo, hi)) return false
  if (s.avgMs !== undefined && !finite(s.avgMs, 0, 120_000)) return false
  if (s.endLevel !== undefined && !finite(s.endLevel, 1, MEMORY.maxN)) return false
  return true
}

/** Bir egzersizin en iyi sonucu (yoksa null) */
export function bestScore(sessions: MindSessionDoc[], exercise: MindExercise): number | null {
  const list = sessions.filter((s) => s.exercise === exercise).map((s) => s.score)
  if (!list.length) return null
  return MIND_BETTER[exercise] === 'lower' ? Math.min(...list) : Math.max(...list)
}

/* ---------------- Hızlı bakış (işlem hızı) ---------------- */

export const SPEED = {
  trials: 20,
  startMs: 500,
  /** Ekran yenilemesinin iki karesi (60 Hz): bundan kısa gösterim güvenilir çizilemez */
  minMs: 34,
  maxMs: 800,
  /** İki doğru üst üste gelince süre kısalır, bir yanlışta uzar */
  down: 0.8,
  up: 1.3,
  /** Çevredeki yuva sayısı (saat yönünde, en üstten başlar) */
  slots: 8,
  /** Eşik: son bu kadar denemenin gösterim süresinin geometrik ortalaması */
  thresholdOf: 6,
} as const

export interface Staircase {
  ms: number
  streak: number
}

/** Zorluk merdiveni (2 doğru → kısalır, 1 yanlış → uzar); doğruların yaklaşık üçte ikisi civarında dengelenir */
export function nextStaircase(s: Staircase, correct: boolean): Staircase {
  if (!correct) return { ms: Math.min(SPEED.maxMs, Math.round(s.ms * SPEED.up)), streak: 0 }
  if (s.streak + 1 >= 2) return { ms: Math.max(SPEED.minMs, Math.round(s.ms * SPEED.down)), streak: 0 }
  return { ms: s.ms, streak: s.streak + 1 }
}

/** Eşik gösterim süresi: son denemelerin geometrik ortalaması (tek bir şanslı deneme sonucu bozmaz) */
export function speedThreshold(durations: number[]): number {
  const tail = durations.slice(-SPEED.thresholdOf)
  if (!tail.length) return SPEED.startMs
  return Math.round(Math.exp(tail.reduce((a, d) => a + Math.log(d), 0) / tail.length))
}

/* ---------------- Bellek akışı (görsel-uzamsal n-geri) ---------------- */

export const MEMORY = {
  blocks: 3,
  /** Bir bloktaki öğe sayısı: 20 + n (ilk n öğe karşılaştırılamaz) */
  baseItems: 20,
  targets: 6,
  /** Öğenin ekranda kaldığı ve bir sonrakine geçilen süre */
  showMs: 900,
  stepMs: 2500,
  cells: 9,
  maxN: 6,
} as const

/** n-geri dizisi: tam olarak `targets` kadar eşleşme, bunun dışında rastlantısal eşleşme yok */
export function makeNBack(n: number, rng: () => number = Math.random, targets: number = MEMORY.targets): number[] {
  // Hedef öğe n önceki öğenin kopyasıdır ve bir önceki öğeyle tesadüfen aynı olabilir: koşul sağlanana kadar yeniden kur
  for (;;) {
    const seq = buildNBack(n, rng, targets)
    if (n === 1 || !seq.some((c, i) => i > 0 && c === seq[i - 1])) return seq
  }
}

function buildNBack(n: number, rng: () => number, targets: number): number[] {
  const length = MEMORY.baseItems + n
  const slots = Array.from({ length: length - n }, (_, i) => i + n)
  const chosen = new Set<number>()
  while (chosen.size < Math.min(targets, slots.length)) chosen.add(slots[Math.floor(rng() * slots.length)])
  const seq: number[] = []
  for (let i = 0; i < length; i++) {
    if (chosen.has(i)) seq.push(seq[i - n])
    else {
      let c = Math.floor(rng() * MEMORY.cells)
      // Hedef olmayan öğe n önceki ile aynı olamaz; bir önceki ile de aynı olmasın (art arda aynı yer ayırt edilmez)
      while ((i >= n && c === seq[i - n]) || (i > 0 && c === seq[i - 1])) c = (c + 1) % MEMORY.cells
      seq.push(c)
    }
  }
  return seq
}

export interface BlockScore {
  hits: number
  misses: number
  falseAlarms: number
  correctRejections: number
  /** (isabet + doğru ret) / karşılaştırılabilen öğe */
  accuracy: number
  errors: number
}

/** Blok puanı: basılan öğeler (dizideki sıra numarası) ile hedefler karşılaştırılır */
export function scoreNBack(seq: number[], n: number, pressed: Iterable<number>): BlockScore {
  const p = new Set(pressed)
  let hits = 0
  let misses = 0
  let falseAlarms = 0
  let correctRejections = 0
  for (let i = n; i < seq.length; i++) {
    const target = seq[i] === seq[i - n]
    if (target && p.has(i)) hits++
    else if (target) misses++
    else if (p.has(i)) falseAlarms++
    else correctRejections++
  }
  const scored = Math.max(1, seq.length - n)
  return { hits, misses, falseAlarms, correctRejections, accuracy: (hits + correctRejections) / scored, errors: misses + falseAlarms }
}

/** Seviye kuralı: 3'ten az hata → n artar, 5'ten çok hata → n azalır (en az 1), arada aynı kalır */
export function nextLevel(n: number, errors: number): number {
  if (errors < 3) return Math.min(MEMORY.maxN, n + 1)
  if (errors > 5) return Math.max(1, n - 1)
  return n
}

/* ---------------- Zihinde döndür (3B zihinsel döndürme) ---------------- */

export const SPATIAL = {
  trials: 12,
  /** Seviyeye göre iki figür arasındaki açı aralığı (derece) */
  angles: [
    [20, 60],
    [60, 110],
    [110, 170],
  ] as const,
} as const

export type Vec3 = [number, number, number]
export type Mat3 = [number, number, number, number, number, number, number, number, number]

const DIRS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]
const key = (v: Vec3) => v.join(',')
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Küpleri sıfıra kaydırıp sıralar: aynı biçim aynı anahtarı verir */
function normalize(cubes: Vec3[]): string {
  const min = [0, 1, 2].map((k) => Math.min(...cubes.map((c) => c[k])))
  return cubes
    .map((c) => key([Math.round(c[0] - min[0]), Math.round(c[1] - min[1]), Math.round(c[2] - min[2])]))
    .sort()
    .join(';')
}

/** 90°'lik 24 dönüş (küpün dönme grubu): determinantı +1 olan işaretli permütasyon matrisleri */
const ROT24: Mat3[] = (() => {
  const out: Mat3[] = []
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]
  for (const p of perms) {
    for (let s = 0; s < 8; s++) {
      const sign = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1]
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3
      for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = sign[r]
      if (Math.round(det(m)) === 1) out.push(m)
    }
  }
  return out
})()

function det(m: Mat3) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return out
}

/** Eksen-açı dönüşü (Rodrigues); eksen birim vektördür */
export function axisAngle(axis: Vec3, deg: number): Mat3 {
  const t = (deg * Math.PI) / 180
  const [x, y, z] = axis
  const c = Math.cos(t)
  const s = Math.sin(t)
  const k = 1 - c
  return [c + x * x * k, x * y * k - z * s, x * z * k + y * s, y * x * k + z * s, c + y * y * k, y * z * k - x * s, z * x * k - y * s, z * y * k + x * s, c + z * z * k]
}

/** Bir biçimin 90°'lik dönüşlerden biriyle diğerine çakışıp çakışmadığı */
export function sameShape(a: Vec3[], b: Vec3[]): boolean {
  const target = normalize(b)
  return ROT24.some((m) => normalize(a.map((c) => apply(m, c))) === target)
}

/** Ayna görüntüsü (x ekseninde yansıma) */
export const mirror = (cubes: Vec3[]): Vec3[] => cubes.map(([x, y, z]) => [-x, y, z])

/**
 * Shepard-Metzler tipi figür: dört koldan oluşan, kendini kesmeyen bir küp zinciri. Kollar birbirine dik döner ve figür
 * tek bir düzlemde kalmaz; ayna görüntüsü hiçbir dönüşle kendisine çakışmaz (yoksa "aynı mı, ayna mı" sorusu anlamsız olur).
 */
export function makeFigure(rng: () => number = Math.random): Vec3[] {
  for (;;) {
    const cubes: Vec3[] = [[0, 0, 0]]
    const used = new Set([key([0, 0, 0])])
    let dir: Vec3 | null = null
    let ok = true
    for (let arm = 0; arm < 4 && ok; arm++) {
      const options = DIRS.filter((d) => !dir || dot(d, dir) === 0)
      dir = options[Math.floor(rng() * options.length)]
      const length = arm === 0 || arm === 3 ? 3 : 2 + Math.floor(rng() * 2)
      for (let i = 0; i < length; i++) {
        const last = cubes[cubes.length - 1]
        const next: Vec3 = [last[0] + dir[0], last[1] + dir[1], last[2] + dir[2]]
        if (used.has(key(next))) {
          ok = false
          break
        }
        used.add(key(next))
        cubes.push(next)
      }
    }
    if (!ok) continue
    // Üç eksenin hepsinde yayılmalı (düzlemsel figürün aynası döndürülerek elde edilebilir)
    const spans = [0, 1, 2].map((k) => new Set(cubes.map((c) => c[k])).size)
    if (spans.some((s) => s < 2)) continue
    if (sameShape(cubes, mirror(cubes))) continue
    // Ağırlık merkezine göre ortala: döndürünce figür yerinde döner
    const center = [0, 1, 2].map((k) => cubes.reduce((a, c) => a + c[k], 0) / cubes.length)
    return cubes.map((c) => [c[0] - center[0], c[1] - center[1], c[2] - center[2]] as Vec3)
  }
}

/** Rastgele birim eksen */
export function randomAxis(rng: () => number = Math.random): Vec3 {
  const z = rng() * 2 - 1
  const a = rng() * Math.PI * 2
  const r = Math.sqrt(1 - z * z)
  return [r * Math.cos(a), r * Math.sin(a), z]
}

/** Seviyeye göre açı (derece): aralığın içinde rastgele */
export function trialAngle(level: number, rng: () => number = Math.random): number {
  const [lo, hi] = SPATIAL.angles[Math.max(0, Math.min(SPATIAL.angles.length - 1, level))]
  return lo + rng() * (hi - lo)
}

/** Seviye: iki doğru üst üste → bir üst, yanlış → bir alt (0-2) */
export function nextSpatialLevel(level: number, streak: number, correct: boolean): { level: number; streak: number } {
  if (!correct) return { level: Math.max(0, level - 1), streak: 0 }
  if (streak + 1 >= 2) return { level: Math.min(SPATIAL.angles.length - 1, level + 1), streak: 0 }
  return { level, streak: streak + 1 }
}

export interface Face {
  /** Ekrandaki köşeler (x sağa, y aşağı; birim küp = 1) */
  points: [number, number][]
  /** Işığa göre parlaklık (0-1) */
  light: number
  /** Derinlik (büyük olan izleyiciye yakın) */
  depth: number
}

/**
 * Figürün ekranda görünen yüzleri (dik izdüşüm). İki küp arasındaki iç yüzler çizilmez, arkaya bakan yüzler atılır,
 * kalanlar uzaktan yakına sıralanır (ressam yöntemi). Kamera +z'den bakar.
 */
export function projectFaces(cubes: Vec3[], rotation: Mat3): Face[] {
  // Ortalanmış figürde koordinatlar kesirlidir: komşu aranırken binde bire yuvarlanır
  const k3 = (c: Vec3) => c.map((v) => (Math.round(v * 1000) / 1000).toFixed(3)).join(',')
  const grid = new Set(cubes.map(k3))
  const has = (c: Vec3) => grid.has(k3(c))
  const light: Vec3 = [-0.35, 0.55, 0.76]
  const faces: Face[] = []
  for (const c of cubes) {
    for (const d of DIRS) {
      if (has([c[0] + d[0], c[1] + d[1], c[2] + d[2]])) continue
      const normal = apply(rotation, d)
      if (normal[2] <= 1e-6) continue
      // Yüzün dört köşesi: normale dik iki eksen boyunca ±0,5
      const axes = DIRS.filter((e) => dot(e, d) === 0 && e[0] + e[1] + e[2] > 0)
      const [u, v] = axes
      const corners: Vec3[] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [c[0] + d[0] * 0.5 + (u[0] * a + v[0] * b) * 0.5, c[1] + d[1] * 0.5 + (u[1] * a + v[1] * b) * 0.5, c[2] + d[2] * 0.5 + (u[2] * a + v[2] * b) * 0.5])
      const r = corners.map((p) => apply(rotation, p))
      faces.push({
        points: r.map((p) => [p[0], -p[1]]),
        light: Math.max(0, dot(normal, light)),
        depth: r.reduce((a, p) => a + p[2], 0) / 4,
      })
    }
  }
  return faces.sort((a, b) => a.depth - b.depth)
}

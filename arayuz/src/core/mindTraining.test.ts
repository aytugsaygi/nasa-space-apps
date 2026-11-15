import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import {
  axisAngle,
  bestScore,
  checkMindSession,
  makeFigure,
  makeNBack,
  MEMORY,
  mirror,
  multiply,
  nextLevel,
  nextSpatialLevel,
  nextStaircase,
  projectFaces,
  sameShape,
  scoreNBack,
  SPEED,
  speedThreshold,
  type Mat3,
  type MindSessionDoc,
  type MindSessionInput,
  type Vec3,
} from './mindTraining'
import { RPC } from './rpc'
import { MemoryStore } from './store'

const NOW = Date.UTC(2026, 10, 14, 10)

/** Tekrarlanabilir rastgele sayı (testler her çalışmada aynı diziyi görsün) */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const session = (patch: Partial<MindSessionInput> = {}): MindSessionInput => ({
  id: 'ms_abcdef123',
  ts: NOW - 120_000,
  endedAt: NOW,
  exercise: 'speed',
  score: 140,
  accuracy: 0.75,
  trials: 20,
  ...patch,
})

describe('hızlı bakış: zorluk merdiveni', () => {
  it('iki doğru üst üste gelince süre kısalır, tek yanlışta uzar; sınırların dışına çıkmaz', () => {
    let s = { ms: SPEED.startMs, streak: 0 }
    s = nextStaircase(s, true)
    expect(s).toEqual({ ms: SPEED.startMs, streak: 1 })
    s = nextStaircase(s, true)
    expect(s).toEqual({ ms: Math.round(SPEED.startMs * SPEED.down), streak: 0 })
    s = nextStaircase(s, false)
    expect(s.ms).toBe(Math.round(Math.round(SPEED.startMs * SPEED.down) * SPEED.up))
    expect(nextStaircase({ ms: SPEED.minMs, streak: 1 }, true).ms).toBe(SPEED.minMs)
    expect(nextStaircase({ ms: SPEED.maxMs, streak: 0 }, false).ms).toBe(SPEED.maxMs)
  })

  it('eşik son altı denemenin geometrik ortalamasıdır', () => {
    expect(speedThreshold([500, 500, 100, 100, 100, 100, 100, 100])).toBe(100)
    expect(speedThreshold([400, 100])).toBe(200)
    expect(speedThreshold([])).toBe(SPEED.startMs)
  })
})

describe('bellek akışı: n-geri', () => {
  it('dizide tam olarak belirlenen sayıda eşleşme var, rastlantısal eşleşme ve art arda aynı yer yok', () => {
    for (const n of [1, 2, 3, 4]) {
      for (let seed = 1; seed < 30; seed++) {
        const seq = makeNBack(n, seeded(seed))
        expect(seq).toHaveLength(MEMORY.baseItems + n)
        const targets = seq.filter((c, i) => i >= n && c === seq[i - n]).length
        expect(targets).toBe(MEMORY.targets)
        expect(seq.every((c) => c >= 0 && c < MEMORY.cells)).toBe(true)
        if (n > 1) expect(seq.some((c, i) => i > 0 && c === seq[i - 1])).toBe(false)
      }
    }
  })

  it('blok puanı isabet, kaçırma, yanlış basış ve doğru reddi ayırır', () => {
    const seq = [0, 1, 0, 2, 0, 3]
    // 2-geri hedefleri: 2. ve 4. öğeler
    const s = scoreNBack(seq, 2, [2, 3])
    expect(s).toMatchObject({ hits: 1, misses: 1, falseAlarms: 1, correctRejections: 1, errors: 2 })
    expect(s.accuracy).toBe(0.5)
    expect(scoreNBack(seq, 2, [2, 4]).accuracy).toBe(1)
  })

  it('seviye kuralı: 3 hatadan az artar, 5 hatadan çok azalır, 1 ile en yüksek seviye arasında kalır', () => {
    expect(nextLevel(2, 2)).toBe(3)
    expect(nextLevel(2, 4)).toBe(2)
    expect(nextLevel(2, 6)).toBe(1)
    expect(nextLevel(1, 9)).toBe(1)
    expect(nextLevel(MEMORY.maxN, 0)).toBe(MEMORY.maxN)
  })
})

describe('zihinde döndür: 3B figürler', () => {
  const rot90x: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0]
  const rot90y: Mat3 = [0, 0, 1, 0, 1, 0, -1, 0, 0]

  it('figür kendini kesmeyen, üç eksene yayılan bir küp zinciridir; aynası hiçbir dönüşle kendisine çakışmaz', () => {
    for (let seed = 1; seed < 40; seed++) {
      const f = makeFigure(seeded(seed))
      expect(f.length).toBeGreaterThanOrEqual(10)
      expect(new Set(f.map((c) => c.map((v) => v.toFixed(3)).join())).size).toBe(f.length)
      for (const k of [0, 1, 2]) expect(new Set(f.map((c) => c[k].toFixed(3))).size).toBeGreaterThan(1)
      expect(sameShape(f, mirror(f))).toBe(false)
    }
  })

  it('döndürülmüş figür aynı biçimdir; aynası değildir', () => {
    const f = makeFigure(seeded(7))
    const turned = f.map((c) => [c[1], -c[0], c[2]] as Vec3)
    expect(sameShape(f, turned)).toBe(true)
    expect(sameShape(f, mirror(turned))).toBe(false)
  })

  it('çizimde iki küp arasındaki iç yüzler ve arkaya bakan yüzler yoktur; yüzler uzaktan yakına sıralıdır', () => {
    const pair: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
    ]
    const front = projectFaces(pair, axisAngle([0, 0, 1], 0))
    // Önden bakınca yalnızca iki ön yüz görünür
    expect(front).toHaveLength(2)
    const angled = projectFaces(pair, multiply(rot90y, multiply(rot90x, axisAngle([1, 1, 0].map((v) => v / Math.SQRT2) as Vec3, 30))))
    expect(angled.length).toBeGreaterThan(2)
    expect(angled.length).toBeLessThanOrEqual(6)
    for (let i = 1; i < angled.length; i++) expect(angled[i].depth).toBeGreaterThanOrEqual(angled[i - 1].depth)
    for (const face of angled) expect(face.points).toHaveLength(4)
  })

  it('seviye: iki doğru üst üste bir üst, yanlış bir alt; 0-2 arasında kalır', () => {
    expect(nextSpatialLevel(0, 1, true)).toEqual({ level: 1, streak: 0 })
    expect(nextSpatialLevel(0, 0, true)).toEqual({ level: 0, streak: 1 })
    expect(nextSpatialLevel(2, 1, true)).toEqual({ level: 2, streak: 0 })
    expect(nextSpatialLevel(0, 1, false)).toEqual({ level: 0, streak: 0 })
  })
})

describe('oturum kaydı', () => {
  it('biçim denetimi: kimlik, egzersiz, süre, oran ve puan aralığı', () => {
    expect(checkMindSession(session())).toBe(true)
    expect(checkMindSession(session({ id: 'x' }))).toBe(false)
    expect(checkMindSession(session({ exercise: 'chess' as never }))).toBe(false)
    expect(checkMindSession(session({ endedAt: NOW - 200_000 }))).toBe(false)
    expect(checkMindSession(session({ accuracy: 1.2 }))).toBe(false)
    expect(checkMindSession(session({ score: 5 }))).toBe(false)
    expect(checkMindSession(session({ exercise: 'memory', score: 3, endLevel: 4 }))).toBe(true)
    expect(checkMindSession(session({ exercise: 'memory', score: 99 }))).toBe(false)
    expect(checkMindSession(session({ exercise: 'spatial', score: 9, avgMs: 2400 }))).toBe(true)
    expect(checkMindSession(session({ trials: 0 }))).toBe(false)
  })

  it('motor kaydeder, astronota göre ayırır, aynı kimliği iki kez yazmaz ve sıfırlamada siler', () => {
    const e = new Engine(new MemoryStore(), () => NOW)
    expect(e.saveMindSession('yildiz', session())).toEqual({ ok: true })
    expect(e.saveMindSession('yildiz', session())).toEqual({ ok: true })
    expect(e.saveMindSession('yildiz', session({ id: 'ms_second123', ts: NOW - 60_000, score: 120 }))).toEqual({ ok: true })
    expect(e.saveMindSession('mori', session())).toEqual({ ok: false, error: 'invalid' })
    expect(e.saveMindSession('yildiz', session({ id: 'ms_bad123456', accuracy: -1 }))).toEqual({ ok: false, error: 'invalid' })
    const list = e.mindSessions('yildiz')
    expect(list.map((s) => s.id)).toEqual(['ms_second123', 'ms_abcdef123'])
    expect(e.mindSessions('mori')).toEqual([])
    e.resetDemo()
    expect(e.mindSessions('yildiz')).toEqual([])
  })

  it('RPC girdisi denetlenir', () => {
    const e = new Engine(new MemoryStore(), () => NOW)
    expect(RPC.saveMindSession(e, 'yildiz', session())).toEqual({ ok: true })
    expect(() => RPC.saveMindSession(e, 'kimse' as never, session())).toThrow()
    expect(() => RPC.saveMindSession(e, 'yildiz', null as never)).toThrow()
    expect(RPC.mindSessions(e, 'yildiz')).toHaveLength(1)
  })

  it('en iyi sonuç: hızda en kısa süre, diğerlerinde en yüksek puan', () => {
    const docs = [
      { ...session({ score: 160 }), astronaut: 'yildiz' },
      { ...session({ id: 'ms_b12345678', score: 110 }), astronaut: 'yildiz' },
      { ...session({ id: 'ms_c12345678', exercise: 'memory', score: 3 }), astronaut: 'yildiz' },
      { ...session({ id: 'ms_d12345678', exercise: 'memory', score: 4 }), astronaut: 'yildiz' },
    ] as MindSessionDoc[]
    expect(bestScore(docs, 'speed')).toBe(110)
    expect(bestScore(docs, 'memory')).toBe(4)
    expect(bestScore(docs, 'spatial')).toBeNull()
  })
})

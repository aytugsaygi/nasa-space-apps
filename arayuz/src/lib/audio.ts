/**
 * Ses dosyası kullanmadan Web Audio API ile üretilen arayüz sesleri.
 * Tarayıcılar ilk kullanıcı tıklamasından önce ses çalmaya izin vermez;
 * bu yüzden `unlockAudio` açılıştaki başlatma butonunda çağrılır.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  return ctx
}

export function unlockAudio() {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

function tone(
  c: AudioContext,
  { freq, to, start, dur, type = 'sine', gain = 0.12 }: { freq: number; to?: number; start: number; dur: number; type?: OscillatorType; gain?: number },
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g).connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Açılıştaki beyaz parlamayla birlikte çalan "biu" sesi */
export function playBoot() {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  tone(c, { freq: 1600, to: 320, start: t, dur: 0.45, type: 'sine', gain: 0.16 })
  tone(c, { freq: 800, to: 160, start: t, dur: 0.5, type: 'triangle', gain: 0.06 })
  tone(c, { freq: 220, to: 440, start: t + 0.35, dur: 0.6, type: 'sine', gain: 0.05 })
}

/** Uyarı sesleri: önem arttıkça ton sayısı ve sertliği artar. Tek sefer çalar, tekrarlamaz. */
export function playAlert(level: 'bilgi' | 'dikkat' | 'kritik') {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  if (level === 'bilgi') {
    tone(c, { freq: 880, start: t, dur: 0.18, gain: 0.08 })
  } else if (level === 'dikkat') {
    tone(c, { freq: 660, start: t, dur: 0.16, type: 'triangle', gain: 0.12 })
    tone(c, { freq: 880, start: t + 0.2, dur: 0.22, type: 'triangle', gain: 0.12 })
  } else {
    for (let i = 0; i < 3; i++) {
      tone(c, { freq: 988, start: t + i * 0.22, dur: 0.15, type: 'square', gain: 0.06 })
      tone(c, { freq: 740, start: t + i * 0.22 + 0.08, dur: 0.1, type: 'square', gain: 0.05 })
    }
  }
}

export function playClick() {
  const c = getCtx()
  if (!c) return
  tone(c, { freq: 1200, to: 900, start: c.currentTime, dur: 0.06, gain: 0.04 })
}

/* ---------- Nefes egzersizi: ortam sesleri ve geçiş tıkı (dosya yok, hepsi sentez) ---------- */

export type Ambience = 'waves' | 'birds' | 'fire' | 'rain'
export const AMBIENCES: Ambience[] = ['waves', 'birds', 'fire', 'rain']

type NoiseColor = 'white' | 'pink' | 'brown'
const noiseCache = new Map<NoiseColor, AudioBuffer>()

/** Döngüde çalan gürültü tamponu: beyaz (düz), pembe (yumuşak), kahverengi (derin uğultu) */
function noiseBuffer(c: AudioContext, color: NoiseColor): AudioBuffer {
  const cached = noiseCache.get(color)
  if (cached && cached.sampleRate === c.sampleRate) return cached
  const len = c.sampleRate * 4
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const d = buffer.getChannelData(0)
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'white') d[i] = w
    else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
    } else {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
  }
  noiseCache.set(color, buffer)
  return buffer
}

function noiseSource(c: AudioContext, color: NoiseColor): AudioBufferSourceNode {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, color)
  src.loop = true
  return src
}

function filter(c: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = q
  return f
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Kısa bir gürültü patlaması (çıtırtı, damla): bant geçiren süzgeçten, hızla sönerek */
function burst(c: AudioContext, out: AudioNode, at: number, { dur, freq, gain, q = 1 }: { dur: number; freq: number; gain: number; q?: number }) {
  const src = noiseSource(c, 'white')
  const bp = filter(c, 'bandpass', freq, q)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(gain, at + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(bp).connect(g).connect(out)
  src.start(at, Math.random() * 3)
  src.stop(at + dur + 0.02)
}

/** Kuş cıvıltısı: hızlı frekans kaymalı kısa sinüs; bazen titreşimli (tril) */
function chirp(c: AudioContext, out: AudioNode, at: number) {
  const osc = c.createOscillator()
  const g = c.createGain()
  const dur = rand(0.06, 0.16)
  const f0 = rand(2600, 4600)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f0, at)
  osc.frequency.exponentialRampToValueAtTime(f0 * rand(0.65, 1.45), at + dur)
  if (Math.random() < 0.3) {
    const lfo = c.createOscillator()
    const depth = c.createGain()
    lfo.frequency.value = rand(22, 38)
    depth.gain.value = rand(120, 320)
    lfo.connect(depth).connect(osc.frequency)
    lfo.start(at)
    lfo.stop(at + dur + 0.02)
  }
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(rand(0.05, 0.12), at + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + dur + 0.03)
}

/**
 * Ortam sesi başlatır; durdurma işlevi döner (tarayıcı ses üretemiyorsa null). Hepsi Web Audio ile üretilir, dosya yoktur:
 * - Dalgalar: derin gürültü, birkaç saniyede bir kabarıp çekilen dalga zarfıyla; üstünde ince köpük
 * - Kuş sesleri: hafif rüzgâr ve rastgele aralıklarla cıvıltı öbekleri
 * - Ateş çıtırtısı: alçak bir uğultu ve rastgele kısa çıtırtılar
 * - Yağmur: yumuşak hışırtı ve tek tek damlalar
 * Ses yavaşça açılır ve kapanır; rastgele olaylar küçük bir zamanlayıcıyla biraz ileriye planlanır.
 */
export function startAmbience(kind: Ambience, volume = 0.5): (() => void) | null {
  const c = getCtx()
  if (!c) return null
  if (c.state === 'suspended') void c.resume()
  const master = c.createGain()
  master.gain.setValueAtTime(0.0001, c.currentTime)
  master.gain.exponentialRampToValueAtTime(volume * 0.16, c.currentTime + 1.2)
  master.connect(c.destination)
  const sources: AudioScheduledSourceNode[] = []
  const bed = (color: NoiseColor, chain: AudioNode[], gain: number) => {
    const src = noiseSource(c, color)
    const g = c.createGain()
    g.gain.value = gain
    let node: AudioNode = src
    for (const n of chain) node = node.connect(n)
    node.connect(g).connect(master)
    src.start(c.currentTime, Math.random() * 3)
    sources.push(src)
    return g
  }

  let next = c.currentTime + 0.1
  let tick: () => void
  if (kind === 'waves') {
    const body = bed('brown', [filter(c, 'lowpass', 520)], 0.0001)
    const foam = bed('pink', [filter(c, 'bandpass', 1800, 0.6)], 0.0001)
    tick = () => {
      const period = rand(6, 10)
      const peak = rand(0.7, 1.1)
      body.gain.setTargetAtTime(peak, next, period * 0.18)
      body.gain.setTargetAtTime(0.18, next + period * 0.45, period * 0.22)
      foam.gain.setTargetAtTime(peak * 0.25, next + period * 0.3, period * 0.08)
      foam.gain.setTargetAtTime(0.02, next + period * 0.5, period * 0.15)
      next += period
    }
  } else if (kind === 'rain') {
    bed('pink', [filter(c, 'highpass', 500), filter(c, 'lowpass', 6500)], 0.55)
    tick = () => {
      burst(c, master, next, { dur: rand(0.008, 0.02), freq: rand(2500, 6000), gain: rand(0.08, 0.35), q: 2 })
      next += rand(0.02, 0.12)
    }
  } else if (kind === 'fire') {
    const rumble = bed('brown', [filter(c, 'lowpass', 260)], 0.8)
    tick = () => {
      if (Math.random() < 0.08) rumble.gain.setTargetAtTime(rand(0.55, 1), next, 0.3)
      const pop = Math.random() < 0.12
      burst(c, master, next, pop ? { dur: rand(0.03, 0.06), freq: rand(500, 900), gain: rand(0.4, 0.8), q: 1.5 } : { dur: rand(0.004, 0.018), freq: rand(1800, 5000), gain: rand(0.1, 0.5), q: 1.2 })
      next += Math.random() < 0.2 ? rand(0.25, 0.7) : rand(0.03, 0.18)
    }
  } else {
    bed('pink', [filter(c, 'lowpass', 700)], 0.25)
    tick = () => {
      const n = Math.round(rand(2, 6))
      let at = next
      for (let i = 0; i < n; i++) {
        chirp(c, master, at)
        at += rand(0.09, 0.22)
      }
      next = at + rand(1.2, 4)
    }
  }

  // Olaylar en fazla yarım saniye ileriye planlanır; zamanlayıcı sık döner, ses kesintisiz kalır
  const timer = setInterval(() => {
    while (next < c.currentTime + 0.5) tick()
  }, 60)
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    try {
      master.gain.cancelScheduledValues(c.currentTime)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), c.currentTime)
      master.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5)
      for (const s of sources) s.stop(c.currentTime + 0.55)
      setTimeout(() => master.disconnect(), 700)
    } catch {
      /* zaten durmuş */
    }
  }
}

/**
 * Nefes geçişi tıkı: gözler kapalıyken evreyi duymak için. Nefes alırken ince ve hafif yükselen, verirken kalın ve hafif
 * alçalan kısa bir tahta tıkı.
 */
export function playBreathTick(phase: 'inhale' | 'exhale') {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  const t = c.currentTime
  const up = phase === 'inhale'
  tone(c, { freq: up ? 1320 : 660, to: up ? 1480 : 560, start: t, dur: 0.07, type: 'sine', gain: 0.09 })
  tone(c, { freq: up ? 2640 : 1320, start: t, dur: 0.03, type: 'triangle', gain: 0.025 })
}

/**
 * Nefes molasında isteğe bağlı beyaz gürültü (ses dosyası yok, Web Audio ile üretilir). Yalnızca kişi oturumu başlatınca
 * çağrılır; durdurma işlevi döner. Tarayıcı ses üretemiyorsa null döner (arayüz bunu söyler, oturum sessiz sürer).
 */
export function startWhiteNoise(volume = 0.04): (() => void) | null {
  const c = getCtx()
  if (!c) return null
  if (c.state === 'suspended') void c.resume()
  const seconds = 2
  const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 1200
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(volume, c.currentTime + 0.6)
  src.connect(filter).connect(g).connect(c.destination)
  src.start()
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    try {
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3)
      src.stop(c.currentTime + 0.35)
    } catch {
      /* zaten durmuş */
    }
  }
}

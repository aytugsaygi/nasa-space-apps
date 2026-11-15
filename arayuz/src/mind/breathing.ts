/*
 * Nefes egzersizi düzenleri ve zamanlama. Saf fonksiyonlar: çember animasyonu ve evre yazısı buradan hesaplanır.
 * - Kutu (4-4-4-4): dört eşit evre
 * - 4-7-8: uzun tutma ve uzun verme
 * - Dengeli (5-5): dakikada 6 nefes
 */

export type Phase = 'inhale' | 'holdIn' | 'exhale' | 'holdOut'
export type PatternId = 'box' | 'relax' | 'even'

export interface Pattern {
  id: PatternId
  steps: { phase: Phase; seconds: number }[]
}

/** Seçilebilen süreler (dakika); ürün ayarı */
export const BREATHING_MINUTES = [1, 2, 5] as const

export const PATTERNS: Record<PatternId, Pattern> = {
  box: {
    id: 'box',
    steps: [
      { phase: 'inhale', seconds: 4 },
      { phase: 'holdIn', seconds: 4 },
      { phase: 'exhale', seconds: 4 },
      { phase: 'holdOut', seconds: 4 },
    ],
  },
  relax: {
    id: 'relax',
    steps: [
      { phase: 'inhale', seconds: 4 },
      { phase: 'holdIn', seconds: 7 },
      { phase: 'exhale', seconds: 8 },
    ],
  },
  even: {
    id: 'even',
    steps: [
      { phase: 'inhale', seconds: 5 },
      { phase: 'exhale', seconds: 5 },
    ],
  },
}

export const cycleSeconds = (p: Pattern) => p.steps.reduce((n, s) => n + s.seconds, 0)

export interface PhaseState {
  phase: Phase
  /** Kaçıncı tur (1'den başlar) */
  cycle: number
  /** Evrenin bitmesine kalan saniye (yukarı yuvarlanmış) */
  remaining: number
  /** Evrenin içindeki ilerleme (0-1) */
  progress: number
  /** Çemberin açıklığı: nefes alırken 0'dan 1'e büyür, verirken küçülür */
  openness: number
}

const easeInOut = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)

/** Geçen süreye (saniye) göre evre */
export function phaseAt(p: Pattern, elapsed: number): PhaseState {
  const total = cycleSeconds(p)
  const t = Math.max(0, elapsed)
  const cycle = Math.floor(t / total) + 1
  let rest = t % total
  for (const step of p.steps) {
    if (rest < step.seconds) {
      const progress = rest / step.seconds
      const openness = step.phase === 'inhale' ? easeInOut(progress) : step.phase === 'exhale' ? 1 - easeInOut(progress) : step.phase === 'holdIn' ? 1 : 0
      return { phase: step.phase, cycle, remaining: Math.ceil(step.seconds - rest), progress, openness }
    }
    rest -= step.seconds
  }
  return { phase: p.steps[0].phase, cycle, remaining: p.steps[0].seconds, progress: 0, openness: 0 }
}

/* ---------- Nefes molası oturumu: yapılandırma sözleşmesi (docs/wellbeing BR-01…BR-07) ---------- */

/*
 * İçerik kararı: bu projede onaylanmış ya da kaynağı gösterilmiş bir nefes temposu yok (sources.ts'de nefes kaynağı yok;
 * yukarıdaki kutu ve 4-7-8 düzenleri kaynaksızdır ve nefes tutma içerir). Bu yüzden nefes molası, nefes tutmayan,
 * ayarlanabilir bir PROTOTİP tempo kullanır (eşit al-ver). Bu tıbbi bir öneri değildir, klinik olarak incelenmemiştir ve
 * NASA onayı taşımaz; arayüz bunu açıkça gösterir (reviewed: false). İçerik incelemesi tamamlanınca yalnızca burası değişir.
 */

export type VisualMode = 'animated' | 'still'
/** Arka plan sesi: sessiz ya da sentezlenen dört ortam sesinden biri (lib/audio) */
export type AudioMode = 'silent' | 'waves' | 'birds' | 'fire' | 'rain'

export interface BreathingPacing {
  id: string
  /** Yalnızca nefes al / ver evreleri: nefes tutma yoktur */
  inhaleSeconds: number
  exhaleSeconds: number
  /** İçerik incelemesinden geçti mi; geçmediyse arayüz "incelenmemiş prototip" der */
  reviewed: boolean
}

export interface BreathingSessionConfig {
  /** Seçilebilen süreler (dakika); proje varsayılanı BREATHING_MINUTES */
  durationsMin: readonly number[]
  defaultDurationMin: number
  pacing: BreathingPacing
  visualModes: readonly VisualMode[]
  audioModes: readonly AudioMode[]
  /** Ses varsayılan olarak kapalıdır */
  defaultAudio: AudioMode
}

export const BREATHING_SESSION_CONFIG: BreathingSessionConfig = {
  // Kişi her seferinde süreyi seçer (1, 3 ya da 5 dakika); varsayılan ortadaki
  durationsMin: [1, 3, 5],
  defaultDurationMin: 3,
  pacing: { id: 'prototypeEven', inhaleSeconds: 5, exhaleSeconds: 5, reviewed: false },
  visualModes: ['animated', 'still'],
  audioModes: ['silent', 'waves', 'birds', 'fire', 'rain'],
  defaultAudio: 'silent',
}

/** Oynatıcının aldığı ayarlar */
export interface BreathingSessionSettings {
  durationMin: number
  /** Sorulmaz: cihazın hareketi azaltma tercihinden gelir */
  visual: VisualMode
  audio: AudioMode
  /** Nefes al / ver geçişlerinde tık sesi (gözler kapalıyken takip için) */
  click: boolean
}

/** Açılıştaki ayarlar: işletim sisteminin hareketi azaltma tercihi görünümü "sabit" yapar; ses kapalıdır */
export function defaultSessionSettings(prefersReducedMotion: boolean, c: BreathingSessionConfig = BREATHING_SESSION_CONFIG): BreathingSessionSettings {
  return { durationMin: c.defaultDurationMin, visual: prefersReducedMotion ? 'still' : 'animated', audio: c.defaultAudio, click: false }
}

/** Ayarlar yapılandırmaya uyuyor mu */
export function isValidSessionSettings(s: unknown, c: BreathingSessionConfig = BREATHING_SESSION_CONFIG): s is BreathingSessionSettings {
  if (!s || typeof s !== 'object') return false
  const v = s as Record<string, unknown>
  return typeof v.durationMin === 'number' && c.durationsMin.includes(v.durationMin) && c.visualModes.includes(v.visual as VisualMode) && c.audioModes.includes(v.audio as AudioMode) && typeof v.click === 'boolean'
}

/** Yapılandırmanın kendisi geçerli mi (testler ve geliştirme için) */
export function validateSessionConfig(c: BreathingSessionConfig): string[] {
  const errors: string[] = []
  if (!c.durationsMin.length || c.durationsMin.some((m) => !(m > 0))) errors.push('durations')
  if (!c.durationsMin.includes(c.defaultDurationMin)) errors.push('defaultDuration')
  if (!(c.pacing.inhaleSeconds > 0) || !(c.pacing.exhaleSeconds > 0)) errors.push('pacing')
  if (!c.audioModes.includes(c.defaultAudio)) errors.push('defaultAudio')
  return errors
}

/** Tempo, mevcut zamanlama işlevleriyle (phaseAt) kullanılacak düzene çevrilir: yalnızca al ve ver */
export function pacingPattern(p: BreathingPacing): Pattern {
  return { id: 'even', steps: [{ phase: 'inhale', seconds: p.inhaleSeconds }, { phase: 'exhale', seconds: p.exhaleSeconds }] }
}

import type { Doc } from './store'

/*
 * Nefes molası oturum kayıtları (docs/wellbeing BR-05, BR-06): tamamlanan ya da erken bitirilen oturumun yalnızca üst
 * bilgisi ve isteğe bağlı geri bildirimi. Geri bildirimden puan, başarı oranı ya da klinik ölçü hesaplanmaz; kayıtlar
 * kullanım baskısı yaratmak için sayılmaz ya da gösterilmez (SUP-06). Kayıt bu uygulamanın veri deposundadır (sunucu
 * yoksa bu tarayıcı, varsa ekibin sunucusu) ve astronota göre ayrıdır.
 */

export type BreathingOutcome = 'completed' | 'endedEarly'
export type BreathingFeedback = 'moreComfortable' | 'aboutSame' | 'moreUncomfortable' | 'notSure'
export const BREATHING_FEEDBACK: BreathingFeedback[] = ['moreComfortable', 'aboutSame', 'moreUncomfortable', 'notSure']

export interface BreathingSessionDoc extends Doc {
  /** Oturumun başladığı an (Doc.ts) ve bittiği an */
  endedAt: number
  /** Planlanan ve gerçekten etkin geçen süre (ms); duraklatılan süre sayılmaz */
  plannedMs: number
  activeMs: number
  outcome: BreathingOutcome
  durationMin: number
  visual: 'animated' | 'still'
  /** Eski kayıtlarda 'whiteNoise' olabilir; yenilerde sessiz ya da dört ortam sesinden biri */
  audio: 'silent' | 'whiteNoise' | 'waves' | 'birds' | 'fire' | 'rain'
  /** Nefes geçişlerinde tık sesi açık mıydı (eski kayıtlarda yok) */
  click?: boolean
  pacingId: string
  /** İsteğe bağlı geri bildirim; atlanırsa ya da sorulmadıysa null */
  feedback: BreathingFeedback | null
}

export type BreathingSessionInput = Omit<BreathingSessionDoc, 'astronaut' | 'feedback'>

/** Biçim denetimi: geçersiz kayıt saklanmaz */
export function checkBreathingSession(s: BreathingSessionInput): boolean {
  if (!s || typeof s !== 'object') return false
  const nums = [s.ts, s.endedAt, s.plannedMs, s.activeMs, s.durationMin]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return false
  if (typeof s.id !== 'string' || !/^bs_[A-Za-z0-9_-]{6,64}$/.test(s.id)) return false
  if (s.endedAt < s.ts || s.activeMs > s.endedAt - s.ts + 1000 || s.activeMs > s.plannedMs + 1000) return false
  if (s.outcome !== 'completed' && s.outcome !== 'endedEarly') return false
  if (s.visual !== 'animated' && s.visual !== 'still') return false
  if (!['silent', 'whiteNoise', 'waves', 'birds', 'fire', 'rain'].includes(s.audio)) return false
  if (s.click !== undefined && typeof s.click !== 'boolean') return false
  return typeof s.pacingId === 'string' && s.pacingId.length <= 40
}

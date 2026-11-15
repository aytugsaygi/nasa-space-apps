import { phaseAt, type Pattern, type PhaseState } from './breathing'

/*
 * Nefes molası oturumunun tek zaman kaynağı. Kalan süre, evre yazısı ve çemberin ölçeği her karede aynı "etkin geçen süre"
 * değerinden hesaplanır; birbirinden bağımsız sayaçlar yoktur. Etkin süre, aralık tiklerinin sayısıyla değil saatten
 * hesaplanır: activeMs (duraklatmadan önce birikmiş) + (çalışıyorsa şimdi − runningSince). Duraklatılan süre hiç sayılmaz.
 */

export interface SessionClock {
  /** Son duraklatmaya kadar birikmiş etkin süre */
  activeMs: number
  /** Çalışıyorsa son başlatma/sürdürme anı; duraklatılmışsa null */
  runningSince: number | null
}

export const startClock = (now: number): SessionClock => ({ activeMs: 0, runningSince: now })

export function elapsedMs(c: SessionClock, now: number): number {
  return c.activeMs + (c.runningSince !== null ? Math.max(0, now - c.runningSince) : 0)
}

export function pauseClock(c: SessionClock, now: number): SessionClock {
  return c.runningSince === null ? c : { activeMs: elapsedMs(c, now), runningSince: null }
}

export function resumeClock(c: SessionClock, now: number): SessionClock {
  return c.runningSince !== null ? c : { activeMs: c.activeMs, runningSince: now }
}

export interface SessionFrame {
  elapsedMs: number
  remainingMs: number
  /** Arayüzde gösterilen kalan saniye (yukarı yuvarlanmış) */
  remainingSeconds: number
  done: boolean
  phase: PhaseState
  /** Hareketli görünümde çemberin ölçeği: sakin ve dar bir aralık (0,82–1) */
  scale: number
}

/** Bir anın bütün görüntü değerleri, tek bir etkin süreden */
export function frameAt(c: SessionClock, now: number, totalMs: number, pattern: Pattern): SessionFrame {
  const elapsed = Math.min(elapsedMs(c, now), totalMs)
  const phase = phaseAt(pattern, elapsed / 1000)
  const remainingMs = totalMs - elapsed
  return { elapsedMs: elapsed, remainingMs, remainingSeconds: Math.ceil(remainingMs / 1000), done: remainingMs <= 0, phase, scale: 0.82 + 0.18 * phase.openness }
}

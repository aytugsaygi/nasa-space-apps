import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../lib/settings'

/*
 * Zihinsel sağlık kutularının arkasındaki sessiz, döngülü video (public/videos/mind). Videolar SI ile üretildi; her birinin
 * sol üstünde görünür "AI GENERATED" filigranı vardır (video sola yaslı kırpıldığı için kutu daralsa da görünür kalır).
 * Kaynaklar ve SI listelerinde yazılıdır.
 *
 * Yalnızca sayfa açıkken ve kutu ekrandayken oynar; başka sayfada ya da kaydırınca görünmeyen kutuda durur. Hareketi azaltma
 * tercihinde video oynamaz, ilk saniyeden alınmış durağan kare görünür. Üstündeki koyu geçiş yazıların okunmasını sağlar.
 */

/**
 * Videolu kutunun başlığı: çerçevesiz, doğrudan videonun üstünde büyük, kalın, büyük harfli beyaz yazı (afiş gibi).
 * Boyutu kutunun genişliğine göre (cqi) ölçeklenir: geniş kutuda 30 px, dar kutuda 22 px.
 * Okunması için yumuşak gölge; imleç gelince index.css .reveal-glass ile biraz yukarı kalkar.
 */
export const HERO_TITLE =
  'reveal-glass text-center font-display text-[clamp(1.375rem,8.5cqi,1.875rem)] leading-[1.02] font-extrabold tracking-[0.01em] text-balance text-white uppercase [text-shadow:0_2px_16px_rgb(0_0_0/0.7)]'
/** Videolu kutunun düğmesi: çerçevesiz, yarı saydam yuvarlak hap */
export const HERO_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.16] px-6 text-[15px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/[0.28]'

export type MindVideo =
  | 'checkin-morning'
  | 'checkin-midday'
  | 'checkin-evening'
  | 'cupola'
  | 'breathing'
  | 'gallery'
  | 'journal'
  | 'mind-games'
  | 'vision-test'
  | 'reaction-test'
  | 'consistency-test'

const src = (name: MindVideo, ext: 'mp4' | 'jpg') => `${import.meta.env.BASE_URL}videos/mind/${name}.${ext}`

/** Hızlı gelen videolar yavaşlatılır (sakin bir arka plan için); listede olmayan normal hızda oynar */
const PLAYBACK_RATE: Partial<Record<MindVideo, number>> = { 'consistency-test': 0.75, journal: 0.75 }

export function VideoBackdrop({ name, active, dim = false }: { name: MindVideo; active: boolean; dim?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const reduced = usePrefersReducedMotion()
  const play = active && !reduced

  // Varsayılan hız da ayarlanır: tarayıcı videoyu yeniden yüklerse hız buna döner
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const rate = PLAYBACK_RATE[name] ?? 1
    video.defaultPlaybackRate = rate
    video.playbackRate = rate
  }, [name, reduced])

  useEffect(() => {
    const video = ref.current
    if (!video) return
    const stop = () => {
      if (!video.paused) video.pause()
    }
    if (!play) {
      stop()
      return
    }
    // Kutu ekranda değilse oynatma (telefonda sayfa kayar)
    let visible = true
    const sync = () => {
      if (visible && !document.hidden) void video.play()?.catch(() => {})
      else stop()
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      sync()
    })
    observer?.observe(video)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [play])

  return (
    <div aria-hidden data-video-backdrop className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Sol üste yaslı kırpılır: kutu daralınca sağdan, basıklaşınca alttan kesilir; sol üstteki filigran ekranda kalır */}
      {reduced ? (
        <img src={src(name, 'jpg')} alt="" className="size-full object-cover object-left-top" />
      ) : (
        <video ref={ref} src={src(name, 'mp4')} poster={src(name, 'jpg')} muted loop playsInline preload="metadata" className="size-full object-cover object-left-top" />
      )}
      {/* Altta koyu (düğme ve açıklama okunur), ortada hafif (başlık camı); filigranın ince koyu kenarı açık renkli videoda da okunur */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/20 ${dim ? 'bg-black/30' : ''}`} />
    </div>
  )
}

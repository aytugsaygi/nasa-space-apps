import { Power, SkipForward } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useContent } from '../data/content'
import { useI18n } from '../i18n'
import { playBoot, unlockAudio } from '../lib/audio'
import { useSettings } from '../lib/settings'

type Phase = 'gate' | 'video' | 'flight' | 'white' | 'line' | 'fade'

interface Props {
  reducedMotion: boolean
  /** Arayüzün çizgiden açılmaya başlayacağı an */
  onOpen: () => void
  /** Açılış katmanı tamamen kaldırılabilir */
  onDone: () => void
}

/**
 * Açılış: koldaki tablete yaklaşan video oynar, son karesi beyazdır.
 * Beyaz ekran tüplü televizyon gibi ince bir çizgiye çöker ve arayüz o çizgiden açılır.
 * Video yüklenemezse ya da başlamazsa kodla çizilen uçuş animasyonu yedek olarak oynar.
 */
const VIDEO_SRC = '/intro.mp4'

export function Intro({ reducedMotion, onOpen, onDone }: Props) {
  const { settings } = useSettings()
  const { t } = useI18n()
  const { crew } = useContent()
  const [phase, setPhase] = useState<Phase>('gate')
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const flightStart = useRef<number | null>(null)
  const timers = useRef<number[]>([])

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  /* Yıldız alanı */
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')!
    let raf = 0
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio, 2)
    const resize = () => {
      w = el.clientWidth
      h = el.clientHeight
      el.width = w * dpr
      el.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const N = 900
    const stars = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      pz: 0,
    }))
    stars.forEach((s) => (s.pz = s.z))

    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const t = flightStart.current ? (now - flightStart.current) / 1000 : 0
      // Hız üstel olarak artar; ışık hedefi büyür
      const speed = flightStart.current ? 0.04 + Math.pow(t / 2.6, 3) * 2.4 : 0.03
      const approach = flightStart.current ? Math.min(1, Math.pow(t / 2.9, 4)) : 0

      ctx.fillStyle = 'rgba(4, 7, 11, 0.42)'
      ctx.fillRect(0, 0, w, h)

      const cx = w / 2
      const cy = h / 2
      const scale = Math.max(w, h) * 0.6

      for (const s of stars) {
        s.pz = s.z
        s.z -= speed * dt
        if (s.z <= 0.01) {
          s.x = (Math.random() - 0.5) * 2
          s.y = (Math.random() - 0.5) * 2
          s.z = 1
          s.pz = 1
        }
        const sx = cx + (s.x / s.z) * scale
        const sy = cy + (s.y / s.z) * scale
        const px = cx + (s.x / s.pz) * scale
        const py = cy + (s.y / s.pz) * scale
        const b = 1 - s.z
        ctx.strokeStyle = `rgba(${190 + b * 60}, ${225 + b * 30}, 255, ${0.15 + b * 0.85})`
        ctx.lineWidth = 0.6 + b * 1.6
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      // Uzaktaki tabletin ışığı: yalnızca uçuş sırasında, küçük yuvarlatılmış bir ekran
      if (!flightStart.current) {
        raf = requestAnimationFrame(draw)
        return
      }
      const tw = 22 + approach * w * 1.6
      const th = tw * 0.64
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, tw * 1.4)
      glow.addColorStop(0, `rgba(181, 232, 251, ${0.35 + approach * 0.6})`)
      glow.addColorStop(1, 'rgba(111, 233, 214, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = `rgba(225, 246, 255, ${0.55 + approach * 0.45})`
      ctx.beginPath()
      ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, Math.max(3, tw * 0.06))
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => clearTimers, [])

  /* Beyaz ekrandan sonraki adımlar */
  const toWhite = () => {
    clearTimers()
    setPhase('white')
    if (settings.sound) playBoot()
    if (reducedMotion) {
      later(250, () => {
        setPhase('fade')
        onOpen()
      })
      later(900, onDone)
      return
    }
    later(260, () => setPhase('line'))
    later(520, () => {
      setPhase('fade')
      onOpen()
    })
    later(1300, onDone)
  }

  /* Yedek: kodla çizilen uçuş */
  const startFlight = () => {
    clearTimers()
    video.current?.pause()
    flightStart.current = performance.now()
    setPhase('flight')
    later(2900, toWhite)
  }

  const start = () => {
    unlockAudio()
    if (reducedMotion) {
      toWhite()
      return
    }
    const v = video.current
    if (!v || v.error) {
      startFlight()
      return
    }
    v.currentTime = 0
    v.muted = !settings.sound
    // Video kısa sürede başlamazsa (yavaş internet) yedeğe geç
    later(2500, () => {
      if (v.paused || v.currentTime < 0.05) startFlight()
    })
    v.play()
      .then(() => setPhase((p) => (p === 'gate' ? 'video' : p)))
      .catch(startFlight)
  }

  const skip = () => {
    unlockAudio()
    video.current?.pause()
    toWhite()
  }

  const whiteVisible = phase === 'white' || phase === 'line' || phase === 'fade'

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Yıldızlar ve kapı ekranı */}
      <div className={`absolute inset-0 bg-void transition-opacity duration-150 ${whiteVisible ? 'opacity-0' : 'opacity-100'}`}>
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />

        {/* Açılış videosu: ekranı kenarlarda boşluk bırakmadan doldurur */}
        <video
          ref={video}
          src={VIDEO_SRC}
          preload="auto"
          playsInline
          onEnded={() => phase === 'video' && toWhite()}
          onError={() => phase === 'video' && startFlight()}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${phase === 'video' ? 'opacity-100' : 'opacity-0'}`}
          aria-hidden
        />

        {/* Uçuş sırasında beyaza dönüş */}
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'flight' ? 1 : 0 }}
          transition={phase === 'flight' ? { delay: 2.35, duration: 0.55, ease: [0.64, 0, 0.78, 0] } : { duration: 0 }}
          aria-hidden
        />

        {phase === 'gate' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center"
          >
            <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">
              {t.intro.missionLine(crew.mission)}
            </p>
            <h1 className="mt-5 font-display text-[clamp(44px,8vw,88px)] leading-none font-semibold tracking-[-0.03em]">Health Atlas</h1>
            <p className="mt-5 max-w-md text-[18px] text-ink-muted">
              {t.intro.connecting(crew.name)}
            </p>
            <button
              type="button"
              onClick={start}
              className="group mt-10 flex min-h-14 items-center gap-3 rounded-2xl bg-holo px-7 text-[17px] font-semibold text-void shadow-[0_0_0_6px_rgb(111_233_214/0.12),0_20px_50px_-12px_rgb(111_233_214/0.45)] transition-[transform,box-shadow] duration-200 hover:shadow-[0_0_0_9px_rgb(111_233_214/0.14),0_20px_60px_-12px_rgb(111_233_214/0.6)] active:scale-[0.98]"
            >
              <Power size={19} aria-hidden />
              {t.intro.start}
            </button>
            <p className="mt-4 text-[14.5px] text-ink-dim">{t.intro.note}</p>
          </motion.div>
        )}

        {phase !== 'gate' && !whiteVisible && (
          <button
            type="button"
            onClick={skip}
            className="absolute right-5 bottom-5 z-10 flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-ink backdrop-blur transition-colors hover:bg-black/60"
          >
            <SkipForward size={16} aria-hidden />
            {t.intro.skip}
          </button>
        )}
        {phase === 'gate' && (
          <button
            type="button"
            onClick={skip}
            className="absolute right-5 bottom-5 z-10 min-h-11 rounded-xl px-4 text-sm text-ink-dim transition-colors hover:text-ink"
          >
            {t.intro.skip}
          </button>
        )}
      </div>

      {/* Beyaz ekran → ince çizgi → arayüz */}
      {whiteVisible && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-1/2 h-full -translate-y-1/2 bg-white"
          initial={{ scaleY: 1, opacity: 1 }}
          animate={
            phase === 'white'
              ? { scaleY: 1, opacity: 1 }
              : phase === 'line'
                ? { scaleY: reducedMotion ? 1 : 0.004, opacity: 1 }
                : { scaleY: reducedMotion ? 1 : 0.004, opacity: 0 }
          }
          transition={
            phase === 'line'
              ? { duration: 0.24, ease: [0.64, 0, 0.78, 0] }
              : phase === 'fade'
                ? { duration: reducedMotion ? 0.5 : 0.45, ease: 'easeOut' }
                : { duration: 0 }
          }
          style={{ boxShadow: '0 0 40px 8px rgb(181 232 251 / 0.9)' }}
          aria-hidden
        />
      )}
    </div>
  )
}

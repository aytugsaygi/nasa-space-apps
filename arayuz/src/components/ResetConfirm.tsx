import { RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'

type Result = 'confirm' | 'cancel'

interface Props {
  open: boolean
  /** Etkin profilin sırası (0'dan başlar) */
  profile: number
  reducedMotion: boolean
  onConfirm: () => void
  onCancel: () => void
}

/* Çizgi film tarzı duman bulutları: kalkış noktasından yanlara ve hafifçe yukarı yayılır */
const PUFFS = [
  { dx: -230, dy: -40, s: 70, d: 0.14 },
  { dx: -150, dy: -24, s: 96, d: 0.06 },
  { dx: -75, dy: -8, s: 118, d: 0 },
  { dx: 0, dy: 4, s: 140, d: 0.02 },
  { dx: 80, dy: -10, s: 112, d: 0.04 },
  { dx: 158, dy: -26, s: 92, d: 0.09 },
  { dx: 236, dy: -44, s: 68, d: 0.16 },
]
/* Alevden düşen kıvılcımlar (yatay sapma, gecikme) */
const SPARKS = [
  { dx: -26, d: 0 },
  { dx: 18, d: 0.09 },
  { dx: -8, d: 0.17 },
  { dx: 30, d: 0.26 },
  { dx: -34, d: 0.33 },
  { dx: 6, d: 0.41 },
]

/**
 * Düzeni sıfırlama onayı. Pencere ekranın alt ortasından roket gibi, çizgi film tarzı bir alev ve
 * duman efektiyle ortaya yükselir. "Sıfırla" denince motor yeniden ateşlenir ve pencere yukarı uçup gider;
 * "Vazgeç" denince sessizce kaybolur. Hareketi azaltma tercihinde yalnızca sade bir solma kalır.
 */
export function ResetConfirm({ open, profile, reducedMotion, onConfirm, onCancel }: Props) {
  const { t } = useI18n()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Kapanış animasyonu sonuca göre değişir (uçup gitme ya da sönme)
  const [result, setResult] = useState<Result>('cancel')
  const launchFrom = typeof window === 'undefined' ? 600 : window.innerHeight / 2 + 220

  const close = (r: Result) => {
    setResult(r)
    if (r === 'confirm') onConfirm()
    else onCancel()
  }
  const cancelLatest = useRef(onCancel)
  useEffect(() => {
    cancelLatest.current = onCancel
  })

  /* Escape vazgeçer; menünün kendi Escape dinleyicisine ulaşmasın diye yakalama aşamasında durdurulur */
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setResult('cancel')
      cancelLatest.current()
    }
    window.addEventListener('keydown', onKey, true)
    const focus = window.setTimeout(() => cancelRef.current?.focus(), 30)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      clearTimeout(focus)
    }
  }, [open])

  /* Odak iki düğme arasında döner, pencerenin dışına çıkmaz */
  const trapFocus = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
    next?.focus()
  }

  const fly: Variants = reducedMotion
    ? {
        hidden: { opacity: 0, scale: 0.97 },
        shown: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, scale: 0.97, transition: { duration: 0.15 } },
      }
    : {
        hidden: { y: launchFrom, x: 0 },
        shown: {
          // Ateşleme titreşimi, ardından hızlanarak yükselme, ortada hafifçe aşıp yerine oturma
          y: [launchFrom, launchFrom, -16, 0],
          x: [0, -3, 3, -2.5, 2.5, -1.5, 0],
          transition: {
            y: { duration: 1.25, times: [0, 0.18, 0.86, 1], ease: ['linear', [0.55, 0, 0.35, 1], [0.3, 0, 0.3, 1]] },
            x: { duration: 0.26, ease: 'linear' },
          },
        },
        exit: (r: Result) =>
          r === 'confirm'
            ? { y: -window.innerHeight, transition: { duration: 0.6, ease: [0.55, 0, 0.9, 0.4] } }
            : { opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.18 } },
      }

  /* Kapanışta sonuç, AnimatePresence üzerinden güncel haliyle gelir */
  const backdrop: Variants = {
    hidden: { opacity: 0 },
    shown: { opacity: 1, transition: { duration: 0.25 } },
    exit: (r: Result) => ({ opacity: 0, transition: { duration: r === 'confirm' && !reducedMotion ? 0.55 : 0.2 } }),
  }

  const flame: Variants = {
    hidden: { opacity: 0, scaleY: 0.2 },
    shown: {
      opacity: [0, 1, 1, 1, 0],
      scaleY: [0.2, 1.3, 1.15, 1, 0.1],
      transition: { duration: 1.3, times: [0, 0.12, 0.6, 0.82, 1] },
    },
    exit: (r: Result) => (r === 'confirm' ? { opacity: 1, scaleY: 1.45, transition: { duration: 0.15 } } : { opacity: 0, transition: { duration: 0.1 } }),
  }

  return (
    <AnimatePresence custom={result}>
      {open && (
        <motion.div
          key="reset-confirm"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          custom={result}
          variants={backdrop}
          initial="hidden"
          animate="shown"
          exit="exit"
        >
          {/* Arka plan: tıklayınca vazgeçer */}
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onMouseDown={() => close('cancel')} aria-hidden />

          {!reducedMotion && (
            <div className="pointer-events-none absolute bottom-0 left-1/2" aria-hidden>
              {/* Kalkış parlaması */}
              <motion.span
                className="absolute -bottom-24 left-0 size-[420px] -translate-x-1/2 rounded-full"
                style={{ background: 'radial-gradient(circle, rgb(255 170 60 / 0.55), rgb(255 90 40 / 0.18) 45%, transparent 70%)' }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 1.2] }}
                transition={{ duration: 1.3, times: [0, 0.25, 1] }}
              />
              {/* Duman bulutları */}
              {PUFFS.map((p, i) => (
                <motion.span
                  key={i}
                  className="rocket-puff absolute bottom-0 left-0 rounded-full"
                  style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginBottom: -p.s / 2 }}
                  initial={{ x: 0, y: 0, scale: 0.2, opacity: 0 }}
                  animate={{ x: p.dx, y: p.dy, scale: [0.2, 1, 1.15], opacity: [0, 0.95, 0] }}
                  transition={{ duration: 1.6, delay: 0.15 + p.d, ease: [0.2, 0.8, 0.3, 1] }}
                />
              ))}
            </div>
          )}

          <motion.div
            className="relative"
            custom={result}
            variants={fly}
            initial="hidden"
            animate="shown"
            exit="exit"
          >
            {/* Roket alevi: pencerenin altından çıkar, varınca söner */}
            {!reducedMotion && (
              <motion.div
                className="pointer-events-none absolute top-full left-1/2 -ml-[45px] origin-top"
                custom={result}
                variants={flame}
                aria-hidden
              >
                <svg className="flame-flicker" width="90" height="150" viewBox="0 0 90 150">
                  <path d="M45 150 C18 110 4 62 14 26 C20 8 70 8 76 26 C86 62 72 110 45 150 Z" fill="#ff5a3c" />
                  <path d="M45 128 C26 98 18 62 25 32 C30 18 60 18 65 32 C72 62 64 98 45 128 Z" fill="#ffad33" />
                  <path d="M45 98 C34 78 30 54 34 34 C37 26 53 26 56 34 C60 54 56 78 45 98 Z" fill="#fff1a8" />
                  <ellipse cx="45" cy="22" rx="26" ry="9" fill="#fff8d6" opacity="0.9" />
                </svg>
                {SPARKS.map((s, i) => (
                  <span
                    key={i}
                    className="rocket-spark absolute top-[110px] left-1/2 size-1.5 rounded-full"
                    style={{ ['--dx' as string]: `${s.dx}px`, animationDelay: `${s.d}s` }}
                  />
                ))}
              </motion.div>
            )}

            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reset-confirm-title"
              aria-describedby="reset-confirm-desc"
              onKeyDown={trapFocus}
              className="panel relative w-[min(420px,calc(100vw-2rem))] p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warn/12 text-warn ring-1 ring-warn/30">
                  <RotateCcw size={20} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="reset-confirm-title" className="font-display text-lg leading-snug font-semibold text-ink">
                    {t.layout.resetConfirmTitle}
                  </h2>
                  <p id="reset-confirm-desc" className="mt-1.5 text-[15.5px] leading-relaxed text-ink-muted">
                    {t.layout.resetConfirmDesc(profile + 1)}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={() => close('cancel')}
                  className="min-h-11 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-white/[0.06]"
                >
                  {t.layout.cancel}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={() => close('confirm')}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-warn px-4 text-sm font-semibold text-void transition-[filter] hover:brightness-110"
                >
                  <RotateCcw size={16} aria-hidden />
                  {t.layout.resetConfirm}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

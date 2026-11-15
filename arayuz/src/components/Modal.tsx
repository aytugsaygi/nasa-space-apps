import { ArrowLeft, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion } from '../lib/settings'

/**
 * Ekranın ortasında açılan pencere (nefes molası, Dünya galerisi, tepki testi, günlük). Sheet ile aynı sözleşme:
 * Escape ve arka plana tıklama kapatır, açılınca odak kapat düğmesine, kapanınca açan düğmeye döner. Sekme tuşu
 * pencerenin içinde döner.
 *
 * Hareket: arka plan yumuşakça kararır, pencere hafifçe büyüyerek ve yukarı kayarak gelir (yaklaşık 0,3 sn), küçülerek
 * gider. Hareketi azaltma tercihinde yalnızca saydamlık değişir.
 *
 * fullscreen: bütün ekranı kaplar (zihinsel sağlık kütüphanesindeki Başlat ile açılanlar). Kapat düğmesi yerine sol üstte
 * yazılı bir Geri düğmesi vardır; arka plana tıklamak kapatmaz, Escape kapatır.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  icon,
  width = 'w-[min(560px,calc(100vw-2rem))]',
  children,
  id,
  initialFocus,
  fullscreen = false,
  backLabel,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  closeLabel: string
  icon?: ReactNode
  width?: string
  children: ReactNode
  id?: string
  /** Açılınca odaklanacak öğe (seçici); yoksa kapat düğmesi */
  initialFocus?: string
  /** Bütün ekranı kaplayan görünüm (sol üstte Geri düğmesi) */
  fullscreen?: boolean
  /** Tam ekranda Geri düğmesinin yazısı */
  backLabel?: string
}) {
  const reduced = usePrefersReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useInteraction('dialog', open)

  // Kapatma işlevi her çizimde yenilenebilir: odak yalnızca açılış ve kapanışta taşınır
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => {
      const target = initialFocus ? panelRef.current?.querySelector<HTMLElement>(initialFocus) : null
      ;(target ?? closeRef.current)?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current()
      if (e.key !== 'Tab' || !panelRef.current) return
      // Odak pencerenin içinde kalır
      const items = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
    // initialFocus sabit bir seçicidir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (fullscreen)
    return createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id ? `${id}-title` : undefined}
            className="app-backdrop fixed inset-0 z-50 flex flex-col"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-line bg-black/35 px-4 py-3 backdrop-blur-md sm:px-6">
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line px-3.5 text-[15px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-white/[0.04]"
              >
                <ArrowLeft size={18} aria-hidden />
                {backLabel ?? closeLabel}
              </button>
              {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 id={id ? `${id}-title` : undefined} className="font-display text-[19px] leading-tight font-semibold">
                  {title}
                </h2>
                {subtitle && <div className="mt-0.5 truncate text-[14.5px] text-ink-muted">{subtitle}</div>}
              </div>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          transition={{ duration: 0.22 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id ? `${id}-title` : undefined}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`flex max-h-[min(92dvh,900px)] ${width} flex-col overflow-hidden rounded-3xl border border-line-strong bg-raised shadow-2xl`}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
              {icon && <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 id={id ? `${id}-title` : undefined} className="font-display text-[18px] leading-tight font-semibold">
                  {title}
                </h2>
                {subtitle && <div className="mt-1 text-[14.5px] text-ink-muted">{subtitle}</div>}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <X size={17} aria-hidden />
              </button>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion } from '../lib/settings'

/**
 * Sağdan açılan panel (grafik, şikayet geçmişi, ölçüm girişi). Escape ve arka plana tıklama kapatır;
 * açılınca odak panele, kapanınca açan düğmeye döner.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  closeLabel,
  icon,
  width = 'w-[min(580px,100vw)]',
  children,
  id,
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
}) {
  const reduced = usePrefersReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)
  // Panel açıkken otomatik içerik (ör. check-in sorusu) açılmaz
  useInteraction('dialog', open)

  // Kapatma işlevi her çizimde yenilenebilir (üst bileşen yeniden çizilince): odak yalnızca açılış/kapanışta taşınır.
  // Önceden bu etki onClose'a bağlıydı; arka plan yenilendikçe odak kapat düğmesine kaçıyor, yazı yazılamıyordu.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => closeRef.current?.focus(), 30)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  // Panel sayfa gövdesine çizilir: dönüşüm (transform) taşıyan bir kartın içinden açılsa da ekranın sağına yerleşir
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={id ? `${id}-title` : undefined}
            initial={reduced ? { opacity: 0 } : { x: '100%' }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: '100%', transition: { duration: 0.2, ease: [0.64, 0, 0.78, 0] } }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className={`flex h-dvh ${width} flex-col border-l border-line-strong bg-raised shadow-2xl`}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
              {icon && <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">{icon}</span>}
              <div className="min-w-0 flex-1">
                <h2 id={id ? `${id}-title` : undefined} className="font-display text-[18px] font-semibold leading-tight">
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
                <X size={17} />
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

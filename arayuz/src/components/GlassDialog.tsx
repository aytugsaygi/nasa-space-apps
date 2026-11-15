import { ArrowRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion } from '../lib/settings'

/** Bütün cam pencerelerde aynı hareket eğrisi: ağır başlayıp yumuşakça oturan */
export const GLASS_EASE = [0.32, 0.72, 0, 1] as const

/**
 * Ekranın ortasında açılan cam pencere (check-in, tepki testi). Arka plandaki sayfa hafifçe görünür; panel iç içe iki
 * yuvarlak köşeli katmandan oluşur (dış kabuk ve iç çekirdek). Başlık büyük, sistemin başlık yazı tipiyle ve hafif parlak.
 *
 * Modal ile aynı sözleşme: açılınca odak kapat düğmesine, kapanınca açan düğmeye döner; Esc ve arka plana tıklama kapatır;
 * Tab pencerenin içinde döner. Telefonda bütün ekranı kaplar.
 */
export function GlassDialog({
  open,
  onClose,
  id,
  title,
  subtitle,
  closeLabel,
  panelRef,
  expanded = false,
  initialFocus,
  tone = 'holo',
  children,
}: {
  open: boolean
  onClose: () => void
  id: string
  title: ReactNode
  /** Başlığın altında küçük satır (ör. saat aralığı); önünde parlayan bir nokta */
  subtitle?: ReactNode
  closeLabel: string
  /** Pencerenin dışından klavye kısayolu bağlamak için */
  panelRef?: RefObject<HTMLDivElement | null>
  /** Aynı sayfada bütün ekrana yayılır (kenarlarda ince bir pay kalır; arkadaki sayfa hafif bulanık görünür) */
  expanded?: boolean
  /** Açılınca odaklanacak öğe (seçici); yoksa kapat düğmesi */
  initialFocus?: string
  /** Renk tonu: acil durum penceresi kırmızı ışıkla açılır */
  tone?: 'holo' | 'crit'
  children: ReactNode
}) {
  const reduced = usePrefersReducedMotion()
  const ownRef = useRef<HTMLDivElement>(null)
  const ref = panelRef ?? ownRef
  const closeRef = useRef<HTMLButtonElement>(null)
  useInteraction('dialog', open)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => (((initialFocus && ref.current?.querySelector<HTMLElement>(initialFocus)) || closeRef.current) as HTMLElement | null)?.focus(), 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current()
      if (e.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
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
    // ref sabittir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={id}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[6px] md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, ease: GLASS_EASE } }}
          transition={{ duration: 0.4, ease: GLASS_EASE }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          {/* Arka planda iki yumuşak ışık: panel boşlukta asılı gibi durur */}
          <div aria-hidden className="pointer-events-none absolute top-[12%] left-[18%] size-[42vmax] rounded-full bg-holo/[0.04] blur-[120px]" />
          <div aria-hidden className="pointer-events-none absolute right-[12%] bottom-[8%] size-[34vmax] rounded-full bg-[#6c63ff]/[0.04] blur-[120px]" />

          {/* Dış kabuk ve iç çekirdek: cam bir levha alüminyum bir tepside gibi (iç içe iki yuvarlak köşe) */}
          <motion.div
            ref={ref}
            id={id}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            className={`relative h-[100dvh] w-full transition-[width,height] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:rounded-[2.25rem] md:bg-white/[0.035] md:p-1.5 md:shadow-[0_60px_140px_-50px_rgb(0_0_0/0.95)] md:ring-1 md:ring-white/10 ${expanded ? 'md:h-[calc(100dvh-1.5rem)] md:w-[calc(100vw-1.5rem)]' : 'md:h-[min(740px,calc(100dvh-3rem))] md:w-[min(1080px,calc(100vw-3rem))]'}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97, filter: 'blur(8px)' }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.985, filter: 'blur(6px)', transition: { duration: 0.22, ease: GLASS_EASE } }}
            transition={{ duration: 0.65, ease: GLASS_EASE }}
          >
            <div className="relative flex size-full flex-col overflow-clip bg-[#060a0f] shadow-[inset_0_1px_1px_rgb(255_255_255/0.07)] md:rounded-[calc(2.25rem-0.375rem)]">
              <div aria-hidden className={`pointer-events-none absolute -top-48 -left-40 size-[560px] rounded-full blur-[110px] ${tone === 'crit' ? 'bg-crit/[0.1]' : 'bg-holo/[0.09]'}`} />
              <div aria-hidden className={`pointer-events-none absolute -right-40 -bottom-56 size-[520px] rounded-full blur-[120px] ${tone === 'crit' ? 'bg-crit/[0.06]' : 'bg-[#6c63ff]/[0.08]'}`} />

              <header className="relative flex shrink-0 items-center gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
                <div className="min-w-0 flex-1">
                  <h2
                    id={`${id}-title`}
                    className={`bg-gradient-to-r from-white via-white bg-clip-text ${tone === 'crit' ? 'to-crit' : 'to-holo'} pb-1 font-display leading-[1.05] font-semibold tracking-[-0.025em] text-transparent transition-[font-size] duration-500 ${expanded ? 'text-[26px] md:text-[30px]' : 'text-[32px] md:text-[42px]'}`}
                  >
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="tabular mt-1.5 flex items-center gap-2 font-mono text-[13px] tracking-[0.08em] text-ink-dim">
                      <span aria-hidden className={`size-1.5 rounded-full ${tone === 'crit' ? 'bg-crit shadow-[0_0_8px_var(--color-crit)]' : 'bg-holo shadow-[0_0_8px_var(--color-holo)]'}`} />
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  title={closeLabel}
                  className="group flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-ink-muted ring-1 ring-white/10 transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.08] hover:text-ink active:scale-95"
                >
                  <X size={18} strokeWidth={1.5} className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:rotate-90" aria-hidden />
                </button>
              </header>

              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Ana düğme: dolu hap; simge kendi yuvarlak yuvasında, üstüne gelince öne kayar; basınca hafifçe çöker */
export function PillPrimary({ children, onClick, disabled, large, icon, id }: { children: ReactNode; onClick: () => void; disabled?: boolean; large?: boolean; icon?: ReactNode; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex items-center gap-3 rounded-full bg-holo pr-1.5 font-semibold text-void shadow-[0_10px_40px_-12px_var(--color-holo)] transition-[transform,box-shadow,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_14px_50px_-10px_var(--color-holo)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none ${large ? 'min-h-14 pl-7 text-[17px]' : 'min-h-12 pl-6 text-[15.5px]'}`}
    >
      {children}
      <span
        className={`flex items-center justify-center rounded-full bg-black/15 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:scale-105 group-disabled:translate-x-0 group-disabled:scale-100 ${large ? 'size-11' : 'size-9'}`}
      >
        {icon ?? <ArrowRight size={17} strokeWidth={2} aria-hidden />}
      </span>
    </button>
  )
}

/** İkincil düğme: yalnızca yazı ve simge; üstüne gelince hafif bir zemin */
export function PillGhost({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-12 items-center gap-2 rounded-full px-4 text-[15px] text-ink-muted transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.05] hover:text-ink active:scale-[0.98]"
    >
      <span className="transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-x-0.5">{icon}</span>
      {children}
    </button>
  )
}

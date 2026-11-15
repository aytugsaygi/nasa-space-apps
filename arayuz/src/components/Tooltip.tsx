import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const EDGE = 8

/**
 * Fareyle üzerine gelince ve klavyeyle (Tab) odaklanınca görünen kısa açıklama.
 * Sayfanın en üst katmanında (body) çizilir: hiçbir bölümün altında kalmaz, panel kenarında kırpılmaz.
 * Ekrana sığmazsa ters yöne açılır, yatayda ekran kenarına yaslanır.
 * Fareyle tıklandıktan sonra açık kalmaz; fare çıkıp yeniden gelince tekrar görünür.
 */
export function Tooltip({
  label,
  children,
  side = 'bottom',
  align = 'center',
  wide = false,
  className = '',
}: {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  align?: 'center' | 'start' | 'end'
  wide?: boolean
  /** Kapsayıcıya ek sınıf (ör. ızgara hücresini doldurmak için) */
  className?: string
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLSpanElement>(null)
  const pressed = useRef(false)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number; side: 'top' | 'bottom' } | null>(null)

  const show = () => {
    if (!pressed.current) setOpen(true)
  }
  const hide = () => {
    setOpen(false)
    setPlace(null)
  }

  /* Konum, kutu çizildikten hemen sonra ve ekrana yansımadan önce hesaplanır */
  useLayoutEffect(() => {
    if (!open) return
    const a = anchor.current
    const b = box.current
    if (!a || !b) return
    const r = a.getBoundingClientRect()
    const bw = b.offsetWidth
    const bh = b.offsetHeight
    let left = align === 'center' ? r.left + r.width / 2 - bw / 2 : align === 'start' ? r.left : r.right - bw
    left = Math.min(Math.max(EDGE, left), window.innerWidth - bw - EDGE)
    const above = r.top - GAP - bh
    const below = r.bottom + GAP
    let s = side
    if (s === 'bottom' && below + bh > window.innerHeight - EDGE && above >= EDGE) s = 'top'
    else if (s === 'top' && above < EDGE && below + bh <= window.innerHeight - EDGE) s = 'bottom'
    setPlace({ top: s === 'top' ? above : below, left, side: s })
  }, [open, side, align, label])

  /* Açıkken sayfa kayar ya da pencere boyutu değişirse kutu çapasından kopmasın diye kapanır */
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])

  return (
    <span
      ref={anchor}
      className={`relative inline-flex ${className}`}
      onPointerEnter={(e) => e.pointerType !== 'touch' && show()}
      onPointerLeave={() => {
        pressed.current = false
        hide()
      }}
      onPointerDown={() => {
        pressed.current = true
        hide()
      }}
      onFocus={(e) => (e.target as Element).matches(':focus-visible') && show()}
      onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && hide()}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={box}
            role="tooltip"
            data-side={place?.side ?? side}
            style={{ top: place?.top ?? -9999, left: place?.left ?? -9999 }}
            className={`tooltip-pop pointer-events-none fixed z-[70] ${
              wide ? 'w-64 whitespace-normal' : 'whitespace-nowrap'
            } rounded-lg border border-line-strong bg-raised px-3 py-2 text-[14.5px] leading-snug text-ink-muted shadow-2xl ${place ? '' : 'invisible'}`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}

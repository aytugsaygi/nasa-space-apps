import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 10
const EDGE = 8

/**
 * Bölüm açıklaması düğmesi (ⓘ): bölümün üst kenarındaki sabitle/kaldır düğmelerinin yanında durur.
 * Açıklama yalnızca istenince ve düğmenin hemen yanında açılır (eskiden imleç bölümün herhangi bir yerinde bekleyince
 * kendiliğinden ve bölümün kenarında açılıyordu; başka bölümlerin üstüne biniyordu).
 * - Fareyle üzerine gelince ya da klavyeyle odaklanınca görünür, ayrılınca kapanır.
 * - Tıklayınca (dokunmatikte dokununca) açık kalır; yeniden tıklayınca, Esc'e basınca ya da dışarı tıklayınca kapanır.
 * Kutu düğmenin altında açılır; altta yer yoksa üstünde. Sayfanın en üst katmanında çizilir, hiçbir bölümün altında kalmaz.
 * İçerik: başlık, bölümün ne olduğu (what) ve "Nasıl kullanılır" maddeleri (how). Uzunsa kutunun içinde kayar.
 */
export function ToolInfoButton({
  title,
  what,
  how,
  howLabel,
  label,
}: {
  title: string
  what: ReactNode
  how?: readonly string[]
  howLabel?: string
  label: string
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const open = hover || pinned

  const close = () => {
    setHover(false)
    setPinned(false)
  }

  /* Konum, kutu çizildikten hemen sonra ve ekrana yansımadan önce hesaplanır */
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }
    const b = button.current?.getBoundingClientRect()
    const el = box.current
    if (!b || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), window.innerWidth - w - EDGE)
    const below = b.bottom + GAP
    const above = below + h > window.innerHeight - EDGE && b.top - GAP - h >= EDGE
    setPlace({ top: above ? b.top - GAP - h : below, left, above })
  }, [open])

  /* Açıkken: Esc ve dışarı tıklama kapatır; sayfa kayar ya da pencere boyutu değişirse kutu çapasından kopmasın diye kapanır */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: globalThis.PointerEvent) => {
      if (!button.current?.contains(e.target as Node) && !box.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onPointerEnter={(e: PointerEvent) => e.pointerType !== 'touch' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={(e) => e.target.matches(':focus-visible') && setHover(true)}
        onBlur={() => setHover(false)}
        className={`relative flex size-8 items-center justify-center rounded-full border border-line-strong bg-raised shadow-lg transition-[background-color,border-color,color] duration-150 ${
          open ? 'text-holo' : 'text-ink-muted hover:border-holo/50 hover:text-holo'
        }`}
      >
        <Info size={15} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={box}
            id={id}
            role="tooltip"
            data-tool-info
            data-side={place?.above ? 'top' : 'bottom'}
            style={{ top: place?.top ?? -9999, left: place?.left ?? -9999 }}
            className={`tool-info scroll-thin fixed z-[70] max-h-[min(70vh,520px)] w-[min(380px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-holo/30 bg-raised/95 px-4 py-3 shadow-2xl backdrop-blur-md ${place ? '' : 'invisible'}`}
          >
            <p className="font-display text-[15px] font-semibold text-holo">{title}</p>
            <div className="mt-1 text-[14px] leading-snug text-ink-muted">{what}</div>
            {how && how.length > 0 && (
              <>
                <p className="mt-3 font-mono text-[12px] font-semibold tracking-[0.07em] text-ink-dim uppercase">{howLabel}</p>
                <ul className="mt-1.5 space-y-1.5 text-[14px] leading-snug text-ink">
                  {how.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-holo" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

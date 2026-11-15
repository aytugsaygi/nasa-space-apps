import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

/** Butona bağlı küçük açılır panel. Dışarı tıklayınca veya Esc ile kapanır. */
export function Popover({
  open,
  onClose,
  trigger,
  children,
  width = 'w-80',
  label,
}: {
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
  width?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={ref} className="relative">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute right-0 top-full z-50 mt-2 ${width} origin-top-right rounded-2xl border border-line-strong bg-raised p-2 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.85)]`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

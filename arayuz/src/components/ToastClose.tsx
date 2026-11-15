import { X } from 'lucide-react'

/** Bildirimin sağ üst köşesindeki küçük kapatma düğmesi. Kapsayıcı `relative` olmalı ve sağ üstte yer bırakmalı. */
export function ToastClose({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      title={label}
      className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
    >
      <X size={14} aria-hidden />
    </button>
  )
}

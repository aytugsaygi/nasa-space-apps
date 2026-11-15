import { CheckCircle2, Undo2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'

/**
 * Kısa onay ve tek eylemli bildirim (ör. "Profil 1 ilk haline döndü · Geri al").
 * Eylem ve kapatma aynı boyda sade düğmelerdir; alttaki ince çubuk bildirimin ne zaman kapanacağını gösterir.
 * Süreyi bildirim kendisi tutar (kütüphanenin üzerine gelince durdurma davranışı kullanılmaz):
 * çubuk ve kapanma aynı saate bağlıdır, imleç üzerindeyken de süre işlemeye devam eder.
 */
export function ActionToast({
  message,
  actionLabel,
  durationMs,
  onAction,
  onDismiss,
}: {
  message: string
  actionLabel: string
  /** Bildirimin ekranda kalma süresi; süre çubuğu bununla aynı hızda azalır */
  durationMs: number
  onAction: () => void
  onDismiss: () => void
}) {
  const { t } = useI18n()
  const dismissLatest = useRef(onDismiss)
  useEffect(() => {
    dismissLatest.current = onDismiss
  })
  useEffect(() => {
    const timer = setTimeout(() => dismissLatest.current(), durationMs)
    return () => clearTimeout(timer)
  }, [durationMs])

  return (
    <div className="relative flex w-[min(380px,calc(100vw-2rem))] items-center gap-3 overflow-hidden rounded-2xl border border-line-strong bg-raised/90 py-2 pr-2 pl-3 shadow-2xl backdrop-blur-xl">
      <CheckCircle2 size={18} className="shrink-0 text-ok" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{message}</p>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => {
            onAction()
            onDismiss()
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[14.5px] font-semibold text-holo transition-colors hover:bg-holo/10"
        >
          <Undo2 size={14} aria-hidden />
          {actionLabel}
        </button>
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.toast.close}
          title={t.toast.close}
          className="flex size-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      {/* Süre çubuğu: bildirim kapanana kadar azalır */}
      <span className="toast-progress absolute inset-x-0 bottom-0 h-[2px] origin-left bg-holo/60" style={{ animationDuration: `${durationMs}ms` }} aria-hidden />
    </div>
  )
}

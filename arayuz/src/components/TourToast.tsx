import { Compass } from 'lucide-react'
import { tourFor } from '../data/content'
import { useI18n } from '../i18n'
import { useInteraction } from '../lib/interaction'
import { ToastClose } from './ToastClose'

/** İlk açılıştan sonra rehber tur önerisi. Metni her çizimde seçili dile göre çözülür. */
export function TourToast({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  const { lang, t } = useI18n()
  // Öneri görünürken otomatik check-in sorusu açılmaz (iki şey aynı anda dikkat istemesin)
  useInteraction('dialog', true)
  return (
    <div className="relative w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-line-strong bg-raised p-4 pr-11 shadow-2xl">
      <div className="flex items-start gap-3">
        <Compass size={18} className="mt-0.5 shrink-0 text-holo" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t.toast.tourTitle}</p>
          <p className="text-[14.5px] text-ink-muted">{t.toast.tourDesc(tourFor(lang).length)}</p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onDismiss} className="min-h-9 rounded-lg border border-line px-2.5 text-[14.5px] text-ink-muted hover:text-ink">
          {t.toast.skip}
        </button>
        <button
          type="button"
          onClick={() => {
            onDismiss()
            onStart()
          }}
          className="min-h-9 rounded-lg bg-holo px-3 text-[14.5px] font-semibold text-void"
        >
          {t.toast.start}
        </button>
      </div>
      <ToastClose label={t.toast.close} onClose={onDismiss} />
    </div>
  )
}

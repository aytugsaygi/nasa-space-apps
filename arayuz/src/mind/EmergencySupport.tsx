import { ArrowRight, Siren, Stethoscope } from 'lucide-react'
import { useId } from 'react'
import { useHealth } from '../data/health'
import { useI18n } from '../i18n'
import { openCrewAssist, openDoctorContact } from '../lib/emergencyFlow'
import { delayRangeText, delayText } from './checkinFormat'

/*
 * Acil destek (docs/wellbeing EM-01…EM-05): tam olarak iki ana seçenek.
 * - Hekimle iletişime geç: mesaj oluşturucuyu açar (yaz, isteğe bağlı veri ekle, gözden geçir, gönder; DoctorContact.tsx).
 * - Acil durum: ortadaki acil durum penceresini açar (açmak bildirim göndermez; basılı tutunca etkinleşir; EmergencyDialog.tsx).
 * Hiçbir yol asistanla değiştirilmez. Göndermeyi yalnızca astronot yapabilir.
 */

/**
 * İki yol: sayfadaki bölümde, check-in kartından açılan pencerede ve check-in formunda aynı içerik.
 * onLeave: oluşturucu açılmadan önce bulunulan pencereyi kapatır (iç içe pencere oluşmaz).
 */
export function EmergencyPaths({ onLeave }: { onLeave?: () => void }) {
  const { t, locale } = useI18n()
  const { canEdit, snapshot } = useHealth()
  const id = useId()
  const e = t.mindPage.emergency
  const comm = snapshot?.comm
  const delay = delayText(comm?.delayMs ?? 0, locale)
  const doctorDesc = comm?.blackout ? e.doctorBlackout : comm?.rangeMs ? e.doctorDescRange(delayRangeText(comm.rangeMs, locale), delay) : e.doctorDesc(delay)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-xl border border-line bg-white/[0.015] p-3">
        <button
          type="button"
          onClick={() => {
            onLeave?.()
            openDoctorContact()
          }}
          disabled={!canEdit}
          aria-haspopup="dialog"
          aria-describedby={`${id}-doctor`}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Stethoscope size={16} aria-hidden />
          <span className="flex-1 text-left">{e.doctor}</span>
          <ArrowRight size={16} aria-hidden />
        </button>
        <p id={`${id}-doctor`} className="mt-2 text-[14.5px] leading-snug text-ink-muted">
          {doctorDesc}
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white/[0.015] p-3">
        <button
          type="button"
          onClick={() => {
            onLeave?.()
            openCrewAssist()
          }}
          disabled={!canEdit}
          aria-haspopup="dialog"
          aria-describedby={`${id}-crew`}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Siren size={16} aria-hidden />
          <span className="flex-1 text-left">{e.crew}</span>
          <ArrowRight size={16} aria-hidden />
        </button>
        <p id={`${id}-crew`} className="mt-2 text-[14.5px] leading-snug text-ink-muted">
          {e.crewDesc}
        </p>
      </div>

      {!canEdit && <p className="text-[14.5px] text-ink-muted">{e.surgeon}</p>}
    </div>
  )
}


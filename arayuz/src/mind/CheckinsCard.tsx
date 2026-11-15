import { FolderOpen } from 'lucide-react'
import { useId, useState, type CSSProperties } from 'react'
import { Tooltip } from '../components/Tooltip'
import { CHECKIN_CONFIG, type CheckinWindowView } from '../core/checkins'
import { useHealth, useQuery } from '../data/health'
import { useAppCommand } from '../lib/appCommands'
import { useI18n } from '../i18n'
import { CheckinStatus } from './CheckinStatus'
import { missionDate, missionTime, missionZone } from './checkinFormat'
import { MyRecords } from './MyRecords'
import { HERO_BUTTON, HERO_TITLE, VideoBackdrop, type MindVideo } from './VideoBackdrop'

/*
 * Zihinsel sağlık sayfasının başı: başlık ve görev gününün üç check-in penceresi (docs/wellbeing CI-01…CI-08). Her pencere
 * kendi videosunun (sabah, öğle, akşam) önünde gösterilir. Pencerelerin durumu çekirdek motordan gelir; arayüz yalnızca
 * gösterir. Açık ya da ertelenmiş pencerede "Check-in yap" formu açar; kapanmış pencere yeni form olarak açılmaz (geç
 * gönderim yalnızca zaten açık olan formdan yapılır), açılmamış pencereye gönderim yoktur.
 * Kayıtlarım başlığın sağındadır. Testler ve zihin egzersizleri sağdaki "Kendini tanı" bölümünde (MindActionsCard), günlük
 * yazmak destek kütüphanesindedir; acil destek üst çubuktadır.
 */
const VIDEO: Record<string, MindVideo> = { morning: 'checkin-morning', midday: 'checkin-midday', evening: 'checkin-evening' }

export function CheckinsCard({ onOpenCheckin, active = false }: { onOpenCheckin: (key: string) => void; active?: boolean }) {
  const { t, locale } = useI18n()
  const { astronaut, canEdit } = useHealth()
  const day = useQuery('checkinDay', astronaut && canEdit ? [astronaut] : null)
  const first = day?.[0]
  // Şu anki pencere: görev gününün açılmış son penceresi
  const currentKey = [...(day ?? [])].reverse().find((v) => v.outcome !== 'upcoming')?.key
  const m = t.mindPage
  const [recordsOpen, setRecordsOpen] = useState(false)
  // Asistandan: Kayıtlarım'ı aç; şu anki pencere açıksa check-in formunu aç
  useAppCommand('openRecords', () => setRecordsOpen(true))
  useAppCommand('openCheckin', () => {
    const view = day?.find((v) => v.key === currentKey)
    if (view?.acceptsSubmission && view.outcome !== 'expired') onOpenCheckin(view.key)
  })

  return (
    <section id="tour-mood" aria-labelledby="checkins-title" className="panel @container flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[11rem] flex-1">
          <h2 id="checkins-title" className="font-display text-[22px] leading-tight font-semibold tracking-tight text-balance">
            {m.title}
          </h2>
          {first && <p className="mt-0.5 text-[15.5px] text-ink-muted">{m.subtitle(missionDate(first.date, locale))}</p>}
        </div>
        {/* Kayıtlarım: check-in geçmişi ve günlük (hekim görünümünde kayıtlar gizlidir; pencere bunu kendisi söyler) */}
        <Tooltip label={m.recordsTip}>
          <button
            type="button"
            id="tour-journal"
            onClick={() => setRecordsOpen(true)}
            aria-haspopup="dialog"
            className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-medium text-ink transition-colors hover:border-holo/40 hover:bg-holo/[0.06]"
          >
            <FolderOpen size={18} className="text-holo" aria-hidden />
            {m.records}
          </button>
        </Tooltip>
      </header>

      {!canEdit ? (
        <p className="text-[15.5px] text-ink-muted">{m.surgeon}</p>
      ) : (
        <>
          <p className="text-[14.5px] leading-snug text-ink-muted">
            <span>{m.estimate(CHECKIN_CONFIG.estimatedMinutes)}</span> {first && <span>{m.missionTime(missionZone(first.opensAt, locale))}</span>}
          </p>

          <ul aria-label={m.windowsLabel} className="scroll-thin grid min-h-0 flex-1 auto-rows-[minmax(13rem,1fr)] gap-3 overflow-y-auto @min-[34rem]:grid-cols-3" data-wheel-scroll>
            {day === null
              ? [0, 1, 2].map((i) => <li key={i} className="skeleton rounded-xl" aria-hidden />)
              : day.map((v) => (
                  <li key={v.key} className="min-h-0">
                    <WindowCard view={v} current={v.key === currentKey} onOpen={onOpenCheckin} active={active} />
                  </li>
                ))}
          </ul>
        </>
      )}
      <MyRecords open={recordsOpen} onClose={() => setRecordsOpen(false)} />
    </section>
  )
}

/** Bir check-in penceresi: videosunun önünde adı, görev saatine göre aralığı, durumu ve (pencere açıkken) eylemi */
function WindowCard({ view, current, onOpen, active }: { view: CheckinWindowView; current: boolean; onOpen: (key: string) => void; active: boolean }) {
  const { t, locale } = useI18n()
  const m = t.mindPage
  const titleId = useId()
  const at = (ms: number) => missionTime(ms, locale)
  const rec = view.record
  const detail =
    view.outcome === 'pending'
      ? m.detail.pending(at(view.closesAt))
      : view.outcome === 'deferred'
        ? m.detail.deferred(at(view.closesAt))
        : view.outcome === 'saved' && rec
          ? rec.late
            ? m.detail.late(at(rec.submittedAt))
            : m.detail.saved(at(rec.submittedAt))
          : view.outcome === 'skipped'
            ? m.detail.skipped
            : view.outcome === 'expired'
              ? m.detail.expired
              : m.detail.upcoming(at(view.opensAt))

  return (
    <article
      aria-labelledby={titleId}
      aria-current={current ? 'time' : undefined}
      data-window={view.window}
      data-outcome={view.outcome}
      className={`reveal-tile @container relative isolate flex h-full flex-col overflow-hidden rounded-xl border p-3.5 ${current ? 'border-holo/45 shadow-[0_0_0_1px_rgb(111_233_214/0.15)]' : 'border-line'}`}
    >
      <VideoBackdrop name={VIDEO[view.window] ?? 'checkin-morning'} active={active} />
      {/* Filigran sol üstte; "Şu an" sağ üstte durur */}
      {current && <span className="absolute top-2.5 right-2.5 rounded-full bg-holo/20 px-2.5 py-0.5 text-[13px] font-medium text-holo backdrop-blur-md">{m.current}</span>}
      {/* Afiş düzeni: orta-altta pencerenin adı, imleç gelince aralık, durum ve ayrıntı, altında eylem; ortalı ve çerçevesiz */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-end text-center">
        <h3 id={titleId} className={HERO_TITLE}>
          {m.windowName(view.window)}
        </h3>
        <div className="reveal-rows w-full">
          <div className="flex flex-col items-center gap-0.5 [text-shadow:0_1px_4px_rgb(0_0_0/0.85)]">
            <p className="reveal-line tabular pt-1 font-mono text-[14.5px] text-white/85">{m.range(at(view.opensAt), at(view.closesAt))}</p>
            <div className="reveal-line" style={{ '--i': 1 } as CSSProperties}>
              <CheckinStatus view={view} />
            </div>
            <p className="reveal-line text-[14px] leading-snug text-white/80" style={{ '--i': 2 } as CSSProperties}>
              {detail}
            </p>
            {rec?.outcome === 'saved' && (
              <p className="reveal-line text-[14px] text-white/80" style={{ '--i': 3 } as CSSProperties}>
                {m.answered(rec.answered, rec.answered + rec.omitted.length)}
              </p>
            )}
          </div>
        </div>
        {/* Açık (ya da ertelenmiş) pencerede eylem; açılmamış ve kapanmış pencere yeni form olarak açılmaz */}
        {view.acceptsSubmission && view.outcome !== 'expired' && (
          <button
            type="button"
            onClick={() => onOpen(view.key)}
            aria-haspopup="dialog"
            aria-label={`${rec?.outcome === 'saved' ? m.edit : m.start}: ${m.windowName(view.window)}`}
            className={`mt-3 ${HERO_BUTTON}`}
          >
            {rec?.outcome === 'saved' ? m.edit : m.start}
          </button>
        )}
      </div>
    </article>
  )
}

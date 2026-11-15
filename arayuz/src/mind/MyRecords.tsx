import { BookHeart, CalendarCheck, Check, Clock, Database, Lock, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { GlassDialog } from '../components/GlassDialog'
import { CHECKIN_CONFIG } from '../core/checkins'
import { civilDate } from '../core/zonedTime'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { CheckinStatus } from './CheckinStatus'
import { missionDate, missionTime } from './checkinFormat'
import { buildRecords, RECORD_FILTERS, type RecordFilter, type RecordItem } from './records'

/*
 * Kayıtlarım (docs/wellbeing CI-10…CI-12, HCI-01, HCI-02): astronotun check-in kayıtları ve özel günlüğü tek listede,
 * en yeni önce; Tümü / Check-in'ler / Günlük filtresiyle. Her kayıtta tür, görev tarihi, gerçek kayıt anı ve (check-in'de)
 * pencere görünür; kısmi cevap ve geç gönderim açıkça yazılır, boş bırakılan soru "Yanıtlanmadı" olarak gösterilir.
 * Günlüğe başlıktaki "Günlük yaz" penceresinden yazılır; günlük metni analiz edilmez, puanlanmaz, başka kayda ya da mesaja eklenmez.
 * Kayıtlar hekim görünümünde gösterilmez (gizlilik rol görünümüyle sağlanır, şifreleme yoktur).
 */
export function MyRecords({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { astronaut, canEdit } = useHealth()
  const r = t.mindPage.recordsSheet
  const [filter, setFilter] = useState<RecordFilter>('all')
  const views = useQuery('wellbeingCheckins', open && canEdit && astronaut ? [astronaut, 7] : null)
  const journal = useQuery('journal', open && canEdit && astronaut ? [astronaut] : null)
  const loading = views === null || journal === null
  const items = loading ? [] : buildRecords(views, journal, filter)

  // Ekranın ortasında cam pencere (check-in ve günlükle aynı görünüm); günlüğe yazmak başlıktaki "Günlük yaz" penceresindedir
  return (
    <GlassDialog open={open} onClose={onClose} id="my-records" title={t.mindPage.records} subtitle={r.subtitle} closeLabel={r.close}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pt-6 pb-8 sm:px-10">
        {!canEdit ? (
          <p className="text-[15.5px] text-ink-muted">{r.surgeon}</p>
        ) : (
          <>
            {/* Süzgeç: oval sekmeler; seçilende soldan sağa solan ışık */}
            <div role="group" aria-label={r.filterLabel} className="flex w-fit flex-wrap gap-1.5">
              {RECORD_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className="flex min-h-11 items-center gap-1.5 rounded-full px-5 text-[15px] font-medium text-ink-muted ring-1 ring-white/10 transition-[background-color,color,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.05] hover:text-ink aria-pressed:bg-gradient-to-r aria-pressed:from-holo/[0.28] aria-pressed:via-holo/[0.1] aria-pressed:to-white/[0.04] aria-pressed:text-ink aria-pressed:ring-holo/30"
                >
                  {filter === f && <Check size={14} className="shrink-0 text-holo" aria-hidden />}
                  {r.filters[f]}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="skeleton h-24 rounded-[1.4rem]" aria-label={t.mindPage.loading} />
            ) : items.length === 0 ? (
              <p className="rounded-[1.4rem] px-5 py-10 text-center text-[15.5px] text-ink-muted ring-1 ring-white/[0.08] ring-inset">{r.empties[filter]}</p>
            ) : (
              <ul aria-label={r.listLabel} className="flex flex-col gap-2.5">
                {items.map((it) => (
                  <li key={it.id}>
                    <RecordRow item={it} />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-auto flex flex-col gap-1.5 pt-2 text-[14px] leading-snug text-ink-dim">
              <p className="flex items-start gap-1.5">
                <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
                {r.privacy}
              </p>
              <p className="flex items-start gap-1.5">
                <Database size={14} className="mt-0.5 shrink-0" aria-hidden />
                {r.storage}
              </p>
            </div>
          </>
        )}
      </div>
    </GlassDialog>
  )
}

/** Tarih ve saat görev saat diliminde: "13 Kasım Cuma 01:30" */
function when(ts: number, locale: string) {
  return `${missionDate(civilDate(ts, CHECKIN_CONFIG.timeZone), locale)} ${missionTime(ts, locale)}`
}

function RecordRow({ item }: { item: RecordItem }) {
  const { t, locale } = useI18n()
  const { astronaut, mutate } = useHealth()
  const r = t.mindPage.recordsSheet
  const f = t.mindPage.form
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)
  const detailsId = useId()
  const titleId = useId()
  const remove = async (id: string) => {
    if (!astronaut) return
    try {
      await mutate('removeJournal', astronaut, id)
    } catch {
      setRemoveFailed(true)
      setConfirming(false)
    }
  }

  if (item.kind === 'journal') {
    return (
      <article aria-labelledby={titleId} data-record="journal" className="rounded-[1.4rem] bg-white/[0.025] px-5 py-4 ring-1 ring-white/[0.08]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 id={titleId} className="flex items-center gap-1.5 text-[15.5px] font-medium text-ink">
              <BookHeart size={15} className="text-holo" aria-hidden />
              {r.typeJournal}
            </h4>
            <p className="mt-0.5 text-[14.5px] text-ink-muted">
              {r.missionDate(missionDate(item.date, locale))} · {r.recordedAt(when(item.at, locale))}
            </p>
          </div>
          {/* Silme onay ister (HCI-03): yanlışlıkla basılınca not kaybolmaz */}
          {!confirming && (
            <button
              type="button"
              onClick={() => {
                setRemoveFailed(false)
                setConfirming(true)
              }}
              aria-label={t.journal.remove}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-transparent text-ink-muted transition-colors hover:border-line hover:text-ink"
            >
              <Trash2 size={15} aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-2 text-[15.5px] leading-relaxed whitespace-pre-line text-ink">{item.doc.text}</p>
        {confirming && (
          <div role="alertdialog" aria-label={t.journal.remove} aria-describedby={`${titleId}-confirm`} className="mt-3 flex flex-col gap-2 rounded-[1.1rem] border border-line p-3">
            <p id={`${titleId}-confirm`} className="text-[15px] text-ink">
              {t.journal.confirmRemove}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex min-h-10 items-center rounded-full border border-line px-3.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {t.journal.cancel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => void remove(item.doc.id)}
                className="flex min-h-10 items-center gap-1.5 rounded-full border border-crit/50 px-3.5 text-[14.5px] font-medium text-crit transition-colors hover:bg-crit/10"
              >
                <Trash2 size={14} aria-hidden />
                {t.journal.confirm}
              </button>
            </div>
          </div>
        )}
        {removeFailed && (
          <p role="alert" className="mt-2 text-[14.5px] text-ink">
            {t.journal.removeFailed}
          </p>
        )}
      </article>
    )
  }

  const v = item.view
  const rec = v.record
  const total = CHECKIN_CONFIG.questions.length
  return (
    <article aria-labelledby={titleId} data-record="checkin" data-window={v.window} data-outcome={v.outcome} className="rounded-[1.4rem] bg-white/[0.025] px-5 py-4 ring-1 ring-white/[0.08]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h4 id={titleId} className="flex items-center gap-1.5 text-[15.5px] font-medium text-ink">
          <CalendarCheck size={15} className="text-holo" aria-hidden />
          {r.typeCheckin} · {t.mindPage.windowName(v.window)}{' '}
          <span className="tabular font-mono text-[14px] font-normal text-ink-muted">{t.mindPage.range(missionTime(v.opensAt, locale), missionTime(v.closesAt, locale))}</span>
        </h4>
        <CheckinStatus view={v} />
      </div>
      <p className="mt-0.5 text-[14.5px] text-ink-muted">
        {r.missionDate(missionDate(v.date, locale))} · {rec ? r.recordedAt(when(rec.submittedAt, locale)) : r.closedAt(when(v.closesAt, locale))}
      </p>

      {rec?.outcome === 'saved' && (
        <>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[14.5px] text-ink">
            <li>{rec.answered < total ? r.partial(rec.answered, total) : r.complete(total)}</li>
            {rec.late && (
              <li className="flex items-center gap-1.5">
                <Clock size={13} className="text-holo" aria-hidden />
                {r.late}
              </li>
            )}
            {rec.revision > 1 && <li className="text-ink-muted">{r.revised(rec.revision - 1)}</li>}
          </ul>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={detailsId}
            className="mt-2 flex min-h-9 items-center gap-1.5 rounded-full border border-line px-2.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink aria-expanded:border-holo/50 aria-expanded:text-ink"
          >
            {open ? r.hideDetails : r.details}
          </button>
          {open && (
            <div id={detailsId} className="mt-2">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
                {CHECKIN_CONFIG.questions.map((q) => {
                  const a = rec.answers[q.id] ?? null
                  const text = f.questions[q.id]
                  return (
                    <div key={q.id} className="contents" data-question={q.id}>
                      <dt className="text-ink-muted">{text?.label ?? q.id}</dt>
                      {/* Yanıtlanmayan soru nötr ya da iyi sayılmaz; açıkça "Yanıtlanmadı" yazılır */}
                      <dd className={a === null ? 'text-ink-muted italic' : 'text-ink'}>{a === null ? f.omitted : (text?.options[a] ?? a)}</dd>
                    </div>
                  )
                })}
              </dl>
              {rec.note && (
                <div className="mt-2">
                  <p className="text-[14.5px] text-ink-muted">{r.note}</p>
                  <p className="text-[15.5px] leading-relaxed whitespace-pre-line text-ink">{rec.note}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}

import { ChevronRight, History, MessageSquareHeart } from 'lucide-react'
import { bodyPart } from '../core/coach'
import type { ComplaintDoc } from '../core/model'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { ALERT_META } from '../lib/status'

/*
 * Şikayet ve uyarı geçmişi (sağlık kayıtları sayfası).
 * - Üstte üç sayı: etkin uyarı, süren şikayet, geçen şikayet.
 * - Şu anki uyarılar: şikayetten doğan uyarılar burada tekrar edilmez (aşağıdaki şikayet satırlarında zaten görünür).
 * - Son şikayetler: kompakt satırlar (şiddet, bölge, zaman, durum); astronot satırdan "Azalıyor" ya da "Geçti" diyebilir.
 * - Hiç şikayet yoksa nasıl bildirileceği anlatılır ve hologramda rahatsızlık bildirme açılabilir.
 * Tepki testi Zihinsel sağlık sayfasındaki "Kendini tanı" bölümündedir.
 */
const RECENT = 5

export function HistoryCard({ onOpenHistory, onReport }: { onOpenHistory: () => void; onReport?: () => void }) {
  const { t, lang } = useI18n()
  const { astronaut, snapshot, canEdit } = useHealth()
  const complaints = useQuery('complaints', astronaut ? [astronaut] : null)
  const h = t.doctor.history
  const findings = snapshot?.findings ?? []
  // Şikayetten doğan uyarılar (anahtarı "complaint:" ile başlar) şikayet satırlarında görünür
  const alerts = findings.filter((f) => !f.key.startsWith('complaint:'))
  const fromComplaints = findings.length - alerts.length
  const ongoing = complaints?.filter((c) => c.status !== 'resolved').length ?? 0
  const resolved = complaints?.filter((c) => c.status === 'resolved').length ?? 0
  const recent = complaints?.slice(0, RECENT) ?? []

  return (
    <section id="tour-history" aria-labelledby="history-title" className="panel @container flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="history-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <History size={17} className="text-holo" aria-hidden />
          {t.doctor.historyTitle}
        </h2>
        <button type="button" onClick={onOpenHistory} className="flex min-h-9 items-center gap-1 rounded-lg border border-line px-3 text-[14px] text-ink-muted hover:border-holo/40 hover:text-holo">
          {t.doctor.openHistory}
          <ChevronRight size={15} aria-hidden />
        </button>
      </header>

      {/* Özet: üç sayı */}
      <dl className="grid grid-cols-3 gap-2">
        <Stat label={h.statAlerts} value={snapshot ? alerts.length + fromComplaints : null} tone={findings.some((f) => f.level === 'kritik') ? 'text-crit' : findings.some((f) => f.level === 'dikkat') ? 'text-warn' : 'text-ink'} />
        <Stat label={h.statOngoing} value={complaints ? ongoing : null} tone={ongoing ? 'text-warn' : 'text-ink'} />
        <Stat label={h.statResolved} value={complaints ? resolved : null} tone={resolved ? 'text-ok' : 'text-ink'} />
      </dl>

      <div data-wheel-scroll className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div>
          <p className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.doctor.currentAlerts}</p>
          <ul className="mt-1.5 space-y-1.5">
            {snapshot && alerts.length === 0 && <li className="text-[14px] text-ink-dim">{fromComplaints ? h.onlyComplaintAlerts : t.doctor.none}</li>}
            {alerts.map((f) => {
              const m = ALERT_META[f.level]
              const Icon = m.icon
              return (
                <li key={f.key} className="flex items-start gap-2 text-[14.5px] text-ink">
                  <Icon size={14} className={`mt-0.5 shrink-0 ${m.text}`} aria-hidden />
                  {resolve(f.title, lang)}
                </li>
              )
            })}
            {alerts.length > 0 && fromComplaints > 0 && <li className="text-[13.5px] text-ink-dim">{h.complaintAlertsBelow(fromComplaints)}</li>}
          </ul>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{h.recent}</p>
          {complaints && complaints.length === 0 ? (
            <Empty canEdit={canEdit} onReport={onReport} />
          ) : (
            <ul className="mt-1.5 space-y-2">
              {recent.map((c) => (
                <ComplaintRow key={c.id} c={c} />
              ))}
              {complaints && complaints.length > RECENT && (
                <li>
                  <button type="button" onClick={onOpenHistory} className="min-h-8 text-[14px] text-holo hover:underline">
                    {h.more(complaints.length - RECENT)}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-xl border border-line bg-white/[0.02] px-3 py-1.5">
      <dt className="truncate text-[13px] leading-tight text-ink-dim">{label}</dt>
      <dd className={`tabular font-mono text-[20px] leading-none font-semibold ${tone}`}>{value ?? '—'}</dd>
    </div>
  )
}

const STATUS_STYLE: Record<ComplaintDoc['status'], string> = {
  active: 'bg-warn/12 text-warn',
  improving: 'bg-holo/12 text-holo',
  resolved: 'bg-ok/12 text-ok',
}

/** Kompakt şikayet satırı: şiddet rozeti, belirti ve bölge, zaman ve kaynak, durum; astronot için hızlı güncelleme */
function ComplaintRow({ c }: { c: ComplaintDoc }) {
  const { t, lang, locale } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const s = t.complaintSave
  const date = new Date(c.ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const sev = c.severity >= 8 ? 'bg-crit/15 text-crit ring-crit/35' : c.severity >= 5 ? 'bg-warn/15 text-warn ring-warn/35' : 'bg-holo/12 text-holo ring-holo/30'
  const title = `${t.hologram.symptoms[c.symptom]} · ${resolve(bodyPart(c.region, c.side), lang)}`
  return (
    <li data-complaint={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
      <span className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-xl ring-1 ${c.status === 'resolved' ? 'bg-white/[0.04] text-ink-dim ring-line' : sev}`} aria-label={`${s.severity}: ${s.severityValue(c.severity)}`}>
        <span className="tabular font-mono text-[17px] leading-none font-semibold">{c.severity}</span>
        <span className="text-[10.5px] leading-none opacity-70">/10</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
        <p className="truncate text-[13px] text-ink-dim">
          {date} · {s.origin[c.origin]}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${STATUS_STYLE[c.status]}`}>{s.status[c.status]}</span>
        {canEdit && astronaut && c.status !== 'resolved' && (
          <div className="flex gap-1">
            {c.status === 'active' && (
              <button
                type="button"
                onClick={() => void mutate('updateComplaint', astronaut, c.id, { status: 'improving', severity: Math.max(1, c.severity - 2) })}
                aria-label={`${title}: ${s.markImproving}`}
                className="min-h-7 rounded-md border border-line-strong px-2 text-[12.5px] text-ink hover:border-holo/40"
              >
                {s.markImproving}
              </button>
            )}
            <button
              type="button"
              onClick={() => void mutate('updateComplaint', astronaut, c.id, { status: 'resolved', severity: 0 })}
              aria-label={`${title}: ${s.markResolved}`}
              className="min-h-7 rounded-md border border-ok/40 px-2 text-[12.5px] text-ok hover:bg-ok/10"
            >
              {s.status.resolved}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/** Hiç şikayet yokken: nasıl bildirileceği ve buradan ne takip edileceği */
function Empty({ canEdit, onReport }: { canEdit: boolean; onReport?: () => void }) {
  const { t } = useI18n()
  const h = t.doctor.history
  return (
    <div className="mt-1.5 flex items-start gap-3 rounded-2xl border border-dashed border-line px-4 py-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">
        <MessageSquareHeart size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15.5px] font-semibold text-ink">{h.emptyTitle}</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-ink-muted">{h.emptyDesc}</p>
        {canEdit && onReport && (
          <button type="button" onClick={onReport} className="mt-2.5 flex min-h-9 items-center gap-2 rounded-xl bg-holo/10 px-3.5 text-[14px] font-medium text-holo ring-1 ring-holo/30 hover:bg-holo/15">
            {t.hologram.complaint}
          </button>
        )}
      </div>
    </div>
  )
}

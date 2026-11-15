import { History } from 'lucide-react'
import { bodyPart } from '../core/coach'
import type { ComplaintDoc } from '../core/model'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { Sheet } from './Sheet'

const STATUS_STYLE = {
  active: 'text-warn bg-warn/10',
  improving: 'text-holo bg-holo/10',
  resolved: 'text-ok bg-ok/10',
} as const

/** Şikayet geçmişi: kayıtlı bütün şikayetler, durumları ve güncellemeleri. Astronot şikayeti kapatabilir. */
export function ComplaintHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { astronaut } = useHealth()
  const list = useQuery('complaints', open && astronaut ? [astronaut] : null)
  return (
    <Sheet open={open} onClose={onClose} title={t.complaintSave.historyTitle} closeLabel={t.complaintSave.close} icon={<History size={19} aria-hidden />} id="complaint-history" width="w-[min(500px,100vw)]">
      {list && list.length === 0 && <p className="py-10 text-center text-sm text-ink-dim">{t.complaintSave.historyEmpty}</p>}
      <ComplaintList list={list ?? []} />
    </Sheet>
  )
}

export function ComplaintList({ list, compact = false }: { list: ComplaintDoc[]; compact?: boolean }) {
  const { t, lang, locale } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const date = (ts: number) => new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <ul className="space-y-2.5">
      {list.map((c) => {
        const last = c.updates[c.updates.length - 1]
        return (
          <li key={c.id} data-complaint={c.id} className="rounded-2xl border border-line p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-ink">
                  {t.hologram.symptoms[c.symptom]} · {resolve(bodyPart(c.region, c.side), lang)}
                </p>
                {/* Kas ya da kemik adları (bazı kas adlarında virgül olduğu için noktalı virgülle ayrılır) */}
                {!compact && c.muscles.length + (c.bones?.length ?? 0) > 0 && (
                  <p className="mt-0.5 text-[14px] leading-snug text-ink-muted">{[...c.muscles, ...(c.bones ?? [])].map((m) => resolve(m, lang)).join('; ')}</p>
                )}
                <p className="mt-0.5 text-[13.5px] text-ink-dim">
                  {date(c.ts)} · {t.complaintSave.origin[c.origin]}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13.5px] font-medium ${STATUS_STYLE[c.status]}`}>{t.complaintSave.status[c.status]}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                <div className={`h-full rounded-full ${c.severity >= 8 ? 'bg-crit' : c.severity >= 5 ? 'bg-warn' : 'bg-holo'}`} style={{ width: `${c.severity * 10}%` }} />
              </div>
              <span className="tabular font-mono text-[14px] text-ink">{t.complaintSave.severityValue(c.severity)}</span>
            </div>
            {c.note && !compact && <p className="mt-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[14.5px] text-ink-muted">{c.note}</p>}
            {last && <p className="mt-1.5 text-[13.5px] text-ink-dim">{t.complaintSave.updated(date(last.ts))}</p>}
            {canEdit && astronaut && c.status !== 'resolved' && (
              <div className="mt-2.5 flex gap-2">
                {c.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => void mutate('updateComplaint', astronaut, c.id, { status: 'improving', severity: Math.max(1, c.severity - 2) })}
                    className="min-h-8 rounded-lg border border-line-strong px-2.5 text-[14px] text-ink hover:border-holo/40"
                  >
                    {t.complaintSave.markImproving}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void mutate('updateComplaint', astronaut, c.id, { status: 'resolved', severity: 0 })}
                  className="min-h-8 rounded-lg border border-ok/40 px-2.5 text-[14px] text-ok hover:bg-ok/10"
                >
                  {t.complaintSave.markResolved}
                </button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

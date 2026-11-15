import { ArrowRight, CalendarDays } from 'lucide-react'
import { DAY, MISSION } from '../core/crew'
import type { CheckStatus, ScheduledCheck } from '../core/tasks'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { Sheet } from './Sheet'

const STATUS_CLASS: Record<CheckStatus, string> = {
  overdue: 'border-warn/45 bg-warn/[0.08] text-warn',
  today: 'border-holo/45 bg-holo/10 text-holo',
  done: 'border-ok/40 bg-ok/[0.08] text-ok',
  upcoming: 'border-line text-ink-muted',
}

/**
 * Rutin kontrol takvimi (R-05): geçen haftanın kontrolleri (yapıldı ya da gecikti), bugün ve önümüzdeki iki hafta.
 * Geciken kontroller en üstte uyarı rengiyle gösterilir; satıra basınca kontrolün yapıldığı sayfaya gidilir.
 */
export function ScheduleSheet({ open, onClose, onGo }: { open: boolean; onClose: () => void; onGo: (page: number) => void }) {
  const { t, lang, locale } = useI18n()
  const { astronaut, snapshot } = useHealth()
  const list = useQuery('schedule', open && astronaut ? [astronaut] : null)
  const startOf = (day: number) => MISSION.start - (MISSION.start % DAY) + day * DAY
  const today = snapshot?.missionDay ?? 0
  const dayLabel = (day: number) => {
    const date = new Date(startOf(day)).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    if (day === today) return `${t.schedule.today} · ${date}`
    if (day === today + 1) return `${t.schedule.tomorrow} · ${date}`
    return date
  }
  const overdue = list?.filter((c) => c.status === 'overdue') ?? []
  const rest = list?.filter((c) => c.status !== 'overdue') ?? []
  const byDay = new Map<number, ScheduledCheck[]>()
  for (const c of rest) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c])

  const row = (c: ScheduledCheck) => (
    <li key={`${c.day}:${c.key}`} data-check={c.key} data-status={c.status}>
      <button
        type="button"
        onClick={() => {
          onGo(c.page)
          onClose()
        }}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.015] px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-medium text-ink">{resolve(c.title, lang)}</span>
          <span className="tabular block font-mono text-[13.5px] text-ink-dim">
            {t.schedule.missionDay(c.day)} · {c.due}
          </span>
        </span>
        <span className={`shrink-0 rounded-md border px-1.5 py-px text-[13px] font-semibold ${STATUS_CLASS[c.status]}`}>{t.schedule.status[c.status]}</span>
        <ArrowRight size={14} className="shrink-0 text-ink-dim" aria-hidden />
      </button>
    </li>
  )

  return (
    <Sheet open={open} onClose={onClose} title={t.schedule.title} subtitle={t.schedule.subtitle} closeLabel={t.schedule.close} icon={<CalendarDays size={18} />} id="schedule-sheet">
      {!list ? (
        <p className="text-sm text-ink-dim">{t.vital.loading}</p>
      ) : (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <section>
              <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-warn uppercase">{t.schedule.overdueTitle(overdue.length)}</h3>
              <ul className="mt-2 space-y-1.5">{overdue.map(row)}</ul>
            </section>
          )}
          {[...byDay.entries()].map(([day, checks]) => (
            <section key={day}>
              <h3 className={`text-[14.5px] font-medium ${day === today ? 'text-holo' : day < today ? 'text-ink-dim' : 'text-ink-muted'}`}>{dayLabel(day)}</h3>
              <ul className="mt-1.5 space-y-1.5">{checks.map(row)}</ul>
            </section>
          ))}
          <p className="text-[13.5px] leading-snug text-ink-dim">{t.schedule.note}</p>
        </div>
      )}
    </Sheet>
  )
}

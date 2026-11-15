import { Earth, ExternalLink, Radiation, ShieldAlert, Sun, Wind, Zap } from 'lucide-react'
import { openHazards } from '../lib/hazardsDialog'
import { CAREER_LIMIT_MSV } from '../core/catalog'
import { SOURCES } from '../core/sources'
import { num } from '../core/tx'
import { useHealth, useNasa } from '../data/health'
import { useI18n } from '../i18n'

interface DonkiData {
  retrieved: string
  live?: boolean
  sep: { id: string; time: string; link: string }[]
  flr: { id: string; time: string; classType: string; link: string }[]
  gst: { id: string; time: string; kp: number; link: string }[]
}

/**
 * Ortam ve radyasyon: toplam doz (NASA'nın 600 mSv kariyer sınırına göre), bugünkü doz, kabin CO₂ ve NASA DONKI'deki
 * gerçek uzay havası olayları (güneş parçacık olayları, güneş patlamaları, jeomanyetik fırtınalar).
 */
export function EnvironmentCard() {
  const { t, lang, locale } = useI18n()
  const { snapshot } = useHealth()
  const donki = useNasa<DonkiData>('donki')
  const pct = snapshot ? Math.min(100, snapshot.dose.percent) : 0
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const lastSep = donki?.sep.at(-1)
  const events = [
    ...(donki?.gst ?? []).map((g) => ({ id: g.id, time: g.time, link: g.link, icon: Earth, text: t.doctor.storm(num(g.kp, lang, 1)), strong: g.kp >= 7 })),
    ...(donki?.flr ?? []).filter((f) => /^[MX]/.test(f.classType)).map((f) => ({ id: f.id, time: f.time, link: f.link, icon: Sun, text: t.doctor.flare(f.classType), strong: f.classType.startsWith('X') })),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 6)

  return (
    <section id="tour-environment" aria-labelledby="env-title" className="panel flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 id="env-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <Radiation size={17} className="text-holo" aria-hidden />
          {t.doctor.envTitle}
        </h2>
        {/* NASA'nın 5 tehlikesi ve uygulamada izlenen göstergeler */}
        <button
          type="button"
          id="hazards-open"
          onClick={() => openHazards()}
          aria-haspopup="dialog"
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
        >
          <ShieldAlert size={14} aria-hidden />
          {t.hazards.open}
        </button>
      </header>
      {snapshot && (
        <div>
          <div className="flex items-baseline justify-between text-[14px]">
            <span className="text-ink-muted">{t.doctor.dose}</span>
            <span className="tabular font-mono text-ink">{t.doctor.doseOf(num(snapshot.dose.totalMsv, lang, 0))}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-holo/15" role="meter" aria-valuemin={0} aria-valuemax={CAREER_LIMIT_MSV} aria-valuenow={Math.round(snapshot.dose.totalMsv)} aria-label={t.doctor.dose}>
            <div className={`h-full rounded-full ${pct >= 80 ? 'bg-warn' : 'bg-holo'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-ink-dim">
            %{num(snapshot.dose.percent, lang, 1)} · {t.doctor.today(num(snapshot.dose.todayMsv, lang, 2))}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-muted">
            <Wind size={13} className="text-holo" aria-hidden />
            {t.doctor.co2}: {t.doctor.co2Line(num(snapshot.co2.latest, lang, 1), num(snapshot.co2.avg7, lang, 1))}
          </p>
        </div>
      )}
      {/* Olay listesi kalan yüksekliği doldurur ve kendi içinde kayar (alttaki kaynak satırının üstüne binmez) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="flex items-center justify-between gap-2 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">
          {t.doctor.spaceWeather}
          {donki && <span className={`normal-case tracking-normal ${donki.live ? 'text-ok' : 'text-ink-dim'}`}>{donki.live ? t.doctor.liveData : t.doctor.snapshotData(date(donki.retrieved))}</span>}
        </p>
        {lastSep && (
          <a href={lastSep.link} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1.5 text-[14px] text-ink hover:text-holo">
            <Zap size={13} className="text-warn" aria-hidden />
            {t.doctor.lastSep(date(lastSep.time))}
          </a>
        )}
        <ul data-wheel-scroll className="scroll-thin mt-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {events.map((e) => (
            <li key={e.id}>
              <a href={e.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-1 py-1 text-[14px] text-ink-muted hover:bg-white/[0.03] hover:text-ink">
                <e.icon size={13} className={e.strong ? 'text-warn' : 'text-holo'} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{e.text}</span>
                <span className="tabular shrink-0 font-mono text-[12.5px] text-ink-dim">{date(e.time)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <a href={SOURCES.donki.url} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[12.5px] text-ink-dim hover:text-holo">
        <ExternalLink size={11} aria-hidden />
        NASA CCMC DONKI · {SOURCES.tb020.title.split(': ')[1]}
      </a>
    </section>
  )
}

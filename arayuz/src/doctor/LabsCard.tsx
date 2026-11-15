import { FlaskConical, Hourglass } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SERIES_COLORS } from '../components/charts/TimeChart'
import { CREW } from '../core/crew'
import { ANALYTES } from '../core/labs'
import { SOURCES } from '../core/sources'
import { num } from '../core/tx'
import { useHealth, useNasa, useQuery } from '../data/health'
import { useAppCommand } from '../lib/appCommands'
import { resolve, useI18n } from '../i18n'

interface OsdrData {
  timepoints: string[]
  subjects: string[]
  analytes: { name: string; panel: string; unit: string; ranges: Record<string, [number | null, number | null]>; values: Record<string, Record<string, number>> }[]
}

/**
 * Kan tahlilleri: mürettebatın uçuş içi örnekleri (kurgusal, OSDR referans aralıklarıyla) ve NASA'nın açık verisindeki
 * Inspiration4 mürettebatının gerçek kan değerleri (OSD-569, OSD-575).
 */
export function LabsCard() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'ours' | 'nasa'>('ours')
  // Asistandan: NASA verisi ya da kendi örneklerimiz
  useAppCommand('openLabs', (c) => setTab(c.view === 'nasa' ? 'nasa' : 'ours'))
  return (
    <section id="tour-labs" aria-labelledby="labs-title" className="panel @container flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="labs-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <FlaskConical size={17} className="text-holo" aria-hidden />
          {t.doctor.labsTitle}
        </h2>
        <div role="tablist" aria-label={t.doctor.labsTitle} className="flex min-w-0 max-w-full rounded-xl border border-line p-1">
          {(['ours', 'nasa'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="min-h-8 min-w-0 rounded-lg px-2.5 py-1 text-[14px] leading-tight text-ink-muted aria-selected:bg-holo/12 aria-selected:text-holo">
              {k === 'ours' ? t.doctor.labsOurs : t.doctor.labsNasa}
            </button>
          ))}
        </div>
      </header>
      {tab === 'ours' ? <OurLabs /> : <NasaLabs />}
    </section>
  )
}

function OurLabs() {
  const { t, lang } = useI18n()
  const { astronaut } = useHealth()
  const draws = useQuery('labs', astronaut ? [astronaut] : null)
  const [pick, setPick] = useState<number | null>(null)
  const [mode, setMode] = useState<'single' | 'history'>('single')
  const list = draws ?? []
  // Asistandan: belirli bir örnek (görev günü) ya da bütün tahliller
  useAppCommand('openLabs', (c) => {
    if (c.view === 'nasa') return
    setMode(c.view === 'history' ? 'history' : 'single')
    if (c.day !== undefined) {
      const i = list.findIndex((d) => d.day === c.day)
      if (i >= 0) setPick(i)
    }
  })
  // Kart son analiz edilmiş örnekle açılır (en yeni örnek genelde dondurucuda analiz bekler)
  const lastAnalyzed = list.map((d) => d.analyzed).lastIndexOf(true)
  const shown = list[pick ?? (lastAnalyzed >= 0 ? lastAnalyzed : list.length - 1)]
  const sex = astronaut ? CREW[astronaut].sex : 'f'
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div role="group" aria-label={t.doctor.labsView} className="flex shrink-0 self-start rounded-xl border border-line p-1">
        {(['single', 'history'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className="min-h-8 rounded-lg px-2.5 text-[14px] whitespace-nowrap text-ink-muted aria-pressed:bg-holo/12 aria-pressed:text-holo">
            {m === 'single' ? t.doctor.labsSingle : t.doctor.labsHistory}
          </button>
        ))}
      </div>
      {mode === 'history' ? (
        <LabHistory draws={list} sex={sex} />
      ) : (
        <>
      <div role="group" aria-label={t.doctor.labsTitle} className="scroll-thin flex shrink-0 gap-1 overflow-x-auto pb-1">
        {list.map((d, i) => (
          <button key={d.day} type="button" aria-pressed={shown === d} onClick={() => setPick(i)} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-[13.5px] whitespace-nowrap text-ink-muted aria-pressed:border-holo/50 aria-pressed:bg-holo/12 aria-pressed:text-holo">
            {!d.analyzed && <Hourglass size={11} aria-hidden />}
            {t.doctor.draw(d.day)}
          </button>
        ))}
      </div>
      {shown && !shown.analyzed ? (
        <div className="space-y-2">
          <p className="flex items-start gap-2 rounded-xl border border-holo/30 bg-holo/[0.05] p-3 text-[14.5px] text-ink">
            <Hourglass size={15} className="mt-0.5 shrink-0 text-holo" aria-hidden />
            {t.doctor.pending}. {t.doctor.labsNote}
          </p>
          {lastAnalyzed >= 0 && (
            <button type="button" onClick={() => setPick(lastAnalyzed)} className="min-h-9 rounded-xl border border-line px-3 text-[14px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo">
              {t.doctor.labsShowLast(list[lastAnalyzed].day)}
            </button>
          )}
        </div>
      ) : (
        <div data-wheel-scroll className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-ink-dim">
                <th className="py-1 font-normal">{t.doctor.analyte}</th>
                <th className="py-1 text-right font-normal">{t.doctor.result}</th>
                <th className="py-1 pl-3 text-right font-normal">{t.doctor.range}</th>
              </tr>
            </thead>
            <tbody>
              {shown?.results.map((r) => {
                const a = ANALYTES.find((x) => x.key === r.key)!
                const [lo, hi] = sex === 'f' ? a.range.f : a.range.m
                return (
                  <tr key={r.key} data-flag={r.flag} className="border-t border-line">
                    <td className="py-1.5 text-ink">{resolve(a.name, lang)}</td>
                    <td className={`tabular py-1.5 text-right font-mono ${r.flag === 'normal' ? 'text-ink' : 'font-semibold text-warn'}`}>
                      {num(r.value, lang, a.digits)} {r.flag !== 'normal' && <span className="ml-1 font-sans text-[12.5px]">{t.doctor.flag[r.flag]}</span>}
                    </td>
                    <td className="tabular py-1.5 pl-3 text-right font-mono text-ink-dim">
                      {num(lo, lang, a.digits)}–{num(hi, lang, a.digits)} {a.unit}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
      <p className="shrink-0 text-[12.5px] leading-snug text-ink-dim">
        {t.doctor.labsSim}{' '}
        <a href={SOURCES.osd575.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-holo">
          OSD-575
        </a>
        {' · '}
        <a href={SOURCES.osd569.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-holo">
          OSD-569
        </a>
      </p>
    </div>
  )
}

/** Geçmiş tahliller: her testin bütün örneklerdeki değeri yan yana; aralık dışındakiler işaretli, analiz bekleyen örnek kum saatiyle */
function LabHistory({ draws, sex }: { draws: { day: number; analyzed: boolean; results: { key: string; value: number; flag: 'normal' | 'low' | 'high' }[] }[]; sex: 'f' | 'm' }) {
  const { t, lang } = useI18n()
  return (
    <div data-wheel-scroll data-lab-history className="scroll-thin min-h-0 flex-1 overflow-auto">
      <table className="w-full text-[13px] @max-[24rem]:text-[12.5px]">
        <thead className="sticky top-0 bg-surface/95 backdrop-blur">
          <tr className="text-left text-ink-dim">
            <th className="py-1 pr-2 font-normal">{t.doctor.analyte}</th>
            {draws.map((d) => (
              <th key={d.day} className="py-1 pl-1.5 text-right font-normal whitespace-nowrap">
                {d.analyzed ? <span title={t.doctor.draw(d.day)}>{t.doctor.drawShort(d.day)}</span> : <span title={`${t.doctor.draw(d.day)} · ${t.doctor.pending}`}>⌛ {t.doctor.drawShort(d.day)}</span>}
              </th>
            ))}
            {/* Dar kartta referans sütunu gizlenir (Tek örnek görünümünde referanslar yazılı) */}
            <th className="hidden py-1 pl-2 text-right font-normal @min-[30rem]:table-cell">{t.doctor.range}</th>
          </tr>
        </thead>
        <tbody>
          {ANALYTES.map((a) => {
            const [lo, hi] = sex === 'f' ? a.range.f : a.range.m
            return (
              <tr key={a.key} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink">
                  {resolve(a.name, lang)}
                  <span className="block text-[12px] leading-tight text-ink-dim">{a.unit}</span>
                </td>
                {draws.map((d) => {
                  const r = d.results.find((x) => x.key === a.key)
                  if (!d.analyzed || !r) return <td key={d.day} className="py-1.5 pl-1.5 text-right text-ink-dim">—</td>
                  return (
                    <td key={d.day} data-flag={r.flag} className={`tabular py-1.5 pl-1.5 text-right font-mono ${r.flag === 'normal' ? 'text-ink-muted' : 'font-semibold text-warn'}`}>
                      {num(r.value, lang, a.digits)}
                      {r.flag !== 'normal' && <span className="sr-only"> {t.doctor.flag[r.flag]}</span>}
                    </td>
                  )
                })}
                <td className="tabular hidden py-1.5 pl-2 text-right font-mono text-ink-dim @min-[30rem]:table-cell">
                  {num(lo, lang, a.digits)}–{num(hi, lang, a.digits)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Gerçek NASA verisi: Inspiration4 mürettebatının uçuş öncesi ve sonrası değerleri (zaman noktalarına göre çizgi grafik) */
function NasaLabs() {
  const { t, lang } = useI18n()
  const data = useNasa<OsdrData>('osdr-blood')
  const [key, setKey] = useState('HEMOGLOBIN')
  const a = data?.analytes.find((x) => x.name === key)
  const tps = data?.timepoints ?? []
  const local = ANALYTES.find((x) => x.key === key)
  const label = local ? resolve(local.name, lang) : key
  const geo = useMemo(() => {
    if (!a) return null
    const vals = Object.values(a.values).flatMap((v) => Object.values(v))
    const r = a.ranges.M ?? a.ranges.F
    const lo = Math.min(...vals, r?.[0] ?? Infinity)
    const hi = Math.max(...vals, r?.[1] ?? -Infinity)
    return { lo: lo - (hi - lo) * 0.1, hi: hi + (hi - lo) * 0.1, ref: r }
  }, [a])
  const W = 420
  const H = 150
  const pad = { l: 40, r: 10, t: 8, b: 22 }
  const x = (i: number) => pad.l + (i / Math.max(1, tps.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => (geo ? pad.t + (1 - (v - geo.lo) / (geo.hi - geo.lo)) * (H - pad.t - pad.b) : 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="shrink-0 text-[13.5px] leading-snug text-ink-muted">{t.doctor.nasaIntro}</p>
      <label className="flex shrink-0 items-center gap-2 text-[14px] text-ink-dim">
        {t.doctor.nasaPick}
        <select value={key} onChange={(e) => setKey(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 text-[14px] text-ink">
          {ANALYTES.map((x) => (
            <option key={x.key} value={x.key}>
              {resolve(x.name, lang)} ({x.unit})
            </option>
          ))}
        </select>
      </label>
      {a && geo && (
        <svg viewBox={`0 0 ${W} ${H}`} className="min-h-0 w-full flex-1" role="img" aria-label={t.doctor.nasaChart(label)}>
          {geo.ref?.[0] !== null && geo.ref?.[1] !== null && geo.ref && (
            <rect x={pad.l} width={W - pad.l - pad.r} y={y(geo.ref[1]!)} height={Math.max(0, y(geo.ref[0]!) - y(geo.ref[1]!))} fill="rgb(94 227 154 / 0.07)" />
          )}
          {[geo.lo, (geo.lo + geo.hi) / 2, geo.hi].map((v) => (
            <text key={v} x={pad.l - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-ink-dim font-mono text-[11.5px]">
              {num(v, lang, local?.digits ?? 1)}
            </text>
          ))}
          {/* Fırlatma ile dönüş arası */}
          <line x1={(x(2) + x(3)) / 2} x2={(x(2) + x(3)) / 2} y1={pad.t} y2={H - pad.b} stroke="rgb(232 240 247 / 0.25)" strokeDasharray="3 3" />
          {tps.map((tp, i) => (
            <text key={tp} x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-dim font-mono text-[11.5px]">
              {tp}
            </text>
          ))}
          {(data?.subjects ?? []).map((s, si) => {
            const pts = tps.map((tp, i) => (a.values[s]?.[tp] !== undefined ? [x(i), y(a.values[s][tp])] : null)).filter(Boolean) as number[][]
            const color = SERIES_COLORS[si % SERIES_COLORS.length]
            return (
              <g key={s}>
                <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {pts.map((p) => (
                  <circle key={p.join()} cx={p[0]} cy={p[1]} r={3.5} fill={color} stroke="var(--color-raised)" strokeWidth={1.5} />
                ))}
              </g>
            )
          })}
        </svg>
      )}
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">
        {(data?.subjects ?? []).map((s, si) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} aria-hidden />
            {t.doctor.subject(s)}
          </span>
        ))}
      </div>
      <p className="shrink-0 text-[12.5px] text-ink-dim">
        {t.doctor.timepoints} · NASA OSDR{' '}
        <a href={local?.panel === 'CBC' ? SOURCES.osd569.url : SOURCES.osd575.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-holo">
          {local?.panel === 'CBC' ? 'OSD-569' : 'OSD-575'}
        </a>
      </p>
    </div>
  )
}

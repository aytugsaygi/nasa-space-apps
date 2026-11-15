import { Dumbbell, LineChart, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TimeChart } from '../components/charts/TimeChart'
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '../core/catalog'
import { DAY, MISSION } from '../core/crew'
import { num } from '../core/tx'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { originCounts } from '../lib/dataSource'
import { clearExplorerFocus, useExplorerFocus } from '../lib/explorerFocus'
import { INDICATOR_ICONS } from '../lib/icons'
import { openImport } from '../lib/importDialog'
import { Tooltip } from '../components/Tooltip'

type Period = 'day' | 'week' | 'month' | 'mission' | 'custom'
const toInput = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Gösterge gezgini: istenen göstergenin istenen zaman aralığındaki grafiği. Gün, hafta, ay ve görev düğmeleri hazırdır;
 * kullanıcı kendi tarih aralığını da girebilir. En düşük, en yüksek ve ortalama birlikte verilir (V-08).
 */
export function ExplorerCard() {
  const { t, lang, locale } = useI18n()
  const { astronaut, snapshot } = useHealth()
  /* Grafik kartın kalan yüksekliğini doldurur (sabit yükseklikte kartın altı boş kalıyordu) */
  const chartBox = useRef<HTMLDivElement>(null)
  const [chartH, setChartH] = useState(220)
  useEffect(() => {
    const el = chartBox.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setChartH(Math.max(160, Math.floor(e.contentRect.height))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [id, setId] = useState<IndicatorId>('hr')
  const [period, setPeriod] = useState<Period>('week')
  /*
   * Ana sayfadaki mini grafikten gelen istek: gezgin o göstergeye ve aralığa geçer (çizim sırasında, istek bir kez işlenir),
   * kart görünür alana kaydırılır ve kısa bir süre parlar.
   */
  const now = snapshot?.now ?? Date.now()
  const [custom, setCustom] = useState({ from: toInput(now - 14 * DAY), to: toInput(now) })
  const focus = useExplorerFocus()
  const [seen, setSeen] = useState<number | null>(null)
  if (focus && focus.nonce !== seen) {
    setSeen(focus.nonce)
    setId(focus.id)
    setPeriod(focus.period)
    // İçe aktarmadan sonra: verinin kapsadığı günler
    if (focus.range) setCustom({ from: toInput(focus.range[0]), to: toInput(focus.range[1]) })
  }
  const section = useRef<HTMLElement>(null)
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (!focus) return
    const nonce = focus.nonce
    // Sayfa kayması bittikten sonra kart görünür alana getirilir
    const timer = setTimeout(() => {
      section.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setFlash(nonce)
      clearExplorerFocus(nonce)
    }, 560)
    return () => clearTimeout(timer)
  }, [focus])
  const minute = Math.floor(now / 60_000)
  const range = useMemo((): [number, number] => {
    const end = minute * 60_000
    if (period === 'day') return [end - DAY, end]
    if (period === 'week') return [end - 7 * DAY, end]
    if (period === 'month') return [end - 30 * DAY, end]
    if (period === 'mission') return [MISSION.start, end]
    return [Math.max(MISSION.start, Date.parse(custom.from)), Math.min(end, Date.parse(custom.to) + DAY - 1)]
  }, [period, custom, minute])
  const data = useQuery('series', astronaut ? [astronaut, id, range[0], range[1]] : null)
  const ind = INDICATORS[id]
  const unit = resolve(ind.unit, lang)
  const series = useMemo(() => {
    const pts = data?.points ?? []
    if (id === 'bp')
      return [
        { key: 'sys', label: t.drawer.systolic, points: pts.map((p) => ({ t: p.t, v: p.v })) },
        { key: 'dia', label: t.drawer.diastolic, band: [60, 80] as [number, number], points: pts.filter((p) => p.v2 !== undefined).map((p) => ({ t: p.t, v: p.v2! })) },
      ]
    return [{ key: id, label: resolve(ind.name, lang), points: pts.map((p) => ({ t: p.t, v: p.v })) }]
  }, [data, id, ind.name, lang, t])

  return (
    <section ref={section} id="tour-explorer" aria-labelledby="explorer-title" className="panel relative flex size-full min-h-0 flex-col gap-3 overflow-hidden !rounded-3xl p-5">
      {flash > 0 && <span key={flash} className="explorer-flash pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />}
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="explorer-title" className="flex items-center gap-2 font-display text-[18px] font-semibold">
          <LineChart size={17} className="text-holo" aria-hidden />
          {t.doctor.explorerTitle}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-ink-dim">{t.doctor.explorerSub}</span>
          <Tooltip label={t.importer.openTip}>
            <button
              type="button"
              id="explorer-import"
              onClick={openImport}
              className="flex min-h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[13.5px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
            >
              <Upload size={13} aria-hidden />
              {t.importer.open}
            </button>
          </Tooltip>
        </div>
      </header>
      {/* Spor ayrı bir yer olarak başta durur (spor koçunun halkası buraya getirir); ardından diğer göstergeler */}
      <div role="group" aria-label={t.doctor.explorerTitle} className="scroll-thin flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          data-explore="exercise"
          data-explore-sport
          aria-pressed={id === 'exercise'}
          onClick={() => setId('exercise')}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line px-2.5 text-[14px] whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-pressed:border-holo/50 aria-pressed:bg-holo/12 aria-pressed:text-holo font-semibold"
        >
          <Dumbbell size={13} aria-hidden />
          {t.sport.explorerSport}
        </button>
        <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden />
        {INDICATOR_IDS.filter((i) => i !== 'exercise').map((i) => {
          const Icon = INDICATOR_ICONS[i]
          return (
            <button
              key={i}
              type="button"
              data-explore={i}
              aria-pressed={id === i}
              onClick={() => setId(i)}
              className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-line px-2.5 text-[14px] whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-pressed:border-holo/50 aria-pressed:bg-holo/12 aria-pressed:text-holo"
            >
              <Icon size={13} aria-hidden />
              {resolve(INDICATORS[i].name, lang)}
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label={t.drawer.periods.custom} className="flex rounded-xl border border-line p-1">
          {(['day', 'week', 'month', 'mission', 'custom'] as Period[]).map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className="min-h-8 rounded-lg px-2.5 text-[14px] whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-pressed:bg-holo/12 aria-pressed:text-holo">
              {t.drawer.periods[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-1.5 text-[14px] text-ink-dim">
            <input type="date" aria-label={t.drawer.from} value={custom.from} min={toInput(MISSION.start)} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-9 rounded-lg border border-line bg-base px-2 text-[14px] text-ink" />
            –
            <input type="date" aria-label={t.drawer.to} value={custom.to} min={custom.from} max={toInput(now)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-9 rounded-lg border border-line bg-base px-2 text-[14px] text-ink" />
          </div>
        )}
        {id === 'exercise' && data ? (
          <SportSummary points={data.points} target={ind.target ?? 120} goal={ind.band?.[0] ?? 100} today={Math.floor(now / DAY) * DAY} />
        ) : data?.stats && (
          <p className="tabular ml-auto font-mono text-[13.5px] text-ink-muted">
            {t.drawer.stats.min} {num(data.stats.min, lang, ind.digits)} · {t.drawer.stats.avg} {num(data.stats.avg, lang, ind.digits)} · {t.drawer.stats.max} {num(data.stats.max, lang, ind.digits)} {unit}
          </p>
        )}
      </div>
      <div ref={chartBox} className="min-h-40 flex-1 overflow-hidden">
        <TimeChart
          series={series}
          band={ind.band}
          axis={ind.axis}
          unit={unit}
          digits={ind.digits}
          kind={id === 'water' || id === 'exercise' || id === 'sleep' ? 'bar' : 'line'}
          height={chartH - (series.length > 1 ? 30 : 0)}
          label={t.drawer.chartLabel(resolve(ind.name, lang), t.drawer.periods[period])}
          from={range[0]}
          to={range[1]}
        />
      </div>
      {/* Referans ve verinin kaynağı (VM-04) */}
      <p className="shrink-0 text-[13.5px] text-ink-dim">
        {t.doctor.colRef}: {resolve(ind.range, lang)}
        {data && data.points.length > 0 && (
          <>
            {' · '}
            {t.drawer.composition}:{' '}
            {Object.entries(originCounts(data.points))
              .map(([o, c]) => `${c.toLocaleString(locale)} ${t.drawer.origins[o as keyof typeof t.drawer.origins]}`)
              .join(' · ')}
          </>
        )}
      </p>
    </section>
  )
}

/**
 * Spor özeti (gezginde Spor seçiliyken): günlük hedef, hedefe ulaşılan gün sayısı, toplam ve günlük ortalama süre.
 * Hedef bandının alt sınırına ulaşan gün "hedefe ulaşıldı" sayılır; henüz bitmemiş bugün bu sayıma girmez.
 */
function SportSummary({ points, target, goal, today }: { points: { t: number; v: number }[]; target: number; goal: number; today: number }) {
  const { t, lang } = useI18n()
  const s = t.sport.sportSummary
  const total = points.reduce((n, p) => n + p.v, 0)
  const past = points.filter((p) => p.t < today)
  const met = past.filter((p) => p.v >= goal).length
  return (
    <p data-sport-summary className="tabular ml-auto flex flex-wrap gap-x-3 gap-y-1 font-mono text-[13.5px] text-ink-muted">
      <span>{s.target(target)}</span>
      <span className={met === past.length && past.length > 0 ? 'text-ok' : undefined}>{s.met(met, past.length)}</span>
      <span>{s.total(num(total, lang, 0))}</span>
      <span>{s.avg(num(points.length ? total / points.length : 0, lang, 0))}</span>
    </p>
  )
}

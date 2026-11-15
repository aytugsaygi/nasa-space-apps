import { originCounts, originOf, sourceLabel } from '../lib/dataSource'
import { ExternalLink, Plus, ShieldAlert } from 'lucide-react'
import { hazardsFor } from '../core/hazards'
import { openHazards } from '../lib/hazardsDialog'
import { useMemo, useState, type FormEvent } from 'react'
import { INDICATORS, type Band, type IndicatorId } from '../core/catalog'
import { DAY, MISSION } from '../core/crew'
import { SOURCES } from '../core/sources'
import { NasaBadge } from './NasaBadge'
import { num } from '../core/tx'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { INDICATOR_ICONS } from '../lib/icons'
import { STATUS_META } from '../lib/status'
import { TimeChart } from './charts/TimeChart'
import { Sheet } from './Sheet'
import { formatValue } from './VitalCard'

type Period = 'day' | 'week' | 'month' | 'mission' | 'custom'

const toInput = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Bir göstergenin ayrıntısı: seçilen zaman aralığında grafik (gün, hafta, ay, görev ya da özel aralık), en düşük /
 * en yüksek / ortalama, referans aralığı ve eşikler (dayanaklarıyla), uzaydaki önemi, kaynaklar ve elle ölçüm girişi.
 */
export function IndicatorDrawer({ id, onClose }: { id: IndicatorId | null; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={!!id} onClose={onClose} title={id ? <DrawerTitle id={id} /> : ''} closeLabel={t.drawer.close} id="indicator-drawer" icon={id ? <DrawerIcon id={id} /> : null}>
      {id && <DrawerBody id={id} />}
    </Sheet>
  )
}

function DrawerIcon({ id }: { id: IndicatorId }) {
  const Icon = INDICATOR_ICONS[id]
  return <Icon size={19} aria-hidden />
}

function DrawerTitle({ id }: { id: IndicatorId }) {
  const { lang } = useI18n()
  return <>{resolve(INDICATORS[id].name, lang)}</>
}

function DrawerBody({ id }: { id: IndicatorId }) {
  const { t, lang, locale } = useI18n()
  const { astronaut, snapshot, canEdit, mutate } = useHealth()
  const ind = INDICATORS[id]
  const [period, setPeriod] = useState<Period>(ind.cadence === 'live' || ind.cadence === 'hourly' ? 'day' : 'month')
  const now = snapshot?.now ?? Date.now()
  const [custom, setCustom] = useState({ from: toInput(now - 14 * DAY), to: toInput(now) })
  const [applied, setApplied] = useState(custom)

  const range = useMemo((): [number, number] => {
    const end = Math.ceil(now / 60_000) * 60_000
    if (period === 'day') return [end - DAY, end]
    if (period === 'week') return [end - 7 * DAY, end]
    if (period === 'month') return [end - 30 * DAY, end]
    if (period === 'mission') return [MISSION.start, end]
    const from = Date.parse(applied.from)
    const to = Date.parse(applied.to) + DAY - 1
    return [Math.max(MISSION.start, from), Math.min(end, to)]
    // now dakikada bir değişir; grafik her saniye yeniden istenmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, applied, Math.floor(now / 60_000)])

  const data = useQuery('series', astronaut ? [astronaut, id, range[0], range[1]] : null)
  const state = snapshot?.indicators[id]
  const st = STATUS_META[state?.status ?? 'normal']
  const StIcon = st.icon
  const unit = resolve(ind.unit, lang)
  const fmt = (v: number) => num(v, lang, ind.digits)
  const periodLabel = t.drawer.periods[period]
  /** Tansiyonda küçük tansiyonun istatistikleri de gösterilir (118/76 gibi) */
  const stats2 = useMemo(() => {
    const v = (data?.points ?? []).flatMap((p) => (p.v2 === undefined ? [] : [p.v2]))
    if (!v.length) return null
    return { min: Math.min(...v), max: Math.max(...v), avg: v.reduce((a, b) => a + b, 0) / v.length }
  }, [data])

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
    <div className="space-y-6">
      {/* Anlık değer */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="leading-none">
          <span className="tabular font-mono text-[34px] font-medium tracking-tight">{state ? formatValue(id, state, lang) : '—'}</span>
          <span className="ml-2 text-[15.5px] text-ink-dim">{unit}</span>
        </p>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[14.5px] font-medium ${st.text} ${st.bg}`}>
          <StIcon size={14} aria-hidden />
          {t.status[state?.status ?? 'normal']}
          {/* Etiket durumdan farklıysa ("Dinlenme için yüksek" gibi) eklenir; "Normal · Normal" yazılmaz */}
          {state && resolve(state.label, lang) !== t.status[state.status] ? ` · ${resolve(state.label, lang)}` : ''}
        </span>
      </div>
      {state?.baseline !== undefined && (
        <p className="-mt-4 text-[14.5px] text-ink-muted">
          {t.vital.baseline(state.baseline2 !== undefined ? `${fmt(state.baseline)}/${fmt(state.baseline2)} ${unit}` : `${fmt(state.baseline)} ${unit}`)}
        </p>
      )}
      {/* VM-04: değerin simülasyon mu, elle giriş mi, içe aktarılmış veri mi olduğu */}
      {state?.t != null && (
        <p data-latest-source={originOf(state.source)} className="-mt-4 text-[14px] text-ink-dim">
          {t.drawer.latestSource(sourceLabel(state.source, t), new Date(state.t).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}
        </p>
      )}

      {/* Zaman aralığı */}
      <div>
        <div role="group" aria-label={t.drawer.periods.custom} className="flex flex-wrap gap-1 rounded-2xl border border-line p-1">
          {(['day', 'week', 'month', 'mission', 'custom'] as Period[]).map((pd) => (
            <button
              key={pd}
              type="button"
              aria-pressed={period === pd}
              onClick={() => setPeriod(pd)}
              className="min-h-9 flex-1 rounded-xl px-2.5 text-[14.5px] font-medium whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-pressed:bg-holo/12 aria-pressed:text-holo aria-pressed:ring-1 aria-pressed:ring-holo/40"
            >
              {t.drawer.periods[pd]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setApplied(custom)
            }}
          >
            <label className="flex flex-col gap-1 text-[14px] text-ink-dim">
              {t.drawer.from}
              <input type="date" value={custom.from} min={toInput(MISSION.start)} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 rounded-xl border border-line bg-base px-3 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-[14px] text-ink-dim">
              {t.drawer.to}
              <input type="date" value={custom.to} min={custom.from} max={toInput(now)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 rounded-xl border border-line bg-base px-3 text-sm text-ink" />
            </label>
            <button type="submit" className="h-10 rounded-xl bg-holo/12 px-4 text-sm font-semibold text-holo ring-1 ring-holo/40 hover:bg-holo/20">
              {t.drawer.apply}
            </button>
          </form>
        )}
      </div>

      {/* Grafik */}
      <div>
        {data && data.points.length === 0 ? (
          <p className="rounded-xl border border-line px-4 py-8 text-center text-sm text-ink-dim">{t.drawer.empty}</p>
        ) : (
          <TimeChart
            series={series}
            band={ind.band}
            axis={ind.axis}
            unit={unit}
            digits={ind.digits}
            kind={id === 'water' || id === 'exercise' || id === 'sleep' ? 'bar' : 'line'}
            label={t.drawer.chartLabel(resolve(ind.name, lang), periodLabel)}
            from={range[0]}
            to={range[1]}
          />
        )}
        {data?.stats && (
          <dl className="mt-3 grid grid-cols-4 gap-2">
            {(['min', 'max', 'avg', 'count'] as const).map((k) => (
              <div key={k} className="rounded-xl border border-line px-3 py-2">
                <dt className="text-[13px] text-ink-dim">{t.drawer.stats[k]}</dt>
                <dd className="tabular font-mono text-[16.5px] text-ink">{k === 'count' ? data.stats!.count.toLocaleString(locale) : fmt(data.stats![k])}{stats2 && k !== 'count' ? `/${fmt(stats2[k])}` : ''}</dd>
              </div>
            ))}
          </dl>
        )}
        {data && data.points.length > 0 && (
          <p data-composition className="mt-2 text-[13.5px] text-ink-dim">
            {t.drawer.composition}:{' '}
            {Object.entries(originCounts(data.points))
              .map(([o, c]) => `${c.toLocaleString(locale)} ${t.drawer.origins[o as keyof typeof t.drawer.origins]}`)
              .join(' · ')}
          </p>
        )}
      </div>

      {/* Referans ve eşikler */}
      <section>
        <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.drawer.reference}</h3>
        <p className="mt-2 text-[15.5px] text-ink">
          {resolve(ind.range, lang)}{' '}
          <a href={SOURCES[ind.rangeSource].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[14px] text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-holo">
            {SOURCES[ind.rangeSource].org}
            <ExternalLink size={11} aria-hidden />
          </a>
          <NasaBadge source={ind.rangeSource} />
        </p>
        <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
          {(id === 'bp' ? ind.bands : ind.bands).map((b, i) => (
            <BandRow key={i} band={b} unit={unit} digits={ind.digits} />
          ))}
        </ul>
        {ind.bands.some((b) => b.basis === 'vitalis') && <p className="mt-2 text-[14px] leading-snug text-ink-dim">{t.drawer.vitalisNote}</p>}
        {/* U-04: kişisel normal (nabız ve ısı) */}
        {(id === 'hr' || id === 'temp') && snapshot?.personal[id] && (
          <p data-personal-normal className="mt-3 rounded-xl border border-holo/25 bg-holo/[0.05] px-3 py-2 text-[14.5px] text-ink">
            {t.drawer.personal(`${fmt(snapshot.personal[id].low)}–${fmt(snapshot.personal[id].high)} ${unit}`)}{' '}
            <span className="text-ink-dim">
              ({snapshot.personal[id].basis === 'data' ? t.personal.basisData(snapshot.personal[id].days) : t.personal.basisBaseline}) · {t.drawer.personalMore}
            </span>
          </p>
        )}
      </section>

      <section>
        <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.drawer.whySpace}</h3>
        <p className="mt-2 text-[15.5px] leading-relaxed text-ink-muted">{resolve(ind.space, lang)}</p>
        {/* NASA'nın 5 tehlikesinden bu göstergeyle ilgili olanlar; basınca tehlikeler penceresi o tehlikede açılır */}
        {hazardsFor(id).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" data-hazard-chips>
            <span className="mr-1 text-[14px] text-ink-dim">{t.hazards.drawerTitle}:</span>
            {hazardsFor(id).map((hz) => (
              <button
                key={hz.id}
                type="button"
                onClick={() => openHazards(hz.id)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-holo/30 bg-holo/[0.07] px-2.5 text-[14px] text-holo transition-colors hover:bg-holo/15"
              >
                <ShieldAlert size={14} aria-hidden />
                {resolve(hz.name, lang)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Elle ölçüm */}
      {ind.cadence !== 'weekly' && id !== 'water' && id !== 'exercise' && id !== 'radiation' && id !== 'co2' && (
        <section>
          <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.drawer.addReading}</h3>
          {canEdit && astronaut ? <ReadingForm id={id} onSave={(v, v2) => mutate('addMeasurement', astronaut, id, v, v2)} /> : <p className="mt-2 text-[14.5px] text-ink-dim">{t.drawer.readOnly}</p>}
        </section>
      )}

      <section>
        <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.drawer.sources}</h3>
        <ul className="mt-2 space-y-1.5">
          {ind.sources.map((sid) => (
            <li key={sid}>
              <a href={SOURCES[sid].url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 text-[14.5px] text-ink-muted hover:text-holo">
                <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden />
                <span>
                  {SOURCES[sid].title} <span className="text-ink-dim">· {SOURCES[sid].org}</span>
                  <NasaBadge source={sid} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function BandRow({ band, unit, digits }: { band: Band; unit: string; digits: number }) {
  const { t, lang } = useI18n()
  const st = STATUS_META[band.status]
  const StIcon = st.icon
  // Bantlar [alt, üst) aralığıdır; üst sınır gösterilirken bir basamak aşağı yuvarlanır (ör. 120 → 119)
  const lo = band.min !== undefined ? num(band.min, lang, digits) : null
  const hi = band.max !== undefined ? num(band.max - 10 ** -digits, lang, digits) : null
  const span = lo && hi ? `${lo} – ${hi}` : lo ? `≥ ${lo}` : hi ? `≤ ${hi}` : ''
  return (
    <li className="flex items-center gap-3 px-3.5 py-2 text-[14.5px]">
      <span className={`flex w-20 shrink-0 items-center gap-1 font-medium ${st.text}`}>
        <StIcon size={13} aria-hidden />
        {t.status[band.status]}
      </span>
      <span className="tabular w-[9.5rem] shrink-0 font-mono whitespace-nowrap text-ink">
        {span} <span className="font-sans text-ink-dim">{span ? unit : ''}</span>
      </span>
      <span className="min-w-0 flex-1 text-ink-muted">{resolve(band.label, lang)}</span>
      <span className="shrink-0 text-[13px] text-ink-dim">{band.basis === 'vitalis' ? t.vital.vitalisRule : SOURCES[band.basis].org.split(' (')[0]}</span>
    </li>
  )
}

function ReadingForm({ id, onSave }: { id: IndicatorId; onSave: (v: number, v2?: number) => Promise<{ ok: boolean } | null> }) {
  const { t, lang } = useI18n()
  const ind = INDICATORS[id]
  const [v, setV] = useState('')
  const [v2, setV2] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const parse = (s: string) => Number(s.replace(',', '.'))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const r = await onSave(parse(v), ind.valid2 ? parse(v2) : undefined)
    if (r?.ok) {
      setMsg({ ok: true, text: t.drawer.saved })
      setV('')
      setV2('')
    } else setMsg({ ok: false, text: t.drawer.invalid(num(ind.valid[0], lang), num(ind.valid[1], lang)) })
  }
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-[14px] text-ink-dim">
        {ind.valid2 ? t.drawer.systolic : t.drawer.value} ({resolve(ind.unit, lang)})
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} required className="h-10 w-32 rounded-xl border border-line bg-base px-3 font-mono text-sm text-ink" />
      </label>
      {ind.valid2 && (
        <label className="flex flex-col gap-1 text-[14px] text-ink-dim">
          {t.drawer.value2}
          <input inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value)} required className="h-10 w-32 rounded-xl border border-line bg-base px-3 font-mono text-sm text-ink" />
        </label>
      )}
      <button type="submit" className="flex h-10 items-center gap-1.5 rounded-xl bg-holo/12 px-4 text-sm font-semibold text-holo ring-1 ring-holo/40 hover:bg-holo/20">
        <Plus size={15} aria-hidden />
        {t.drawer.save}
      </button>
      {msg && (
        <p role="status" className={`w-full text-[14.5px] ${msg.ok ? 'text-ok' : 'text-warn'}`}>
          {msg.text}
        </p>
      )}
    </form>
  )
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../../i18n'

/*
 * Zaman serisi grafiği (çizgi ya da sütun).
 * - Tek seri: göstergenin rengi (hologram mavisi); iki ve daha fazla seri: doğrulanmış kategorik palet ve açıklama
 * - Normal aralık soluk bir bantla gösterilir; aralık dışındaki noktalar hem renk hem içi boş halkayla ayrılır
 * - Fareyle ya da ok tuşlarıyla gezilir: dikey çizgi ve bütün serilerin değerini gösteren ipucu
 * - Uzun aralıklarda çok sayıda ölçüm saatlik ya da günlük özetlenir (ortalama çizgisi + en düşük/en yüksek bandı)
 */

/** Koyu yüzeyde (#111924) renk körlüğü ve kontrast denetiminden geçen kategorik palet (dataviz doğrulayıcısı) */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#9085e9']
const SINGLE = '#6fe9d6'
const WARN = '#f7c35c'

export interface ChartPoint {
  t: number
  v: number
}

export interface ChartSeries {
  key: string
  label: string
  points: ChartPoint[]
  color?: string
  /** Bu serinin normal aralığı (yoksa grafiğin bandı) */
  band?: [number, number]
}

interface Bucket {
  t: number
  avg: number
  min: number
  max: number
  n: number
}

function bucketize(points: ChartPoint[], size: number): Bucket[] {
  if (!points.length) return []
  const map = new Map<number, Bucket>()
  for (const p of points) {
    const k = Math.floor(p.t / size) * size
    const b = map.get(k)
    if (b) {
      b.avg += p.v
      b.min = Math.min(b.min, p.v)
      b.max = Math.max(b.max, p.v)
      b.n++
    } else map.set(k, { t: k + size / 2, avg: p.v, min: p.v, max: p.v, n: 1 })
  }
  return [...map.values()].map((b) => ({ ...b, avg: b.avg / b.n })).sort((a, b) => a.t - b.t)
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function TimeChart({
  series,
  band,
  axis,
  unit,
  digits = 0,
  kind = 'line',
  height = 220,
  label,
  from,
  to,
}: {
  series: ChartSeries[]
  band?: [number, number]
  axis?: [number, number]
  unit: string
  digits?: number
  kind?: 'line' | 'bar'
  height?: number
  label: string
  from: number
  to: number
}) {
  const { locale } = useI18n()
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(560)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const span = to - from
  // Nokta çoksa özetlenir: 2 güne kadar saatlik, daha uzunsa günlük
  const total = series.reduce((n, s) => n + s.points.length, 0)
  const bucketSize = total / Math.max(1, series.length) > 160 ? (span <= 2 * DAY ? HOUR : DAY) : 0
  const data = useMemo(
    () => series.map((s, i) => ({ ...s, color: s.color ?? (series.length === 1 ? SINGLE : SERIES_COLORS[i % SERIES_COLORS.length]), buckets: bucketSize ? bucketize(s.points, bucketSize) : s.points.map((p) => ({ t: p.t, avg: p.v, min: p.v, max: p.v, n: 1 })) })),
    [series, bucketSize],
  )

  const pad = { l: 44, r: 14, t: 12, b: 26 }
  const plotW = w - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const values = data.flatMap((s) => s.buckets.flatMap((b) => [b.min, b.max]))
  let lo = Math.min(...values, band?.[0] ?? Infinity, axis?.[0] ?? Infinity)
  let hi = Math.max(...values, band?.[1] ?? -Infinity, axis?.[1] ?? -Infinity)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0
    hi = 1
  }
  if (kind === 'bar') lo = Math.min(0, lo)
  const ticks = niceTicks(lo, hi, 4)
  lo = ticks[0]
  hi = ticks[ticks.length - 1]
  const x = (t: number) => pad.l + ((t - from) / (span || 1)) * plotW
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * plotH
  const outOfBand = (v: number, own?: [number, number]) => {
    const b = own ?? band
    return !!b && (v < b[0] || v > b[1])
  }

  // Gezinme ekseni: ilk serinin noktaları
  const nav = data[0]?.buckets ?? []
  const last = nav.length - 1
  const fmtV = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  const fmtT = (t: number) =>
    new Date(t).toLocaleString(locale, span <= 2 * DAY ? { hour: '2-digit', minute: '2-digit', day: span > DAY ? 'numeric' : undefined, month: span > DAY ? 'short' : undefined } : { day: 'numeric', month: 'short' })

  const xTicks = useMemo(() => {
    const n = Math.max(2, Math.min(6, Math.floor(plotW / 110)))
    return Array.from({ length: n }, (_, i) => from + (span * i) / (n - 1))
  }, [from, span, plotW])

  const onMove = (clientX: number) => {
    if (!nav.length) return
    const rect = wrap.current!.getBoundingClientRect()
    const t = from + ((clientX - rect.left - pad.l) / plotW) * span
    let best = 0
    for (let i = 1; i < nav.length; i++) if (Math.abs(nav[i].t - t) < Math.abs(nav[best].t - t)) best = i
    setActive(best)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last + 1) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const barW = Math.max(2, Math.min(24, (plotW / Math.max(1, nav.length)) * 0.6))
  const at = active !== null ? nav[active] : null

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-holo/60"
      >
        {/* Serilerin kendi normal aralıkları (ör. küçük tansiyon) daha soluk */}
        {data.slice(1).map((s) =>
          s.band ? <rect key={s.key} x={pad.l} width={plotW} y={y(Math.min(hi, s.band[1]))} height={Math.max(0, y(Math.max(lo, s.band[0])) - y(Math.min(hi, s.band[1])))} fill="rgb(94 227 154 / 0.045)" /> : null,
        )}
        {/* Normal aralık bandı */}
        {band && (
          <rect x={pad.l} width={plotW} y={y(Math.min(hi, band[1]))} height={Math.max(0, y(Math.max(lo, band[0])) - y(Math.min(hi, band[1])))} fill="rgb(94 227 154 / 0.07)" />
        )}
        {/* Yatay ızgara ve eksen değerleri */}
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} stroke="rgb(150 196 230 / 0.1)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(tk)} dy="0.32em" textAnchor="end" className="fill-ink-dim font-mono text-[12.5px]">
              {fmtV(tk)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t} x={x(t)} y={height - 7} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="fill-ink-dim text-[12.5px]">
            {fmtT(t)}
          </text>
        ))}

        {data.map((s) => {
          if (kind === 'bar')
            return (
              <g key={s.key}>
                {s.buckets.map((b) => {
                  const top = y(Math.max(0, b.avg))
                  const base = y(Math.max(lo, 0))
                  const hgt = Math.max(1, base - top)
                  const r = Math.min(4, hgt / 2, barW / 2)
                  const bx = x(b.t) - barW / 2
                  return (
                    <path
                      key={b.t}
                      d={`M${bx} ${base} V${top + r} Q${bx} ${top} ${bx + r} ${top} H${bx + barW - r} Q${bx + barW} ${top} ${bx + barW} ${top + r} V${base} Z`}
                      fill={outOfBand(b.avg, s.band) ? WARN : s.color}
                      opacity={at && at.t !== b.t ? 0.55 : 1}
                    />
                  )
                })}
              </g>
            )
          const path = s.buckets.map((b, i) => `${i ? 'L' : 'M'}${x(b.t).toFixed(1)} ${y(b.avg).toFixed(1)}`).join(' ')
          const range = bucketSize
            ? `${s.buckets.map((b, i) => `${i ? 'L' : 'M'}${x(b.t).toFixed(1)} ${y(b.max).toFixed(1)}`).join(' ')} ${[...s.buckets]
                .reverse()
                .map((b) => `L${x(b.t).toFixed(1)} ${y(b.min).toFixed(1)}`)
                .join(' ')} Z`
            : null
          return (
            <g key={s.key}>
              {range && <path d={range} fill={s.color} opacity={0.12} />}
              <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* Aralık dışındaki noktalar: içi boş halka (renk tek başına anlam taşımaz) */}
              {s.buckets.length <= 120 &&
                s.buckets.map((b) =>
                  outOfBand(b.avg, s.band) ? <circle key={b.t} cx={x(b.t)} cy={y(b.avg)} r={4.5} fill="var(--color-raised)" stroke={WARN} strokeWidth={2} /> : null,
                )}
              {s.buckets.length > 0 && (
                <circle cx={x(s.buckets[s.buckets.length - 1].t)} cy={y(s.buckets[s.buckets.length - 1].avg)} r={4} fill={s.color} stroke="var(--color-raised)" strokeWidth={2} />
              )}
            </g>
          )
        })}

        {/* Dikey gezinme çizgisi */}
        {at && <line x1={x(at.t)} x2={x(at.t)} y1={pad.t} y2={pad.t + plotH} stroke="rgb(232 240 247 / 0.35)" strokeWidth={1} />}
        {at &&
          kind === 'line' &&
          data.map((s) => {
            const b = s.buckets.find((bb) => bb.t === at.t) ?? nearest(s.buckets, at.t)
            return b ? <circle key={s.key} cx={x(b.t)} cy={y(b.avg)} r={4.5} fill={s.color} stroke="var(--color-raised)" strokeWidth={2} /> : null
          })}
      </svg>

      {at && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl border border-line-strong bg-raised/95 px-3 py-2 text-[14px] shadow-xl backdrop-blur"
          style={{ left: Math.min(Math.max(0, x(at.t) - 70), w - 160) }}
          role="status"
        >
          <p className="text-[13px] text-ink-dim">{fmtT(at.t)}</p>
          {data.map((s) => {
            const b = s.buckets.find((bb) => bb.t === at.t) ?? nearest(s.buckets, at.t)
            if (!b) return null
            return (
              <p key={s.key} className="mt-0.5 flex items-center gap-2">
                {data.length > 1 && <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />}
                <span className="tabular font-mono font-semibold text-ink">
                  {fmtV(b.avg)} <span className="font-sans font-normal text-ink-dim">{unit}</span>
                </span>
                {data.length > 1 && <span className="text-ink-muted">{s.label}</span>}
                {b.n > 1 && (
                  <span className="text-ink-dim">
                    ({fmtV(b.min)}–{fmtV(b.max)})
                  </span>
                )}
              </p>
            )
          })}
        </div>
      )}

      {data.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-11 text-[13.5px] text-ink-muted">
          {data.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3.5 rounded" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function nearest(list: Bucket[], t: number): Bucket | null {
  let best: Bucket | null = null
  for (const b of list) if (!best || Math.abs(b.t - t) < Math.abs(best.t - t)) best = b
  return best
}

/** Okunaklı eksen değerleri (1, 2, 2,5, 5 × 10ⁿ adımlarla) */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (hi - lo < 1e-9) {
    hi = lo + 1
  }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const out: number[] = []
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

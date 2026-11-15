import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'

/**
 * Tek serili 7 günlük çizgi grafik. Normal aralık soluk bir bantla gösterilir;
 * aralık dışındaki günler hem renk hem halka işaretiyle ayrılır.
 */
export function Sparkline({
  values,
  range,
  unit,
  label,
}: {
  values: number[]
  range: [number, number]
  unit: string
  label: string
}) {
  const { t, locale } = useI18n()
  const days = t.sparkline.days
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(320)
  const [active, setActive] = useState<number | null>(null)
  const h = 116
  const pad = { l: 6, r: 6, t: 14, b: 22 }

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const lo = Math.min(...values, range[0])
  const hi = Math.max(...values, range[1])
  const span = hi - lo || 1
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (h - pad.t - pad.b)
  const out = (v: number) => v < range[0] || v > range[1]
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  const fmt = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1 })

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last + 1) - 1))
    else return
    e.preventDefault()
  }

  const onMove = (clientX: number) => {
    const rect = wrap.current!.getBoundingClientRect()
    const rel = (clientX - rect.left - pad.l) / (w - pad.l - pad.r)
    setActive(Math.max(0, Math.min(last, Math.round(rel * last))))
  }

  const shown = active ?? last

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] text-ink-muted">{label} · {t.sparkline.last7}</span>
        <span className="text-[13.5px] text-ink-dim">
          {t.sparkline.normalRange} <span className="tabular font-mono">{fmt(range[0])}–{fmt(range[1])}</span>
        </span>
      </figcaption>
      <div
        ref={wrap}
        className="relative"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={w}
          height={h}
          role="img"
          aria-label={t.sparkline.aria(label, fmt(values[last]), unit)}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="block overflow-visible rounded-md"
        >
          {/* Normal aralık bandı */}
          <rect
            x={pad.l}
            y={y(range[1])}
            width={w - pad.l - pad.r}
            height={Math.max(1, y(range[0]) - y(range[1]))}
            fill="var(--color-holo)"
            opacity={0.07}
            rx={4}
          />
          <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke="var(--color-line)" />

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={pad.t - 6} y2={h - pad.b} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
          )}

          <path d={path} fill="none" stroke="var(--color-holo)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {values.map((v, i) => {
            const isOut = out(v)
            const big = i === shown
            return (
              <g key={i}>
                {isOut && <circle cx={x(i)} cy={y(v)} r={big ? 8 : 6.5} fill="none" stroke="var(--color-warn)" strokeWidth={1.5} />}
                <circle
                  cx={x(i)}
                  cy={y(v)}
                  r={big ? 4.5 : 3}
                  fill={isOut ? 'var(--color-warn)' : big ? 'var(--color-holo)' : 'var(--color-surface)'}
                  stroke={isOut ? 'var(--color-surface)' : 'var(--color-holo)'}
                  strokeWidth={2}
                />
              </g>
            )
          })}

          <text x={pad.l} y={h - 5} fill="var(--color-ink-dim)" fontSize={11} fontFamily="var(--font-mono)">
            {days[0]}
          </text>
          <text x={w - pad.r} y={h - 5} fill="var(--color-ink-dim)" fontSize={11} fontFamily="var(--font-mono)" textAnchor="end">
            {days[last]}
          </text>
        </svg>

        {/* İmleç balonu */}
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[110%] rounded-md border border-line-strong bg-raised px-2 py-1 text-[13.5px] whitespace-nowrap shadow-lg transition-opacity"
          style={{ left: Math.min(Math.max(x(shown), 50), w - 50), opacity: active === null ? 0 : 1 }}
          aria-hidden
        >
          <span className="text-ink-dim">{days[shown]}</span>{' '}
          <span className="tabular font-mono font-medium text-ink">
            {fmt(values[shown])} {unit}
          </span>
          {out(values[shown]) && <span className="ml-1 text-warn">· {t.sparkline.outOfRange}</span>}
        </div>
      </div>

      {/* Ekran okuyucu için tablo görünümü */}
      <table className="sr-only">
        <caption>
          {label}, {t.sparkline.last7}
        </caption>
        <tbody>
          {values.map((v, i) => (
            <tr key={i}>
              <th scope="row">{days[i]}</th>
              <td>
                {fmt(v)} {unit}
                {out(v) ? t.sparkline.tableOut : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

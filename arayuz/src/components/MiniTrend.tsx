import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { IndicatorId, Status } from '../core/catalog'
import { DAY, dayStart } from '../core/crew'
import { useHealth, useQuery } from '../data/health'
import { indicatorColor, isLiveIndicator } from '../lib/indicatorColors'
import { STATUS_META } from '../lib/status'

/** Sorgu anahtarı yarım saatte bir değişir: her güncellemede yeniden istenip titremesin */
const STEP = 30 * 60_000
/** Son noktanın parlayan halkası kesilmesin diye çizim alanının kenar payı (piksel) */
const PAD = 5

/**
 * Gösterge kartındaki küçük, hareketli grafik. Çizgi açılışta soldan sağa çizilir, üzerinde sürekli bir ışık dolaşır
 * ve son ölçüm noktası nabız gibi atar ("hareketi azalt" ayarında hepsi durur). Durum normal değilse grafik durum
 * rengine döner. Ekran okuyucuya gösterilmez: grafiği açan düğmenin adı bunu söyler.
 * Çizim kutunun gerçek piksel boyutuyla yapılır: nokta ve çizgi kalınlığı esneyip bozulmaz.
 */
export function MiniTrend({ id, status }: { id: IndicatorId; status: Status }) {
  const { astronaut, snapshot } = useHealth()
  const gradId = useId()
  const glowId = useId()
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize((s) => (s && Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const live = isLiveIndicator(id)
  const now = snapshot?.now ?? null
  const to = now === null ? null : Math.ceil(now / STEP) * STEP
  const from = to === null ? null : live ? to - DAY : dayStart(to) - 6 * DAY
  const data = useQuery('series', astronaut && from !== null && to !== null ? [astronaut, id, from, to] : null)

  const values = useMemo(() => {
    const pts = data?.points ?? []
    if (live || from === null) return pts.map((p) => p.v)
    // Günlük göstergeler: her gün tek değer (ortalama)
    const out: number[] = []
    for (let d = 0; d < 7; d++) {
      const s = from + d * DAY
      const inDay = pts.filter((p) => p.t >= s && p.t < s + DAY)
      if (inDay.length) out.push(inDay.reduce((n, p) => n + p.v, 0) / inDay.length)
    }
    return out
  }, [data, live, from])

  const color = status === 'normal' ? indicatorColor(id) : STATUS_META[status].hex
  let chart = null
  if (size && size.w > 2 * PAD && values.length >= 2) {
    const { w, h } = size
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = hi - lo || 1
    const x = (i: number) => PAD + (i / (values.length - 1)) * (w - 2 * PAD)
    const y = (v: number) => PAD + (1 - (v - lo) / span) * (h - 2 * PAD)
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
    const area = `${line} L${x(values.length - 1).toFixed(1)} ${h} L${PAD} ${h} Z`
    const lx = x(values.length - 1)
    const ly = y(values[values.length - 1])
    chart = (
      <svg width={w} height={h} className="block overflow-visible" data-mini-trend={id}>
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <path className="trend-area" d={area} fill={`url(#${gradId})`} />
        <path className="trend-line" d={line} pathLength={1} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* Çizgi boyunca dolaşan ışık: altta bulanık hale, üstte parlak çekirdek */}
        <path className="trend-scan" d={line} pathLength={1} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" filter={`url(#${glowId})`} />
        <path className="trend-scan" d={line} pathLength={1} fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2" strokeLinecap="round" />
        <circle className="trend-ping" cx={lx} cy={ly} r="3" fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx={lx} cy={ly} r="2.6" fill={color} />
      </svg>
    )
  }

  return (
    <div ref={box} className="size-full" aria-hidden>
      {chart}
    </div>
  )
}

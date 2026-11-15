import { createPortal } from 'react-dom'
import { INDICATORS } from '../core/catalog'
import { bodyPart } from '../core/coach'
import { CREW, MISSION } from '../core/crew'
import type { RpcResult } from '../core/rpc'
import { num } from '../core/tx'
import type { Status } from '../data/types'
import { resolve, useI18n } from '../i18n'

/*
 * Yazdırılan (PDF) sağlık raporu. Ekranda görünmez; yalnızca yazdırırken sayfanın tek içeriği olur (index.css @media print).
 * Uygulamanın görünümüne uyar: üstte koyu lacivert başlık bandı ve su yeşili vurgu, gövde kâğıtta okunsun diye açık.
 * Durumlar renk + yazı ile verilir (siyah-beyaz yazdırınca da okunur). Her göstergede referans aralığı küçük bir çubukla
 * çizilir: yeşil bant normal aralık, nokta son değer.
 */

type Report = RpcResult<'report'>
type Row = Report['rows'][number]

/** Kâğıtta okunur durum renkleri (uygulamanın ok/warn/crit tonlarının koyulaştırılmış hali) */
const TONE: Record<Status, { fg: string; bg: string; dot: string }> = {
  normal: { fg: '#11733f', bg: '#e3f6ea', dot: '#22a35a' },
  dikkat: { fg: '#8a5a00', bg: '#fdf1d6', dot: '#e0a21a' },
  kritik: { fg: '#a3222b', bg: '#fde3e3', dot: '#e0484f' },
}
/** Bilgi seviyesindeki uyarılar: uygulamadaki gibi mavi (durum değil, bilgilendirme) */
const INFO = { fg: '#0e6d92', bg: '#e2f4fb', dot: '#2aa8d8' }

export function PrintReport({ rep, view, generatedAt }: { rep: Report; view: 'doctor' | 'plain'; generatedAt: number }) {
  const { t, lang, locale } = useI18n()
  const d = t.doctor
  const person = CREW[rep.astronaut as keyof typeof CREW]
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const rows = rep.rows.filter((r) => view === 'doctor' || ['hr', 'bp', 'spo2', 'temp', 'glucose', 'sleep', 'mood', 'exercise', 'water'].includes(r.id))
  const counts = { normal: 0, dikkat: 0, kritik: 0 } as Record<Status, number>
  rows.forEach((r) => counts[r.status]++)

  return createPortal(
    <div id="print-report" lang={lang} aria-hidden>
      <header className="pr-band">
        <div className="pr-brand">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6fe9d6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M5 12h3l2-4 3 8 2-4h4" />
          </svg>
          <div>
            <p className="pr-brand-name">Health Atlas</p>
            <p className="pr-brand-sub">{d.printBrand}</p>
          </div>
        </div>
        <div className="pr-title">
          <h1>{d.reportText(person?.name ?? '', rep.days)}</h1>
          <p>
            {resolve(MISSION.name, lang)} · {person ? resolve(person.role, lang) : ''} · {date(rep.from)} – {date(rep.to)}
          </p>
        </div>
      </header>

      <section className="pr-summary">
        <div className="pr-stat">
          <p className="pr-label">{t.crew.score}</p>
          <p className="pr-big">{rep.score}</p>
        </div>
        {(['normal', 'dikkat', 'kritik'] as Status[]).map((s) => (
          <div key={s} className="pr-stat" style={{ borderTopColor: TONE[s].dot }}>
            <p className="pr-label">{t.status[s]}</p>
            <p className="pr-big" style={{ color: TONE[s].fg }}>
              {counts[s]}
            </p>
          </div>
        ))}
        <div className="pr-stat pr-meta">
          <p className="pr-label">{d.generated(new Date(generatedAt).toLocaleString(locale))}</p>
          <p className="pr-small">{view === 'doctor' ? d.viewDoctor : d.viewAstronaut}</p>
        </div>
      </section>

      {view === 'plain' && (
        <p className="pr-lead">
          {d.plain.intro(person?.name.split(' ').pop() ?? '')} {counts.dikkat + counts.kritik === 0 ? d.plain.good : ''}
        </p>
      )}

      <table className="pr-table">
        <thead>
          <tr>
            <th>{d.colIndicator}</th>
            <th className="num">{d.colLatest}</th>
            {view === 'doctor' && <th className="num">{d.colAvg}</th>}
            {view === 'doctor' && <th className="num">{d.colRange}</th>}
            <th>{d.colRef}</th>
            <th>{d.printStatus}</th>
            <th>{d.colTrend}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <PrintRow key={r.id} r={r} view={view} />
          ))}
        </tbody>
      </table>
      <p className="pr-note">{d.refNote}</p>

      <div className="pr-cols">
        <section>
          <h2>{d.complaints}</h2>
          {rep.complaints.length === 0 ? (
            <p className="pr-none">{d.none}</p>
          ) : (
            <ul>
              {rep.complaints.map((c) => (
                <li key={c.id}>
                  <strong>{t.hologram.symptoms[c.symptom]}</strong> · {resolve(bodyPart(c.region, c.side), lang)} · {c.severity}/10 · {t.complaintSave.status[c.status]}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2>{d.alerts}</h2>
          {rep.findings.length === 0 ? (
            <p className="pr-none">{d.none}</p>
          ) : (
            <ul>
              {rep.findings.map((f) => {
                const tone = f.level === 'bilgi' ? INFO : TONE[f.level]
                return (
                  <li key={f.key}>
                    <span className="pr-pill" style={{ color: tone.fg, background: tone.bg }}>
                      {t.alertLevel[f.level]}
                    </span>{' '}
                    {resolve(f.title, lang)}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <footer className="pr-foot">{d.printFooter}</footer>
    </div>,
    document.body,
  )
}

function PrintRow({ r, view }: { r: Row; view: 'doctor' | 'plain' }) {
  const { t, lang } = useI18n()
  const d = t.doctor
  const ind = INDICATORS[r.id]
  const f = (v: number) => num(v, lang, ind.digits)
  const tone = TONE[r.status]
  const latest = r.latest === null ? '—' : r.latest2 !== undefined ? `${f(r.latest)}/${f(r.latest2)}` : f(r.latest)
  const ref = r.ref.low2 !== undefined && r.ref.high2 !== undefined ? `${f(r.ref.low)}–${f(r.ref.high)} / ${f(r.ref.low2)}–${f(r.ref.high2)}` : `${f(r.ref.low)}–${f(r.ref.high)}`
  const arrow = { up: '↑', down: '↓', flat: '→' }[r.trend]
  return (
    <tr>
      <td>
        <span className="pr-dot" style={{ background: tone.dot }} />
        {resolve(ind.name, lang)}
        {view === 'doctor' && <span className="pr-unit">{resolve(ind.unit, lang)}</span>}
      </td>
      <td className="num strong" style={{ color: r.status === 'normal' ? undefined : tone.fg }}>
        {latest}
        {r.partial && <span className="pr-unit">{d.todaySoFar}</span>}
      </td>
      {view === 'doctor' && <td className="num">{r.stats ? f(r.stats.avg) : '—'}</td>}
      {view === 'doctor' && <td className="num">{r.stats ? `${f(r.stats.min)}–${f(r.stats.max)}` : '—'}</td>}
      <td>
        <RangeBar low={r.ref.low} high={r.ref.high} value={r.latest} min={r.stats?.min} max={r.stats?.max} color={tone.dot} />
        <span className="pr-ref">{ref}</span>
      </td>
      <td>
        <span className="pr-pill" style={{ color: tone.fg, background: tone.bg }}>
          {t.status[r.status]}
        </span>
      </td>
      <td className="pr-trend">
        {arrow} {d.trend[r.trend]}
      </td>
    </tr>
  )
}

/** Referans bandı ve son değer: ölçek normal aralığın her iki yanına pay bırakır, aralık dışı değerler de çizilir */
function RangeBar({ low, high, value, min, max, color }: { low: number; high: number; value: number | null; min?: number; max?: number; color: string }) {
  const span = Math.max(high - low, 1e-6)
  const lo = Math.min(low - span * 0.5, min ?? Infinity, value ?? Infinity)
  const hi = Math.max(high + span * 0.5, max ?? -Infinity, value ?? -Infinity)
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100
  return (
    <svg className="pr-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
      <rect x="0" y="4" width="100" height="2" rx="1" fill="#e6ebf1" />
      <rect x={x(low)} y="3" width={Math.max(x(high) - x(low), 1)} height="4" rx="2" fill="#c8eed6" />
      {min !== undefined && max !== undefined && <rect x={x(min)} y="4.5" width={Math.max(x(max) - x(min), 0.6)} height="1" fill="#9aa8b8" />}
      {value !== null && <circle cx={x(value)} cy="5" r="2.6" fill={color} stroke="#fff" strokeWidth="0.8" />}
    </svg>
  )
}

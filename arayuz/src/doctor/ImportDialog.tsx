import { Check, ChevronLeft, Download, FileUp, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Modal } from '../components/Modal'
import { INDICATOR_IDS, INDICATORS, type IndicatorId } from '../core/catalog'
import { CREW } from '../core/crew'
import { checkRow, parseRows, type ImportRequest } from '../core/importer'
import { num } from '../core/tx'
import { useHealth } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { closeImport, useImportDialog } from '../lib/importDialog'

/*
 * Veri içe aktarma penceresi (VM-08, VM-09, VM-10). Üç adım: dosya, eşleme, önizleme. Önizleme içe aktarmayla aynı
 * kuralları kullanır (core/importer.ts checkRow): önizlemede geçerli görünen satır içe aktarılır, atlanan atlanır.
 * Bitince tek bildirim çıkar ve gösterge gezgini o göstergeye ve verinin aralığına geçer (onDone).
 */

const MAX_BYTES = 2 * 1024 * 1024
type Unit = NonNullable<ImportRequest['unit']>
/** Göstergeye göre anlamlı birim çevirileri (ilki katalog birimi) */
const UNITS: Partial<Record<IndicatorId, Unit[]>> = { temp: ['C', 'F'], glucose: ['mg/dL', 'mmol/L'], sleep: ['h', 'min'] }

const TIME_RE = /^(time|timestamp|date|datetime|ts|t|zaman|tarih)$|time|date|zaman|tarih/i
/** Başlıktan gösterge tahmini (ilk eşleşen) */
const GUESS: [IndicatorId, RegExp][] = [
  ['hr', /bpm|heart|pulse|^hr$|nab[ıi]z/i],
  ['spo2', /spo2|oxygen|oksijen|sat/i],
  ['glucose', /gluc|sugar|şeker|seker/i],
  ['temp', /temp|°c|°f|[ıi]s[ıi]|s[ıi]cakl/i],
  ['bp', /sys|systolic|b[üu]y[üu]k|tansiyon|blood.?pressure/i],
  ['resp', /resp|breath|solunum/i],
  ['sleep', /sleep|uyku/i],
  ['co2', /co2|co₂/i],
  ['radiation', /dose|msv|radyasyon|radiation/i],
]

export interface ImportedRange {
  indicator: IndicatorId
  from: number
  to: number
}

function guessIndicator(cols: string[]): IndicatorId {
  for (const [id, re] of GUESS) if (cols.some((c) => !TIME_RE.test(c) && re.test(c))) return id
  return 'hr'
}

function guessColumns(cols: string[], rows: Record<string, unknown>[], indicator: IndicatorId) {
  const time = cols.find((c) => /^(time|timestamp|date|datetime|ts|t|zaman|tarih)$/i.test(c)) ?? cols.find((c) => TIME_RE.test(c)) ?? cols[0] ?? ''
  const numeric = cols.filter((c) => c !== time && rows.slice(0, 5).every((r) => r[c] === undefined || r[c] === '' || Number.isFinite(Number(r[c]))))
  const re = GUESS.find(([id]) => id === indicator)?.[1]
  const value = (re && numeric.find((c) => re.test(c))) ?? numeric[0] ?? cols.find((c) => c !== time) ?? ''
  const value2 = indicator === 'bp' ? (numeric.find((c) => c !== value && /dia|k[üu][çc][üu]k/i.test(c)) ?? numeric.find((c) => c !== value)) : undefined
  return { time, value, value2 }
}

function guessUnit(indicator: IndicatorId, col: string, rows: Record<string, unknown>[]): Unit | undefined {
  const list = UNITS[indicator]
  if (!list) return undefined
  const sample = rows.slice(0, 20).map((r) => Number(r[col])).filter(Number.isFinite)
  const avg = sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 0
  if (indicator === 'glucose') return /mmol/i.test(col) || (avg > 0 && avg < 35) ? 'mmol/L' : 'mg/dL'
  if (indicator === 'temp') return /f\b|°f|fahr/i.test(col) || avg > 50 ? 'F' : 'C'
  if (indicator === 'sleep') return /min|dk/i.test(col) || avg > 24 ? 'min' : 'h'
  return list[0]
}

interface Loaded {
  name: string
  format: 'csv' | 'json'
  text: string
  rows: Record<string, unknown>[]
  cols: string[]
}

/** Uygulama düzeyinde tek yerde çizilir (App); açılması lib/importDialog ile */
export function ImportDialog({ onDone }: { onDone: (r: ImportedRange) => void }) {
  const open = useImportDialog()
  const { t } = useI18n()
  return (
    <Modal open={open} onClose={closeImport} title={t.importer.title} closeLabel={t.importer.close} icon={<Upload size={19} aria-hidden />} id="import-dialog" width="w-[min(720px,calc(100vw-2rem))]" initialFocus="#import-choose">
      <ImportBody onDone={onDone} />
    </Modal>
  )
}

function ImportBody({ onDone }: { onDone: (r: ImportedRange) => void }) {
  const { t, lang, locale } = useI18n()
  const im = t.importer
  const { backend, astronaut, profile, refresh } = useHealth()
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [map, setMap] = useState<{ indicator: IndicatorId; time: string; value: string; value2?: string; unit?: Unit; dataset: string; provider: string; url: string }>({
    indicator: 'hr',
    time: '',
    value: '',
    dataset: '',
    provider: '',
    url: '',
  })
  const heading = useRef<HTMLHeadingElement | null>(null)
  const focusHeading = (el: HTMLHeadingElement | null) => {
    if (el && heading.current !== el) el.focus()
    heading.current = el
  }

  const read = async (f: File) => {
    setError(null)
    const ext = f.name.toLowerCase().split('.').pop()
    if (ext !== 'csv' && ext !== 'json') return setError(im.badType)
    if (f.size > MAX_BYTES) return setError(im.tooBig)
    let text: string
    try {
      text = await f.text()
    } catch {
      return setError(im.readError)
    }
    const rows = parseRows(ext, text)
    if (!rows || rows.length === 0) return setError(im.parseError)
    const cols = [...new Set(rows.slice(0, 50).flatMap((r) => Object.keys(r)))]
    const indicator = guessIndicator(cols)
    const g = guessColumns(cols, rows, indicator)
    setFile({ name: f.name, format: ext, text, rows, cols })
    setMap({ indicator, time: g.time, value: g.value, value2: g.value2, unit: guessUnit(indicator, g.value, rows), dataset: f.name.replace(/\.(csv|json)$/i, ''), provider: '', url: '' })
    setStep(1)
  }

  const setIndicator = (indicator: IndicatorId) => {
    if (!file) return
    const g = guessColumns(file.cols, file.rows, indicator)
    setMap((m) => ({ ...m, indicator, value: file.cols.includes(m.value) ? m.value : g.value, value2: indicator === 'bp' ? (m.value2 ?? g.value2) : undefined, unit: guessUnit(indicator, m.value, file.rows) }))
  }

  const req = useMemo(
    () => ({ indicator: map.indicator, timeColumn: map.time, valueColumn: map.value, value2Column: map.indicator === 'bp' ? map.value2 : undefined, unit: map.unit, format: file?.format ?? 'csv' }) as const,
    [map, file],
  )
  const checks = useMemo(() => (file ? file.rows.slice(0, 50_000).map((r, i) => checkRow(req, r, i)) : []), [file, req])
  const valid = checks.filter((c) => c.ok)
  const invalid = checks.filter((c) => !c.ok)
  const times = valid.map((c) => c.t!).sort((a, b) => a - b)
  const ind = INDICATORS[map.indicator]
  const fmtTime = (ts: number | null) => (ts === null ? '—' : new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
  const fmtV = (v: number) => (Number.isFinite(v) ? num(v, lang, ind.digits) : '—')

  const submit = async () => {
    if (!backend || !astronaut || !file) return
    setBusy(true)
    const r = await backend
      .importData({ astronaut, ...req, text: file.text, dataset: map.dataset.trim(), provider: map.provider.trim() || undefined, url: map.url.trim() || undefined, by: profile.role })
      .catch(() => null)
    setBusy(false)
    if (!r?.ok) return setError(im.failed)
    // Tek bildirim (yanına ikinci bir "kaydedildi" kutusu açılmaz)
    toast(im.done(r.imported, r.skipped), { duration: 5000 })
    refresh()
    closeImport()
    if (times.length) onDone({ indicator: map.indicator, from: times[0], to: times[times.length - 1] })
  }

  if (!astronaut) return <p className="text-[15px] text-ink-muted">{im.readOnly}</p>

  const select = 'mt-1 h-10 w-full rounded-lg border border-line bg-base/70 px-2 text-[14.5px] text-ink outline-none focus-visible:border-holo/50'
  const field = 'mt-1 h-10 w-full rounded-lg border border-line bg-base/70 px-2.5 text-[14.5px] text-ink outline-none placeholder:text-ink-dim focus-visible:border-holo/50'
  const label = 'block text-[14px] font-medium text-ink'

  return (
    <div className="flex flex-col gap-4" data-import-step={step}>
      <p className="text-[14.5px] text-ink-muted">{im.subtitle(CREW[astronaut].name)}</p>
      {/* Adım göstergesi: yazıyla da söylenir */}
      <ol className="flex gap-2" aria-label={im.stepOf(step + 1, 3, im.steps[step])}>
        {im.steps.map((s, i) => (
          <li key={s} className={`flex flex-1 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13.5px] ${i === step ? 'border-holo/50 bg-holo/10 text-holo' : i < step ? 'border-line text-ink-muted' : 'border-line text-ink-dim'}`} aria-current={i === step ? 'step' : undefined}>
            {i < step ? <Check size={13} aria-hidden /> : <span className="tabular font-mono text-[12.5px]">{i + 1}</span>}
            {s}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-xl border border-warn/40 bg-warn/[0.06] px-3 py-2 text-[14.5px] text-ink">
          {error}
        </p>
      )}

      {step === 0 && (
        <section aria-labelledby="import-step-file" className="flex flex-col gap-3">
          <h3 id="import-step-file" className="sr-only">
            {im.stepOf(1, 3, im.steps[0])}
          </h3>
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              setDrag(false)
              const f = e.dataTransfer.files[0]
              if (f) void read(f)
            }}
            className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors ${drag ? 'border-holo/60 bg-holo/[0.06]' : 'border-line-strong'}`}
          >
            <FileUp size={26} className="text-holo" aria-hidden />
            <p className="text-[14.5px] text-ink-muted">{im.drop}</p>
            <button type="button" id="import-choose" onClick={() => input.current?.click()} className="flex min-h-10 items-center gap-2 rounded-xl bg-holo/12 px-4 text-[14.5px] font-semibold text-holo ring-1 ring-holo/35 hover:bg-holo/18">
              <Upload size={15} aria-hidden />
              {im.choose}
            </button>
            <input
              ref={input}
              id="import-file"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-label={im.choose}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void read(f)
                e.target.value = ''
              }}
            />
          </div>
          <div className="rounded-xl border border-line bg-white/[0.015] p-3">
            <p className="text-[14px] font-medium text-ink">{im.sample}</p>
            <ul className="mt-1.5 space-y-1 text-[14px]">
              {[
                ['/samples/heart-rate-synthetic-sample.csv', im.sampleCsv],
                ['/samples/glucose-mmol-synthetic-sample.json', im.sampleJson],
              ].map(([href, name]) => (
                <li key={href}>
                  <a href={href} download className="inline-flex items-center gap-1.5 text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-holo">
                    <Download size={13} aria-hidden />
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {step === 1 && file && (
        <section aria-labelledby="import-step-map" className="flex flex-col gap-3">
          <h3 id="import-step-map" ref={focusHeading} tabIndex={-1} className="text-[15px] font-semibold text-ink outline-none">
            {im.loaded(file.name, file.rows.length)}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {im.indicator}
              <select id="import-indicator" value={map.indicator} onChange={(e) => setIndicator(e.target.value as IndicatorId)} className={select}>
                {INDICATOR_IDS.map((id) => (
                  <option key={id} value={id}>
                    {resolve(INDICATORS[id].name, lang)} ({resolve(INDICATORS[id].unit, lang)})
                  </option>
                ))}
              </select>
            </label>
            {UNITS[map.indicator] && (
              <label className={label}>
                {im.unit}
                <select id="import-unit" value={map.unit} onChange={(e) => setMap((m) => ({ ...m, unit: e.target.value as Unit }))} className={select}>
                  {UNITS[map.indicator]!.map((u, i) => (
                    <option key={u} value={u}>
                      {i === 0 ? im.unitSame(resolve(ind.unit, lang)) : im.unitNames[u]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={label}>
              {im.timeColumn}
              <select id="import-time" value={map.time} onChange={(e) => setMap((m) => ({ ...m, time: e.target.value }))} className={select}>
                {file.cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {im.valueColumn}
              <select id="import-value" value={map.value} onChange={(e) => setMap((m) => ({ ...m, value: e.target.value }))} className={select}>
                {file.cols.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            {map.indicator === 'bp' && (
              <label className={label}>
                {im.value2Column}
                <select id="import-value2" value={map.value2 ?? ''} onChange={(e) => setMap((m) => ({ ...m, value2: e.target.value || undefined }))} className={select}>
                  {file.cols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              {im.dataset}
              <input id="import-dataset" required value={map.dataset} maxLength={80} onChange={(e) => setMap((m) => ({ ...m, dataset: e.target.value }))} className={field} aria-describedby="import-dataset-hint" />
              <span id="import-dataset-hint" className="mt-0.5 block text-[13px] font-normal text-ink-dim">
                {im.datasetHint}
              </span>
            </label>
            <label className={label}>
              {im.provider}
              <input id="import-provider" value={map.provider} maxLength={120} onChange={(e) => setMap((m) => ({ ...m, provider: e.target.value }))} className={field} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {im.url}
              <input id="import-url" type="url" inputMode="url" value={map.url} onChange={(e) => setMap((m) => ({ ...m, url: e.target.value }))} className={field} placeholder="https://" />
            </label>
          </div>
          <p className="text-[13.5px] text-ink-dim">
            {im.astronaut(CREW[astronaut].name)} · {im.by[profile.role] ?? profile.role}
          </p>
        </section>
      )}

      {step === 2 && file && (
        <section aria-labelledby="import-step-preview" className="flex flex-col gap-3">
          <h3 id="import-step-preview" ref={focusHeading} tabIndex={-1} className="text-[15px] font-semibold text-ink outline-none">
            {im.previewTitle}
          </h3>
          <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-left text-[14px]" data-import-preview>
              <thead>
                <tr className="border-b border-line text-ink-dim">
                  <th scope="col" className="px-3 py-1.5 font-medium">
                    {im.colTime}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {im.colRaw}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {im.colValue} ({resolve(ind.unit, lang)})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checks.slice(0, 10).map((c) => (
                  <tr key={c.line} className={c.ok ? '' : 'text-warn'}>
                    <td className="px-3 py-1.5">{fmtTime(c.t)}</td>
                    <td className="tabular px-3 py-1.5 text-right font-mono">{String(c.raw ?? '—')}</td>
                    <td className="tabular px-3 py-1.5 text-right font-mono">
                      {c.ok ? fmtV(c.v) : '—'}
                      {c.ok && c.v2 !== undefined && `/${fmtV(c.v2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[14.5px] text-ink" data-import-counts>
            <span className="text-ok">{im.valid(valid.length)}</span>
            {invalid.length > 0 && <span className="text-warn"> · {im.invalid(invalid.length)}</span>}
          </p>
          {invalid.length > 0 && (
            <ul className="space-y-0.5 text-[13.5px] text-ink-muted">
              {invalid.slice(0, 5).map((c) => (
                <li key={c.line}>
                  {im.row(c.line)}: {im.reasons[c.reason ?? 'value']}
                </li>
              ))}
            </ul>
          )}
          {times.length > 0 && <p className="text-[14px] text-ink-muted">{im.range(fmtTime(times[0]), fmtTime(times[times.length - 1]))}</p>}
        </section>
      )}

      {step > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <button type="button" onClick={() => setStep((s) => s - 1)} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-[14.5px] text-ink-muted hover:text-ink">
            <ChevronLeft size={15} aria-hidden />
            {im.back}
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={!map.dataset.trim() || !map.time || !map.value}
              onClick={() => {
                setError(null)
                setStep(2)
              }}
              className="min-h-10 rounded-xl bg-holo px-4 text-[14.5px] font-semibold text-void disabled:cursor-not-allowed disabled:opacity-40"
            >
              {im.next}
            </button>
          ) : (
            <button type="button" id="import-submit" disabled={busy || valid.length === 0} onClick={() => void submit()} className="min-h-10 rounded-xl bg-holo px-4 text-[14.5px] font-semibold text-void disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? im.importing : im.submit}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

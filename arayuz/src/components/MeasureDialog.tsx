import { Stethoscope } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { INDICATORS } from '../core/catalog'
import { num } from '../core/tx'
import { useHealth } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { Sheet } from './Sheet'

/** Sabah ölçümü: tansiyon ve açlık kan şekeri elle girilir (V-02: geçersiz değerler kabul edilmez) */
export function MeasureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { astronaut, mutate } = useHealth()
  const [sys, setSys] = useState('')
  const [dia, setDia] = useState('')
  const [glu, setGlu] = useState('')
  const [error, setError] = useState<string | null>(null)
  const parse = (s: string) => Number(s.replace(',', '.'))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!astronaut) return
    const a = await mutate('addMeasurement', astronaut, 'bp', parse(sys), parse(dia))
    if (!a?.ok) return setError(`${resolve(INDICATORS.bp.name, lang)}: ${t.drawer.invalid(`${INDICATORS.bp.valid[0]}/${INDICATORS.bp.valid2![0]}`, `${INDICATORS.bp.valid[1]}/${INDICATORS.bp.valid2![1]}`)}`)
    const b = await mutate('addMeasurement', astronaut, 'glucose', parse(glu))
    if (!b?.ok) return setError(`${resolve(INDICATORS.glucose.name, lang)}: ${t.drawer.invalid(num(INDICATORS.glucose.valid[0], lang), num(INDICATORS.glucose.valid[1], lang))}`)
    await mutate('setTaskDone', astronaut, 'measure', true)
    setSys('')
    setDia('')
    setGlu('')
    setError(null)
    onClose()
  }

  const field = 'h-11 w-full rounded-xl border border-line bg-base px-3 font-mono text-[16.5px] text-ink outline-none focus:border-holo/45'
  return (
    <Sheet open={open} onClose={onClose} title={t.measure.title} subtitle={t.measure.desc} closeLabel={t.measure.cancel} icon={<Stethoscope size={19} aria-hidden />} id="measure-dialog" width="w-[min(440px,100vw)]">
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="text-[14.5px] text-ink-muted">
            {t.measure.bp} · mmHg
          </legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <input aria-label={t.drawer.systolic} inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value)} required placeholder="118" className={field} />
            <input aria-label={t.drawer.diastolic} inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value)} required placeholder="76" className={field} />
          </div>
          <p className="mt-1 text-[13.5px] text-ink-dim">{resolve(INDICATORS.bp.range, lang)}</p>
        </fieldset>
        <label className="block">
          <span className="text-[14.5px] text-ink-muted">{t.measure.glucose} · mg/dL</span>
          <input inputMode="numeric" value={glu} onChange={(e) => setGlu(e.target.value)} required placeholder="88" className={`${field} mt-1.5`} />
          <span className="mt-1 block text-[13.5px] text-ink-dim">{resolve(INDICATORS.glucose.range, lang)}</span>
        </label>
        {error && (
          <p role="alert" className="text-[14.5px] text-warn">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="h-11 flex-1 rounded-xl bg-holo text-[15.5px] font-semibold text-void">
            {t.measure.save}
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-line-strong px-4 text-[15.5px] text-ink">
            {t.measure.cancel}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

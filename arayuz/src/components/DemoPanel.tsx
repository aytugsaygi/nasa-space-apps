import { RotateCcw, Zap } from 'lucide-react'
import { useId, useState } from 'react'
import type { RegionId, Side, Symptom } from '../core/model'
import { SCENARIO_GROUPS, SCENARIOS, type ScenarioId } from '../core/scenarios'
import { REGION_ORDER, useRegions } from '../data/regions'
import { resolve, useI18n } from '../i18n'

/** Demo menüsünden oluşturulan bölge sorunu: sisteme gerçek bir şikayet kaydı gibi girer */
export interface RegionProblem {
  region: RegionId
  side: Side
  symptom: Symptom
  severity: number
}

/** Sağı ve solu olan bölgeler */
const PAIRED: RegionId[] = ['ustKol', 'onKol', 'eller', 'bacaklar', 'ayaklar']
/** Demo menüsünde seçilebilecek sorunlar (kas ve kemik belirtileri) */
const PROBLEMS: Symptom[] = ['pain', 'cramp', 'numb', 'weak', 'impact', 'swelling', 'fracture', 'crack']

const field = 'h-9 w-full rounded-lg border border-line bg-base/70 px-2 text-[14.5px] text-ink outline-none focus:border-holo/45'

/**
 * Sunum için demo: seçilen bölgede seçilen sorunu oluşturma, tek tuşla tetiklenen hazır senaryolar ve
 * her şeyi başlangıç durumuna (bütün değerler normal) döndürme.
 */
export function DemoPanel({
  canEdit,
  onScenario,
  onRegionProblem,
  onReset,
}: {
  canEdit: boolean
  onScenario: (id: ScenarioId) => void
  onRegionProblem: (p: RegionProblem) => void
  onReset: () => void
}) {
  const { t, lang } = useI18n()
  const regions = useRegions()
  const id = useId()
  const [region, setRegion] = useState<RegionId>('bacaklar')
  const [side, setSide] = useState<Side>('right')
  const [symptom, setSymptom] = useState<Symptom>('pain')
  const [severity, setSeverity] = useState(7)
  const paired = PAIRED.includes(region)

  return (
    <div id="demo-panel" className="max-h-[min(70dvh,560px)] overflow-y-auto p-1">
      <p className="px-3 pt-2 pb-2 text-[14px] leading-snug text-ink-dim">{canEdit ? t.demo.hint : t.demo.readOnly}</p>

      {/* Bölgede sorun oluştur */}
      <section aria-labelledby={`${id}-region`} data-region-problem className="mx-1 mb-2 rounded-xl border border-line p-2.5">
        <p id={`${id}-region`} className="pb-2 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">
          {t.demo.regionTitle}
        </p>
        <div className="grid gap-2">
          <div className="grid gap-1">
            <label htmlFor={id + '-region-select'} className="text-[13.5px] text-ink-muted">
              {t.demo.region}
            </label>
            <select id={id + '-region-select'} value={region} disabled={!canEdit} onChange={(e) => setRegion(e.target.value as RegionId)} className={field}>
              {REGION_ORDER.map((r) => (
                <option key={r} value={r}>
                  {regions[r].name}
                </option>
              ))}
            </select>
          </div>
          {paired && (
            <div role="radiogroup" aria-label={t.demo.side} className="grid grid-cols-3 gap-1 rounded-lg border border-line p-0.5">
              {(['right', 'left', 'both'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={side === s}
                  disabled={!canEdit}
                  onClick={() => setSide(s)}
                  className="min-h-8 rounded-md text-[14px] text-ink-muted transition-colors aria-checked:bg-holo/12 aria-checked:text-holo enabled:hover:text-ink"
                >
                  {t.demo.sides[s]}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-1">
            <label htmlFor={id + '-problem-select'} className="text-[13.5px] text-ink-muted">
              {t.demo.problem}
            </label>
            <select id={id + '-problem-select'} value={symptom} disabled={!canEdit} onChange={(e) => setSymptom(e.target.value as Symptom)} className={field}>
              {PROBLEMS.map((s) => (
                <option key={s} value={s}>
                  {t.hologram.symptoms[s]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 text-[13.5px] text-ink-muted">
            <span className="shrink-0">{t.complaintSave.severity}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={severity}
              disabled={!canEdit}
              onChange={(e) => setSeverity(Number(e.target.value))}
              aria-valuetext={t.complaintSave.severityValue(severity)}
              className="min-w-0 flex-1 accent-[var(--color-holo)]"
            />
            <span className="tabular w-10 shrink-0 text-right font-mono text-ink">{t.complaintSave.severityValue(severity)}</span>
          </label>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onRegionProblem({ region, side: paired ? side : 'both', symptom, severity })}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-holo/12 px-3 text-[14.5px] font-semibold text-holo ring-1 ring-holo/35 transition-colors enabled:hover:bg-holo/20 disabled:opacity-45"
          >
            <Zap size={14} aria-hidden />
            {t.demo.create}
          </button>
        </div>
      </section>

      <p className="px-3 pt-2 pb-1 font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.demo.groupsTitle}</p>
      {SCENARIO_GROUPS.map((g) => (
        <div key={g.id} className="mb-1">
          <p className="px-3 pt-1.5 pb-0.5 text-[13px] text-ink-dim">{resolve(g.label, lang)}</p>
          {SCENARIOS.filter((s) => s.group === g.id).map((s) => (
            <button
              key={s.id}
              type="button"
              data-scenario={s.id}
              disabled={!canEdit}
              onClick={() => onScenario(s.id)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] text-ink transition-colors enabled:hover:bg-white/[0.04] disabled:opacity-45"
            >
              <span className="flex-1">{resolve(s.label, lang)}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="border-t border-line p-2">
        <button
          type="button"
          disabled={!canEdit}
          onClick={onReset}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-strong px-3 py-2 text-[14.5px] font-medium text-ink-muted transition-colors enabled:hover:border-warn/50 enabled:hover:text-warn disabled:opacity-45"
        >
          <RotateCcw size={14} aria-hidden />
          {t.demo.reset}
        </button>
        <p className="mt-2 px-1 text-center text-[13px] leading-snug text-ink-dim">{t.demo.resetHint}</p>
      </div>
    </div>
  )
}

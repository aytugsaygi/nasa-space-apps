import { ArrowUpRight } from 'lucide-react'
import { INDICATORS } from '../../core/catalog'
import { DECISIONS, NASA_DATASETS, nasaCounts, thresholdRows, type BasisKind } from '../../core/nasaMap'
import { SOURCES, type SourceId } from '../../core/sources'
import { resolve, useI18n } from '../../i18n'

/** Dayanak türünün çipi: NASA holo, tıbbi kaynak nötr, Health Atlas kuralı soluk (renk + yazı birlikte) */
const KIND_CLASS: Record<BasisKind, string> = {
  nasa: 'border-holo/40 bg-holo/10 text-holo',
  medical: 'border-line-strong bg-white/[0.03] text-ink',
  rule: 'border-line bg-transparent text-ink-dim',
}

function SourceLink({ id }: { id: SourceId }) {
  const { t } = useI18n()
  const s = SOURCES[id]
  return (
    <a href={s.url} target="_blank" rel="noreferrer" aria-label={t.sources.openLink(s.title)} className="inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-2 hover:text-holo">
      {s.title.split(':')[0].split(' (')[0]}
      <ArrowUpRight size={12} aria-hidden />
    </a>
  )
}

/**
 * "NASA verisi nerede karar veriyor?": eşik satırları gösterge kataloğundan, sayılar koddan üretilir (core/nasaMap.ts).
 */
export function NasaDataTab() {
  const { t, lang } = useI18n()
  const n = t.about.nasa
  const c = nasaCounts()

  return (
    <div className="space-y-6" data-nasa-map>
      <div>
        <h3 className="font-display text-[19px] font-semibold">{n.title}</h3>
        <p className="mt-2 rounded-xl border border-holo/25 bg-holo/[0.05] px-3 py-2 text-[15px] text-ink" data-nasa-summary>
          {n.summary(c.sources, c.nasaSources, c.nasaIndicators, c.indicators, NASA_DATASETS.length)}
        </p>
      </div>

      <section aria-labelledby="nasa-thresholds">
        <h4 id="nasa-thresholds" className="font-mono text-[13.5px] font-semibold tracking-[0.07em] text-ink-dim uppercase">
          {n.thresholds}
        </h4>
        <p className="mt-1 text-[14.5px] text-ink-muted">{n.thresholdsDesc}</p>
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
          {thresholdRows().map((r) => (
            <li key={r.indicator} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-4 py-3" data-threshold-row={r.indicator}>
              <p className="w-36 shrink-0 text-[15.5px] font-medium text-ink">{resolve(INDICATORS[r.indicator].name, lang)}</p>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {r.groups.map((g) => (
                  <p key={g.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-muted">
                    <span className={`rounded-md border px-1.5 py-px text-[12.5px] font-semibold ${KIND_CLASS[g.kind]}`} data-kind={g.kind}>
                      {n.kinds[g.kind]}
                    </span>
                    <span>{n.bands(g.bands)}</span>
                    {g.sources.map((s, i) => (
                      <span key={s}>
                        {i > 0 && '· '}
                        <SourceLink id={s} />
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[14px] text-ink-dim">{n.ruleNote}</p>
      </section>

      <section aria-labelledby="nasa-decisions">
        <h4 id="nasa-decisions" className="font-mono text-[13.5px] font-semibold tracking-[0.07em] text-ink-dim uppercase">
          {n.decisions}
        </h4>
        <ul className="mt-2 space-y-2">
          {DECISIONS.map((d) => (
            <li key={d.id} className="rounded-xl border border-line bg-white/[0.015] p-3" data-decision={d.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15.5px] font-medium text-ink">{resolve(d.what, lang)}</p>
                <span className={`rounded-md border px-1.5 py-px text-[12.5px] font-semibold ${d.type === 'decision' ? KIND_CLASS.nasa : KIND_CLASS.rule}`}>
                  {d.type === 'decision' ? n.decision : n.experience}
                </span>
              </div>
              <dl className="mt-1.5 grid gap-x-3 gap-y-0.5 text-[14px] sm:grid-cols-[auto_1fr]">
                <dt className="text-ink-dim">{n.cols.where}</dt>
                <dd className="text-ink-muted">{resolve(d.where, lang)}</dd>
                <dt className="text-ink-dim">{n.cols.data}</dt>
                <dd className="text-ink-muted">{resolve(d.data, lang)}</dd>
                <dt className="text-ink-dim">{n.cols.source}</dt>
                <dd className="flex flex-wrap gap-x-2 text-ink-muted">
                  {d.sources.map((s) => (
                    <SourceLink key={s} id={s} />
                  ))}
                  {d.links?.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-2 hover:text-holo">
                      {l.label}
                      <ArrowUpRight size={12} aria-hidden />
                    </a>
                  ))}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

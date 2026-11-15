import { ArrowUpRight } from 'lucide-react'
import { SOURCES, type SourceId } from '../../core/sources'
import { useI18n } from '../../i18n'

/** Maliyet tablosundaki satırların doğrulanmış kaynakları (satır sırasıyla; metinler i18n'de) */
const ROW_SOURCES: SourceId[][] = [[], ['csaBioMonitor'], [], ['donki', 'epic', 'osd569', 'osd575'], [], [], []]

function Links({ ids }: { ids: SourceId[] }) {
  const { t } = useI18n()
  return (
    <>
      {ids.map((id) => (
        <a
          key={id}
          href={SOURCES[id].url}
          target="_blank"
          rel="noreferrer"
          aria-label={t.sources.openLink(SOURCES[id].title)}
          className="mr-2 inline-flex items-center gap-0.5 underline decoration-line-strong underline-offset-2 hover:text-holo"
        >
          {SOURCES[id].title.split(':')[0].split(' (')[0]}
          <ArrowUpRight size={12} aria-hidden />
        </a>
      ))}
    </>
  )
}

/** Fizibilite ve maliyet: rakam uydurulmaz; kalemler nitel, her satırın dayanağı yazılı */
export function FeasibilityTab() {
  const { t } = useI18n()
  const f = t.about.feasibility
  return (
    <div className="space-y-6" data-feasibility>
      <p className="rounded-xl border border-holo/25 bg-holo/[0.05] px-3 py-2 text-[15.5px] leading-relaxed text-ink">{f.lead}</p>

      <div className="scroll-thin overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-ink-dim">
              {[f.cols.item, f.cols.today, f.cols.real, f.cols.basis].map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-mono text-[12.5px] font-semibold tracking-[0.06em] uppercase">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {f.rows.map((r, i) => (
              <tr key={r.item} className="align-top">
                <th scope="row" className="px-3 py-2.5 text-[14.5px] font-medium text-ink">
                  {r.item}
                </th>
                <td className="px-3 py-2.5 text-ink-muted">{r.today}</td>
                <td className="px-3 py-2.5 text-ink-muted">{r.real}</td>
                <td className="px-3 py-2.5 text-ink-dim">{ROW_SOURCES[i]?.length ? <Links ids={ROW_SOURCES[i]} /> : r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-line bg-white/[0.015] p-3">
        <h3 className="text-[15.5px] font-semibold text-ink">{f.funding}</h3>
        <p className="mt-1 text-[14.5px] leading-relaxed text-ink-muted">{f.fundingText}</p>
        <p className="mt-1.5 text-[13.5px] text-ink-dim">
          <Links ids={['hrpRisks', 'csaBioMonitor']} />
        </p>
      </section>

      <section className="rounded-xl border border-line bg-white/[0.015] p-3">
        <h3 className="text-[15.5px] font-semibold text-ink">{f.sustain}</h3>
        <ul className="mt-1.5 space-y-1">
          {f.sustainItems.map((s, i) => (
            <li key={s} className="flex gap-2 text-[14.5px] leading-snug text-ink-muted">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-holo" aria-hidden />
              <span>
                {s} {i === 2 && <Links ids={['hrpIsolation']} />}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[14px] leading-relaxed text-ink-dim">{f.honesty}</p>
    </div>
  )
}

import { useI18n } from '../../i18n'

/**
 * Son tam test çalıştırmasının sayıları (npm test ve npm run test:e2e çıktısından; atlanan testler sayılmaz).
 * Test eklenince ya da çıkarılınca bu sayılar güncellenir.
 */
export const TEST_COUNTS = { unit: 463, e2e: 111 }

/** Sınırlar ve yol haritası: eksikler saklanmaz; her birinin gerçek kullanımda neye dönüşeceği ve bugün hazır olan kısmı */
export function RoadmapTab() {
  const { t } = useI18n()
  const r = t.about.roadmap
  return (
    <div className="space-y-6" data-roadmap>
      <div>
        <h3 className="font-display text-[19px] font-semibold">{r.title}</h3>
        <p className="mt-1 text-[14.5px] text-ink-muted">{r.desc}</p>
      </div>
      <div className="scroll-thin overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-ink-dim">
              {[r.cols.today, r.cols.real, r.cols.ready].map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-mono text-[12.5px] font-semibold tracking-[0.06em] uppercase">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.rows.map((row, i) => (
              <tr key={row.today} className="align-top">
                <th scope="row" className="px-3 py-2.5 text-[14.5px] font-medium text-ink">
                  {row.today}
                </th>
                <td className="px-3 py-2.5 text-ink-muted">{row.real}</td>
                <td className="px-3 py-2.5 text-ink-muted">{i === r.rows.length - 1 ? `${row.ready}: ${r.tests(TEST_COUNTS.unit, TEST_COUNTS.e2e)}` : row.ready}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="rounded-xl border border-line bg-white/[0.015] p-3">
        <h3 className="text-[15.5px] font-semibold text-ink">{r.steps}</h3>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[14.5px] leading-snug text-ink-muted marker:text-holo">
          {r.stepItems.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}

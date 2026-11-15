import type { PointSource } from '../core/sim'
import type { Dict } from '../i18n/tr'

/** Bir ölçümün nereden geldiği (VM-03, VM-04): simülasyon, elle giriş, sensör, demo senaryosu ya da içe aktarılan veri seti */
export type DataOrigin = 'sim' | 'manual' | 'sensor' | 'demo' | 'import'

export function originOf(source: PointSource | null | undefined): DataOrigin {
  if (!source || source === 'sim') return 'sim'
  if (source === 'manual' || source === 'sensor' || source === 'demo') return source
  return 'import'
}

/** Kaynağın arayüzdeki adı: "Simülasyon (kurgusal)", "Elle girildi", "İçe aktarıldı: NASA ..." */
export function sourceLabel(source: PointSource | null | undefined, t: Dict): string {
  const o = originOf(source)
  if (o === 'sim') return `${t.vital.sourceSim} (${t.vital.fictional})`
  if (o === 'manual') return t.vital.sourceManual
  if (o === 'sensor') return t.vital.sourceSensor
  if (o === 'demo') return t.vital.sourceDemo
  return t.vital.sourceImport(String(source).slice('import:'.length))
}

/** Bir dönemdeki değerlerin kaynaklara göre sayısı (grafiğin altında gösterilir) */
export function originCounts(points: { source?: PointSource }[]): Partial<Record<DataOrigin, number>> {
  const out: Partial<Record<DataOrigin, number>> = {}
  for (const p of points) {
    const o = originOf(p.source)
    out[o] = (out[o] ?? 0) + 1
  }
  return out
}

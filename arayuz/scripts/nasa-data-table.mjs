// Teslim formunun "NASA Data" alanı için İngilizce metni koddan üretir: hangi NASA verisi uygulamada hangi kararı veriyor.
// Kaynak: src/core/nasaMap.ts (gösterge kataloğu ve doğrulanmış kaynaklar). Elle düzenlenmez; katalog değişince yeniden çalıştırılır.
// Kullanım (arayuz klasöründe): node scripts/nasa-data-table.mjs > ../submission/nasa-data.md
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const map = await vite.ssrLoadModule('/src/core/nasaMap.ts')
  const { INDICATORS } = await vite.ssrLoadModule('/src/core/catalog.ts')
  const { SOURCES } = await vite.ssrLoadModule('/src/core/sources.ts')
  const c = map.nasaCounts()
  const link = (id) => `[${SOURCES[id].title.split(':')[0].split(' (')[0]}](${SOURCES[id].url})`
  const kind = { nasa: 'NASA document', medical: 'Medical source', rule: 'Health Atlas rule (no threshold in the source)' }
  const out = []
  out.push('# NASA data in Health Atlas')
  out.push('')
  out.push('_Generated from the code by `arayuz/scripts/nasa-data-table.mjs`; do not edit by hand._')
  out.push('')
  out.push(
    `Health Atlas uses ${c.sources} verified sources, ${c.nasaSources} of them from NASA. In ${c.nasaIndicators} of its ${c.indicators} health indicators at least one status threshold comes from a NASA document (${c.nasaBands} of ${c.bands} threshold bands). It reads ${map.NASA_DATASETS.length} NASA datasets: DONKI and EPIC live (with an embedded snapshot when offline) and two OSDR studies.`,
  )
  out.push('')
  out.push('## Decisions driven by NASA data')
  out.push('')
  out.push('| Decision | Where in the app | NASA data | Source |')
  out.push('|---|---|---|---|')
  for (const d of map.DECISIONS.filter((d) => d.type === 'decision')) {
    out.push(`| ${d.what.en} | ${d.where.en} | ${d.data.en} | ${[...d.sources.map(link), ...(d.links ?? []).map((l) => `[${l.label}](${l.url})`)].join(', ')} |`)
  }
  out.push('')
  out.push('## Indicator thresholds')
  out.push('')
  out.push('| Indicator | Basis of the status bands |')
  out.push('|---|---|')
  for (const r of map.thresholdRows()) {
    const parts = r.groups.map((g) => `${kind[g.kind]}: ${g.bands} band${g.bands === 1 ? '' : 's'}${g.sources.length ? ` (${g.sources.map(link).join(', ')})` : ''}`)
    out.push(`| ${INDICATORS[r.indicator].name.en} | ${parts.join('; ')} |`)
  }
  out.push('')
  out.push('## Experience (no decisions)')
  out.push('')
  for (const d of map.DECISIONS.filter((d) => d.type === 'experience')) {
    out.push(`- ${d.what.en} (${d.where.en}): ${[...d.sources.map(link), ...(d.links ?? []).map((l) => `[${l.label}](${l.url})`)].join(', ')}`)
  }
  out.push('')
  console.log(out.join('\n'))
} finally {
  await vite.close()
}

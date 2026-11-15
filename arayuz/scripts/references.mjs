// Teslim formunun "References" alanı için İngilizce kaynak listesini koddan üretir: uygulamadaki Kaynaklar penceresiyle birebir aynı.
// Kaynak: src/data/content.ts (sourceGroups) ve src/core/sources.ts. Elle düzenlenmez; kaynak eklenince yeniden çalıştırılır.
// Kullanım (arayuz klasöründe): npm run references
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { sourceGroups } = await vite.ssrLoadModule('/src/data/content.ts')
  const groups = sourceGroups('en')
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const out = []
  out.push('# References')
  out.push('')
  out.push('_Generated from the code by `arayuz/scripts/references.mjs`; do not edit by hand. The same list is shown in the app (Sources dialog)._')
  out.push('')
  out.push(`${total} entries in ${groups.length} groups: the verified sources behind every number, threshold and claim in the app, the NASA data it reads, the software, models, images and fonts it uses, and the use of Super Intelligence (SI).`)
  for (const g of groups) {
    out.push('')
    out.push(`## ${g.group}`)
    out.push('')
    for (const it of g.items) out.push(`- ${it.url ? `[${it.name}](${it.url})` : it.name}. ${it.note}`)
  }
  out.push('')
  console.log(out.join('\n'))
} finally {
  await vite.close()
}

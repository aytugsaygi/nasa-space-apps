import { isNasaSource } from '../core/nasaMap'
import type { SourceId } from '../core/sources'
import { useI18n } from '../i18n'

/**
 * Kaynağı NASA belgesi ya da NASA verisi olan bilgilerin yanındaki küçük yazı rozeti. NASA logosu DEĞİLDİR (yarışma
 * kuralı: logo, "meatball" ve arma kullanılmaz); yalnızca "NASA" yazısı. Kaynak NASA'nın değilse hiçbir şey çizilmez.
 */
export function NasaBadge({ source }: { source: SourceId | 'vitalis' | undefined }) {
  const { t } = useI18n()
  if (!source || source === 'vitalis' || !isNasaSource(source)) return null
  return (
    <span title={t.badge.nasaTitle} data-nasa-badge className="ml-1.5 inline-flex items-center rounded-md bg-holo/10 px-1.5 py-px align-middle font-mono text-[11.5px] font-semibold tracking-[0.06em] text-holo no-underline">
      {t.badge.nasa}
    </span>
  )
}

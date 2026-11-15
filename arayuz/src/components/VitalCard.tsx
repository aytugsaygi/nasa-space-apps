import type { CSSProperties } from 'react'
import { INDICATORS, MAIN_INDICATORS, type IndicatorId } from '../core/catalog'
import type { IndicatorState, Snapshot } from '../core/model'
import { num } from '../core/tx'
import { useHealth } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { sourceLabel } from '../lib/dataSource'
import { INDICATOR_ICONS } from '../lib/icons'
import { indicatorColor, isLiveIndicator } from '../lib/indicatorColors'
import { STATUS_META } from '../lib/status'
import { MiniTrend } from './MiniTrend'
import { Tooltip } from './Tooltip'

/** Göstergenin değerini dile göre biçimler (tansiyonda "118/76") */
export function formatValue(id: IndicatorId, s: Pick<IndicatorState, 'value' | 'value2'>, lang: 'tr' | 'en'): string {
  if (s.value === null) return '—'
  const d = INDICATORS[id].digits
  if (s.value2 !== undefined) return `${num(s.value, lang, d)}/${num(s.value2, lang, d)}`
  return num(s.value, lang, d)
}

/** Kartın altındaki satır: referans aralığı (radyasyonda kariyer oranı da) */
function subLine(id: IndicatorId, snapshot: Snapshot | null, t: ReturnType<typeof useI18n>['t'], lang: 'tr' | 'en') {
  return id === 'radiation' && snapshot
    ? `${t.vital.career(num(snapshot.dose.percent, lang, 0))} · ${num(snapshot.dose.totalMsv, lang, 0)}/600 mSv`
    : resolve(INDICATORS[id].range, lang)
}

/**
 * Gösterge kartının açıklaması (VM-04): kısalabilen referans satırı tam haliyle, göstergenin uzaydaki anlamı ve değerin
 * kaynağı. Bölümün üst kenarındaki ⓘ düğmesinde gösterilir (diğer bölümlerle aynı; kartın üzerinde beklemek açmaz).
 */
export function VitalInfo({ id }: { id: IndicatorId }) {
  const { t, lang } = useI18n()
  const { snapshot } = useHealth()
  const state = snapshot?.indicators[id as keyof Snapshot['indicators']] as IndicatorState | undefined
  const space = resolve(INDICATORS[id].space, lang)
  return (
    <>
      <span className="mb-1 block font-medium text-ink">{subLine(id, snapshot, t, lang)}</span>
      {state ? `${space} ${t.vital.dataTip(sourceLabel(state.source, t))}` : space}
    </>
  )
}

/**
 * Tek bir göstergenin kartı: değer, birim, durum (renk + simge + yazı), altında referans aralığı, sağında hareketli
 * mini grafik. Her kartın kendi rengi vardır (kenar ışığı, simge, parıltı, grafik).
 * Karta basınca göstergenin ayrıntısı açılır; mini grafiğe basınca sağlık kayıtlarındaki ayrıntılı grafiğe gidilir.
 * İki düğme iç içe değil yan yanadır: grafik düğmesi kartın sağ altına, kart düğmesinin üstüne yerleşir.
 */
export function VitalCard({
  id,
  state,
  snapshot,
  onOpen,
  onChart,
}: {
  id: IndicatorId
  state: IndicatorState | undefined
  snapshot: Snapshot | null
  onOpen: (id: IndicatorId) => void
  /** Mini grafiğe basınca (verilmezse grafik yalnızca görseldir) */
  onChart?: (id: IndicatorId) => void
}) {
  const { t, lang } = useI18n()
  const ind = INDICATORS[id]
  const Icon = INDICATOR_ICONS[id]
  const status = state?.status ?? 'normal'
  const st = STATUS_META[status]
  const StIcon = st.icon
  const name = resolve(ind.name, lang)
  const loading = !state
  const value = state ? formatValue(id, state, lang) : '—'
  const sub = subLine(id, snapshot, t, lang)
  const chartTitle = t.trendChart.title(name, isLiveIndicator(id))

  return (
    <div
      data-vital-card
      data-indicator={id}
      data-status={status}
      // Durum normal değilse kart, kendi rengi yerine durum rengiyle parlar; grafik ışıkları kartlar arasında sırayla dolaşır
      style={{ '--accent': status === 'normal' ? indicatorColor(id) : st.hex, '--scan-delay': `${-((MAIN_INDICATORS as readonly IndicatorId[]).indexOf(id) * 0.47).toFixed(2)}s` } as CSSProperties}
      className={`panel vital-card @container relative size-full !rounded-2xl transition-colors ${
        status !== 'normal' ? `ring-1 ${st.ring}` : 'hover:border-line-strong'
      }`}
    >
      {/* Açıklama (aralık, uzaydaki anlamı, kaynak) kartın üst kenarındaki ⓘ düğmesindedir: VitalInfo */}
      <button
          type="button"
          onClick={() => onOpen(id)}
          aria-label={`${name}: ${value} ${resolve(ind.unit, lang)}, ${t.status[status]}. ${t.vital.open(name)}`}
          className="relative z-[1] flex size-full flex-col justify-between gap-0.5 rounded-2xl px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-holo/60"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-[14.5px] text-ink-muted">
              <Icon size={15} className="vital-icon shrink-0" aria-hidden />
              <span className="truncate">{name}</span>
            </span>
            <span data-volatile className={`flex shrink-0 items-center gap-1 text-[13.5px] font-medium ${st.text}`}>
              <StIcon size={13} aria-hidden />
              <span className="sr-only @min-[12.5rem]:not-sr-only">{loading ? t.vital.loading : t.status[status]}</span>
            </span>
          </span>
          {/* Solda değer ve referans aralığı; sağda grafiğin yeri ayrılır (dar kartta grafik gizlenir) */}
          <span className="flex min-h-0 items-end gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span data-volatile className="flex items-baseline gap-1.5 leading-none">
                <span className="tabular font-mono text-[25px] font-semibold tracking-tight text-ink">{value}</span>
                <span className="text-[14px] text-ink-dim">{resolve(ind.unit, lang)}</span>
              </span>
              {/* Dar kartta (telefon) referans aralığı iki satıra iner; geniş kartta tek satır */}
              <span data-volatile className="truncate text-[13px] leading-tight text-ink-dim @max-[17rem]:line-clamp-2 @max-[17rem]:whitespace-normal">
                {sub}
              </span>
            </span>
            <span className="hidden h-11 w-[42%] shrink-0 @min-[17rem]:block" aria-hidden />
          </span>
        </button>
      {/* Mini grafik: kart düğmesinin üstünde, ayrılan yerde; kendi ipucu ve kendi hedefi vardır */}
      <span data-volatile className="absolute right-4 bottom-2.5 z-[2] hidden h-11 w-[42%] @min-[17rem]:block">
        {onChart ? (
          <Tooltip
            label={
              <>
                <span className="block font-semibold text-ink">{chartTitle}</span>
                {t.trendChart.more}
              </>
            }
            side="bottom"
            align="end"
            className="size-full"
          >
            <button
              type="button"
              data-trend-link={id}
              onClick={() => onChart(id)}
              aria-label={`${chartTitle}. ${t.trendChart.more}`}
              className="trend-button size-full cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-holo/60"
            >
              <MiniTrend id={id} status={status} />
            </button>
          </Tooltip>
        ) : (
          <MiniTrend id={id} status={status} />
        )}
      </span>
    </div>
  )
}

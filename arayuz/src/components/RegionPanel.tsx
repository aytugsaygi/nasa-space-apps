import { ArrowUpRight, ChevronDown, ExternalLink, MessageCircleHeart, RefreshCw, Telescope, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import {
  LAYER_ORDER,
  structureInfo,
  useAnatomyNames,
  useLayers,
  type LayerId,
  type StructureInfo,
  type StructureLayer,
  type StructureRef,
} from '../data/anatomy'
import { REGION_ORDER, useRegions } from '../data/regions'
import { useHealth } from '../data/health'
import { SPACE_FACTS } from '../data/spaceFacts'
import { DAY } from '../core/crew'
import type { RegionId, Status } from '../data/types'
import { INDICATORS, INDICATOR_IDS, type IndicatorId } from '../core/catalog'
import { bodyPart } from '../core/coach'
import type { ComplaintDoc, Finding, Snapshot } from '../core/model'
import { SOURCES } from '../core/sources'
import { resolve, useI18n } from '../i18n'
import { formatValue } from './VitalCard'
import type { StructureQuestion } from '../lib/assistant'
import { ALERT_META, STATUS_META } from '../lib/status'
import { Sparkline } from './Sparkline'
import { Tooltip } from './Tooltip'

interface Props {
  selected: RegionId | null
  statuses: Record<RegionId, Status>
  findings: Finding[]
  complaints: ComplaintDoc[]
  snapshot: Snapshot | null
  onOpenIndicator: (id: IndicatorId) => void
  buzzKey: number
  vibration: boolean
  exploded: boolean
  selectedStructure: StructureRef | null
  onSelect: (id: RegionId | null) => void
  onStructureClose: () => void
  onFocusLayer: (layer: LayerId) => void
  onAsk: (question: string, structure?: StructureQuestion) => void
}

const ease = [0.22, 1, 0.36, 1] as const
const slide = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12, transition: { duration: 0.14 } },
  transition: { duration: 0.32, ease },
  className: 'flex min-h-0 flex-1 flex-col',
}

export function RegionPanel({
  selected,
  statuses,
  findings,
  complaints,
  snapshot,
  onOpenIndicator,
  buzzKey,
  vibration,
  exploded,
  selectedStructure,
  onSelect,
  onStructureClose,
  onFocusLayer,
  onAsk,
}: Props) {
  const { lang, t } = useI18n()
  /* Veri servisten geliyormuş gibi kısa bir yükleniyor görünümü */
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!selected) return
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 420)
    return () => clearTimeout(timer)
  }, [selected])
  const names = useAnatomyNames()
  const structure = structureInfo(names, selectedStructure, lang)

  const view = structure && selectedStructure ? 'structure' : selected ? 'region' : exploded ? 'layers' : 'overview'
  const key = view === 'structure' ? `s-${selectedStructure!.layer}-${selectedStructure!.id}` : view === 'region' ? selected! : view

  return (
    <section id="tour-panel" aria-label={t.panel.label} aria-live="polite" className="panel relative flex h-full min-h-0 flex-col overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={key} {...slide}>
          {view === 'structure' ? (
            <StructureCard
              layer={selectedStructure!.layer}
              info={structure!}
              status={statuses[structure!.region]}
              onClose={onStructureClose}
              onOpenRegion={() => onSelect(structure!.region)}
              onAsk={() =>
                onAsk(t.panel.askStructure(structure!.name), {
                  name: structure!.name,
                  layer: selectedStructure!.layer,
                  region: structure!.region,
                  symptom: null,
                })
              }
            />
          ) : view === 'region' ? (
            loading ? (
              <CardSkeleton />
            ) : (
              <RegionCard
                id={selected!}
                status={statuses[selected!]}
                findings={findings.filter((f) => f.region === selected)}
                complaints={complaints.filter((c) => c.region === selected && c.status !== 'resolved')}
                snapshot={snapshot}
                onOpenIndicator={onOpenIndicator}
                buzzKey={buzzKey}
                vibration={vibration}
                onClose={() => onSelect(null)}
                onAsk={onAsk}
              />
            )
          ) : view === 'layers' ? (
            <LayerOverview onFocusLayer={onFocusLayer} />
          ) : (
            <Overview statuses={statuses} findings={findings} complaints={complaints} onSelect={onSelect} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function LayerOverview({ onFocusLayer }: { onFocusLayer: (layer: LayerId) => void }) {
  const { t } = useI18n()
  const names = useAnatomyNames()
  const layers = useLayers()
  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-5 sm:p-6">
      <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.panel.layersEyebrow}</p>
      <h2 className="mt-2 font-display text-[22px] leading-tight font-semibold tracking-tight text-balance">{t.panel.layersHeading}</h2>
      <p className="mt-1 text-[16.5px] text-ink-muted">{t.panel.layersDesc}</p>
      <ul className="mt-6 space-y-2">
        {LAYER_ORDER.map((l) => (
          <li key={l}>
            <button
              type="button"
              onClick={() => onFocusLayer(l)}
              className="group w-full rounded-xl border border-line bg-white/[0.015] p-3.5 text-left transition-colors hover:border-line-strong hover:bg-white/[0.03]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{layers[l].name}</span>
                <span className="flex items-center gap-2">
                  {names && <span className="font-mono text-[13.5px] text-ink-dim">{t.panel.structures(names[l].length)}</span>}
                  <ArrowUpRight size={16} className="text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </span>
              </span>
              <span className="mt-1 block text-[15px] leading-snug text-ink-muted">{layers[l].note}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-auto pt-6 text-[14px] leading-snug text-ink-dim">{t.panel.modelNote}</p>
    </div>
  )
}

function StructureCard({
  layer,
  info,
  status,
  onClose,
  onOpenRegion,
  onAsk,
}: {
  layer: StructureLayer
  info: StructureInfo
  status: Status
  onClose: () => void
  onOpenRegion: () => void
  onAsk: () => void
}) {
  const { t } = useI18n()
  const regions = useRegions()
  const st = STATUS_META[status]
  const StIcon = st.icon
  const meta = useLayers()[layer]
  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{meta.name}</p>
          <h2 className="mt-1 font-display text-[24px] leading-tight font-semibold tracking-tight text-balance">{info.name}</h2>
          {info.latin && (
            <p lang="la" className="mt-1 text-[15.5px] text-ink-muted italic">
              {info.latin}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.panel.close}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-white/[0.015] p-3">
          <dt className="text-[14px] text-ink-dim">{t.panel.region}</dt>
          <dd className="mt-1 font-medium">{regions[info.region].name}</dd>
        </div>
        <div className="rounded-xl border border-line bg-white/[0.015] p-3">
          <dt className="text-[14px] text-ink-dim">{t.panel.regionStatus}</dt>
          <dd className={`mt-1 flex items-center gap-1.5 font-medium ${st.text}`}>
            <StIcon size={15} aria-hidden />
            {t.status[status]}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-xl bg-holo/[0.06] px-4 py-3 text-[16px] leading-relaxed">
        <p className="font-medium text-holo">{t.panel.inSpace}</p>
        <p className="mt-1 text-ink-muted">{meta.note}</p>
      </div>

      <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">{regions[info.region].summary}</p>

      <button
        type="button"
        onClick={onOpenRegion}
        className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15"
      >
        {t.panel.openRegion(regions[info.region].name)}
        <ArrowUpRight size={16} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onAsk}
        className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <MessageCircleHeart size={17} aria-hidden />
        {t.panel.ask}
      </button>

      <p className="mt-auto pt-6 text-[14px] leading-snug text-ink-dim">
        {t.panel.nameSource}{' '}
        <a href={meta.source.url} target="_blank" rel="noreferrer" className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-holo">
          {meta.source.label}
        </a>{' '}
        · {t.panel.noDiagnosis}
      </p>
    </div>
  )
}

function Overview({ statuses, findings, complaints, onSelect }: { statuses: Record<RegionId, Status>; findings: Finding[]; complaints: ComplaintDoc[]; onSelect: (id: RegionId) => void }) {
  const { t, lang } = useI18n()
  /** Bölgenin neden işaretlendiği: en önemli uyarı ya da şikayet; yoksa bölgenin genel özeti */
  const reasonFor = (id: RegionId) => {
    const f = findings.find((x) => x.region === id && x.level !== 'bilgi')
    if (f) return resolve(f.title, lang)
    const c = complaints.find((x) => x.region === id && x.status !== 'resolved')
    if (c) return `${t.hologram.symptoms[c.symptom]} · ${resolve(bodyPart(c.region, c.side), lang)} · ${c.severity}/10`
    return regions[id].summary
  }
  const regions = useRegions()
  const flagged = REGION_ORDER.filter((r) => statuses[r] !== 'normal').sort((a, b) => (statuses[a] === 'kritik' ? -1 : statuses[b] === 'kritik' ? 1 : 0))
  const normal = REGION_ORDER.filter((r) => statuses[r] === 'normal')
  const overall: Status = flagged.some((r) => statuses[r] === 'kritik') ? 'kritik' : flagged.length ? 'dikkat' : 'normal'
  const o = STATUS_META[overall]
  const OIcon = o.icon

  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-5 sm:p-6">
      <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.panel.overviewTitle}</p>
      <div className="mt-3 flex items-start gap-3">
        <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${o.bg} ${o.text}`}>
          <OIcon size={20} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-[22px] leading-tight font-semibold tracking-tight text-balance">
            {overall === 'normal' ? t.panel.allGood : overall === 'kritik' ? t.panel.criticalRegion : t.panel.flagged(flagged.length)}
          </h2>
          <p className="mt-1 text-[16.5px] text-ink-muted">{t.panel.normalCount(normal.length, REGION_ORDER.length)}</p>
        </div>
      </div>

      {flagged.length > 0 && (
        <ul className="mt-6 space-y-2">
          {flagged.map((id) => {
            const st = STATUS_META[statuses[id]]
            const Icon = st.icon
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5 text-left ring-1 ring-transparent transition-colors hover:border-line-strong hover:bg-white/[0.03]"
                >
                  <Icon size={18} className={`shrink-0 ${st.text}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{regions[id].name}</span>
                      <span className={`text-[13.5px] font-medium ${st.text}`}>{t.status[statuses[id]]}</span>
                    </span>
                    <span className="mt-0.5 block text-[15px] leading-snug text-ink-muted">{reasonFor(id)}</span>
                  </span>
                  <ArrowUpRight size={17} className="shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Her şey yolundayken boş kalan alanda uzaya dair günün bilgisi */}
      {overall === 'normal' && <DailyFact />}
    </div>
  )
}

/**
 * Günün bilgisi: doğrulanmış NASA sayfalarından alınan uzay bilgisi (data/spaceFacts.ts). Her gün bir sonraki bilgi
 * gelir; "Başka bir bilgi" ile sıradakine geçilir. Her bilginin altında kaynağı yazar.
 */
function DailyFact() {
  const { t, lang } = useI18n()
  const { snapshot } = useHealth()
  const [offset, setOffset] = useState(0)
  const day = Math.floor((snapshot?.now ?? 0) / DAY)
  const fact = SPACE_FACTS[(((day + offset) % SPACE_FACTS.length) + SPACE_FACTS.length) % SPACE_FACTS.length]
  const src = SOURCES[fact.source]
  return (
    <section aria-labelledby="daily-fact-title" className="mt-6 flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-white/[0.015] p-5" data-daily-fact>
      <header className="flex items-center justify-between gap-3">
        <h3 id="daily-fact-title" className="flex items-center gap-2.5 font-display text-[18px] font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">
            <Telescope size={18} aria-hidden />
          </span>
          {t.dailyFact.title}
        </h3>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
        >
          <RefreshCw size={14} aria-hidden />
          {t.dailyFact.next}
        </button>
      </header>
      <p key={`${day}-${offset}`} aria-live="polite" className="tool-info my-auto py-5 font-display text-[21px] leading-relaxed font-medium text-ink text-pretty">
        {resolve(fact.text, lang)}
      </p>
      <a
        href={src.url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 text-[14px] text-ink-dim transition-colors hover:text-holo"
      >
        <ExternalLink size={13} className="shrink-0" aria-hidden />
        {t.dailyFact.source(`${src.org} · ${src.title}`)}
      </a>
    </section>
  )
}

function RegionCard({
  id,
  status,
  findings,
  complaints,
  snapshot,
  onOpenIndicator,
  buzzKey,
  vibration,
  onClose,
  onAsk,
}: {
  id: RegionId
  status: Status
  findings: Finding[]
  complaints: ComplaintDoc[]
  snapshot: Snapshot | null
  onOpenIndicator: (id: IndicatorId) => void
  buzzKey: number
  vibration: boolean
  onClose: () => void
  onAsk: (q: string) => void
}) {
  const { t, lang, locale } = useI18n()
  const r = useRegions()[id]
  const live = INDICATOR_IDS.filter((i) => INDICATORS[i].region === id)
  const st = STATUS_META[status]
  const StIcon = st.icon
  const [open, setOpen] = useState(false)

  return (
    <div className="scroll-thin flex flex-1 flex-col overflow-x-hidden overflow-y-auto p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.panel.region}</p>
          <h2 className="mt-1 font-display text-[26px] leading-tight font-semibold tracking-tight">{r.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.panel.close}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>

      <div className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[14.5px] font-medium ring-1 ${st.bg} ${st.text} ${st.ring}`}>
        <StIcon size={14} aria-hidden />
        {t.status[status]}
      </div>

      {findings.map((f) => {
        const Icon = ALERT_META[f.level].icon
        const src = f.sources.find((x) => x !== 'vitalis')
        return (
          <div key={`${f.key}-${buzzKey}`} role="alert" className={`mt-4 flex gap-3 rounded-xl border p-3.5 ${f.level === 'kritik' ? 'border-crit/40 bg-crit/[0.08]' : f.level === 'dikkat' ? 'border-warn/40 bg-warn/[0.06]' : 'border-holo/30 bg-holo/[0.05]'} ${vibration && f.level === 'kritik' ? 'buzz' : ''}`}>
            <Icon size={18} className={`mt-0.5 shrink-0 ${ALERT_META[f.level].text}`} aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">{resolve(f.title, lang)}</p>
              <p className="mt-0.5 text-[15px] leading-snug text-ink-muted">{resolve(f.reason, lang)}</p>
              <p className="mt-1 text-[14.5px] leading-snug text-ink">{resolve(f.action, lang)}</p>
              {src && <p className="mt-1 text-[13px] text-ink-dim">{t.alerts.source}: {SOURCES[src].org}</p>}
            </div>
          </div>
        )
      })}

      {complaints.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {complaints.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-[14.5px]">
              <span className="text-ink">
                {t.hologram.symptoms[c.symptom]} · {resolve(bodyPart(c.region, c.side), lang)}
              </span>
              <span className="tabular font-mono text-ink-muted">
                {c.severity}/10 · {new Date(c.ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[15.5px] leading-relaxed text-ink-muted">{r.summary}</p>

      {live.length > 0 && snapshot && (
        <ul className="mt-5 grid grid-cols-2 gap-2">
          {live.map((i) => {
            const s = snapshot.indicators[i]
            const ss = STATUS_META[s.status]
            return (
              <li key={i}>
                <button type="button" onClick={() => onOpenIndicator(i)} className="w-full rounded-xl border border-line bg-white/[0.015] p-3 text-left transition-colors hover:border-holo/40">
                  <span className="flex items-center justify-between gap-1 text-[14px] text-ink-dim">
                    <span className="truncate">{resolve(INDICATORS[i].name, lang)}</span>
                    <span className={ss.text}>{t.status[s.status]}</span>
                  </span>
                  <span className="mt-1 block leading-none">
                    <span className="tabular font-mono text-[19px] font-medium text-ink">{formatValue(i, s, lang)}</span>
                    <span className="ml-1 text-[13.5px] text-ink-dim">{resolve(INDICATORS[i].unit, lang)}</span>
                  </span>
                  <span className="mt-1 block truncate text-[13px] text-ink-dim">{resolve(INDICATORS[i].range, lang)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <dl className="mt-5 grid grid-cols-3 gap-2">
        {r.metrics.map((m) => {
          const ms = m.status ? STATUS_META[m.status] : null
          return (
            <Tooltip key={m.label} label={m.hint} wide side="top" align="center">
              <div tabIndex={0} className="w-full rounded-xl border border-line bg-white/[0.015] p-3 outline-none transition-colors hover:border-line-strong">
                <dt className="truncate text-[14px] text-ink-dim" title={m.label}>
                  {m.label}
                </dt>
                <dd className="mt-1.5 leading-none">
                  <span className={`tabular font-mono text-[19px] font-medium ${ms ? ms.text : 'text-ink'}`}>{m.value}</span>
                  {m.unit && <span className="ml-1 text-[13.5px] text-ink-dim">{m.unit}</span>}
                </dd>
              </div>
            </Tooltip>
          )
        })}
      </dl>

      <div className="mt-6">
        <Sparkline values={r.trend.values} range={r.trend.range} unit={r.trend.unit} label={r.trend.label} />
      </div>

      <div className="mt-5 rounded-xl border border-line">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium">
          {t.panel.detailsAdvice}
          <ChevronDown size={17} className={`text-ink-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.16 } }}
              transition={{ duration: 0.26, ease }}
              className="overflow-hidden"
            >
              <div className="space-y-2.5 px-4 pb-4 text-[16px] leading-relaxed text-ink-muted">
                {r.details.map((d) => (
                  <p key={d}>{d}</p>
                ))}
                <p className="rounded-lg bg-holo/[0.06] px-3 py-2 text-ink">
                  <span className="font-medium text-holo">{t.panel.advice} </span>
                  {r.advice}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => onAsk(t.panel.askQuestion(r.name))}
        className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/25 transition-colors hover:bg-holo/15"
      >
        <MessageCircleHeart size={17} aria-hidden />
        {t.panel.ask}
      </button>

      <p className="mt-auto pt-6 text-[14px] leading-snug text-ink-dim">
        {t.panel.source}{' '}
        <a href={r.source.url} target="_blank" rel="noreferrer" className="text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-holo">
          {r.source.label}
        </a>{' '}
        · {t.panel.footer}
      </p>
    </div>
  )
}

function CardSkeleton() {
  const { t } = useI18n()
  return (
    <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6" role="status" aria-label={t.panel.loading}>
      <div className="skeleton h-3 w-16" />
      <div className="skeleton h-7 w-44" />
      <div className="skeleton h-6 w-24 rounded-full" />
      <div className="skeleton mt-2 h-4 w-full" />
      <div className="skeleton h-4 w-4/5" />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
        <div className="skeleton h-16" />
      </div>
      <div className="skeleton mt-2 h-28" />
    </div>
  )
}

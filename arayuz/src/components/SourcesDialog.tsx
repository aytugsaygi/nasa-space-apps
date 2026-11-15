import { ArrowUpRight, RotateCcw, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { INDICATORS, type IndicatorId } from '../core/catalog'
import { CREW } from '../core/crew'
import { useContent } from '../data/content'
import { useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { openImport } from '../lib/importDialog'
import { FeasibilityTab } from './about/FeasibilityTab'
import { NasaDataTab } from './about/NasaDataTab'
import { RoadmapTab } from './about/RoadmapTab'

export type SourcesTab = 'sources' | 'nasa' | 'feasibility' | 'roadmap'
const TABS: SourcesTab[] = ['sources', 'nasa', 'feasibility', 'roadmap']
const TAB_KEY = 'vitalis.sourcesTab'

/** Seçili sekme oturum boyunca hatırlanır (sessionStorage kapalıysa her açılışta Kaynaklar) */
function savedTab(): SourcesTab {
  try {
    const v = sessionStorage.getItem(TAB_KEY)
    return TABS.includes(v as SourcesTab) ? (v as SourcesTab) : 'sources'
  } catch {
    return 'sources'
  }
}

export function SourcesDialog({ open, onClose, onReplayIntro }: { open: boolean; onClose: () => void; onReplayIntro: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const { t, lang, locale } = useI18n()
  const { sources } = useContent()
  const imports = useQuery('imports', open ? [] : null)
  const date = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const [tab, setTabState] = useState<SourcesTab>(savedTab)
  const tabRefs = useRef<Partial<Record<SourcesTab, HTMLButtonElement | null>>>({})
  const setTab = (next: SourcesTab, focus = false) => {
    setTabState(next)
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {
      /* oturum deposu kapalı olabilir */
    }
    if (focus) tabRefs.current[next]?.focus()
  }
  // Sekmeler arasında ←/→ ile gezilir, Home/End ilk ve son sekme (seçim odakla birlikte değişir)
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab)
    const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
    if (!next) return
    e.preventDefault()
    setTab(next, true)
  }

  // Kapatma işlevi her çizimde yenilenebilir: odak yalnızca açılış/kapanışta taşınır (Sheet ile aynı hata)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sources-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="scroll-thin max-h-[86dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-line-strong bg-raised p-6 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="sources-title" className="font-display text-2xl font-semibold tracking-tight">
                  {t.sources.title}
                </h2>
                <p className="mt-1 text-[16.5px] text-ink-muted">{t.sources.desc}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={t.sources.close}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>

            <div role="tablist" aria-label={t.about.tabsLabel} className="mt-5 flex flex-wrap gap-1 rounded-xl border border-line p-1">
              {TABS.map((id) => (
                <button
                  key={id}
                  ref={(el) => {
                    tabRefs.current[id] = el
                  }}
                  type="button"
                  role="tab"
                  id={`sources-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`sources-panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={onTabKey}
                  className="min-h-9 flex-1 rounded-lg px-3 text-[14.5px] whitespace-nowrap text-ink-muted transition-colors hover:text-ink aria-selected:bg-holo/12 aria-selected:text-holo"
                >
                  {t.about.tabs[id]}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`sources-panel-${tab}`} aria-labelledby={`sources-tab-${tab}`} tabIndex={0} className="mt-5 outline-none">
              {tab === 'nasa' && <NasaDataTab />}
              {tab === 'feasibility' && <FeasibilityTab />}
              {tab === 'roadmap' && <RoadmapTab />}
              {tab === 'sources' && (
                <>
            <div className="space-y-6">
              {sources.map((g) => (
                <section key={g.group}>
                  <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{g.group}</h3>
                  <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                    {g.items.map((it) => (
                      <li key={it.name} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[16.5px] font-medium text-ink">{it.name}</p>
                          <p className="text-[14.5px] text-ink-dim">{it.note}</p>
                        </div>
                        {it.url && (
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t.sources.openLink(it.name)}
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-dim hover:bg-white/[0.04] hover:text-holo"
                          >
                            <ArrowUpRight size={17} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* VM-10: içe aktarılan veri setleri (13 Kasım NASA verisi buraya düşer) */}
            <section className="mt-6" data-imports>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.sources.imported}</h3>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    openImport()
                  }}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14px] text-ink-muted transition-colors hover:border-holo/40 hover:text-holo"
                >
                  <Upload size={14} aria-hidden />
                  {t.importer.open}
                </button>
              </div>
              {imports && imports.length > 0 ? (
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                  {imports.map((im) => (
                    <li key={im.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[16.5px] font-medium text-ink">{im.dataset}</p>
                        <p className="text-[14.5px] text-ink-dim">
                          {im.provider ?? t.sources.unknownProvider} · {INDICATORS[im.indicator as IndicatorId] ? resolve(INDICATORS[im.indicator as IndicatorId].name, lang) : im.indicator} · {CREW[im.astronaut as keyof typeof CREW]?.name ?? im.astronaut} ·{' '}
                          {t.sources.importedCount(im.count.toLocaleString(locale), date(im.from), date(im.to))}
                          {im.by ? ` · ${t.importer.by[im.by]}` : ''}
                        </p>
                      </div>
                      {im.url && (
                        <a
                          href={im.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={t.sources.openLink(im.dataset)}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-dim hover:bg-white/[0.04] hover:text-holo"
                        >
                          <ArrowUpRight size={17} />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-2xl border border-line px-4 py-3 text-[14.5px] text-ink-dim">{t.sources.noImports}</p>
              )}
            </section>

            <p className="mt-6 rounded-2xl bg-holo/[0.06] px-4 py-3 text-[15.5px] leading-relaxed text-ink-muted">{t.sources.fictional}</p>

            <button
              type="button"
              onClick={onReplayIntro}
              className="mt-5 flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <RotateCcw size={16} aria-hidden />
              {t.sources.replayIntro}
            </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

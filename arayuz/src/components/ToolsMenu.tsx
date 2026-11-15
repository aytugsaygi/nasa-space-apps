import { Eye, EyeOff, LayoutGrid, RotateCcw, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { TOOL_ICONS as ICONS } from '../lib/icons'
import { PAGE_COUNT, PAGE_TOOLS, PROFILE_COUNT, type DashboardLayout, type ToolId } from '../lib/layout'
import { Tooltip } from './Tooltip'

interface Props {
  open: boolean
  layout: DashboardLayout
  /** Etkin profilin sırası (0'dan başlar) */
  activeProfile: number
  /** Her profil için: ilk halinden farklı mı */
  customized: boolean[]
  labelOf: (id: ToolId) => string
  reducedMotion: boolean
  /** O an açık olan sayfa: göz simgeleri bu sayfanın durumunu gösterir ve değiştirir */
  page: number
  /** Sayfa standart yerleşimde değilse "Tüm bölümleri ekle" etkindir */
  canAddAll: boolean
  onAddAll: () => void
  /** Sayfada en az bir bölüm varsa "Tüm bölümleri kaldır" etkindir */
  canRemoveAll: boolean
  onRemoveAll: () => void
  /** Başlıktaki sayfa sekmeleri: başka bir sayfaya geçer (arkadaki arayüz de o sayfaya kayar) */
  onSelectPage: (page: number) => void
  onToggle: (id: ToolId) => void
  onSelectProfile: (index: number) => void
  onReset: () => void
  onClose: () => void
}

/** Ekranın solundan açılan bölüm menüsü: bölümleri göster/gizle, profiller arasında geç, düzeni sıfırla */
export function ToolsMenu({ open, layout, activeProfile, customized, labelOf, reducedMotion, page, canAddAll, onAddAll, canRemoveAll, onRemoveAll, onSelectPage, onToggle, onSelectProfile, onReset, onClose }: Props) {
  const { t } = useI18n()
  const pl = layout.pages[page]
  const closeRef = useRef<HTMLButtonElement>(null)
  const canReset = customized[activeProfile]


  // Kapatma işlevi her çizimde yenilenebilir: odak yalnızca açılış/kapanışta taşınır (Sheet ile aynı hata)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    // Menü kapanınca odak menüyü açan düğmeye döner
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  // Bölümler asıl sayfalarına göre gruplanır; açık olan sayfanın grubu önce gelir
  const groups: { title: string; ids: ToolId[] }[] = PAGE_TOOLS.map((ids, i) => ({ title: t.groups[i], ids })).sort((a, b) => (a.title === t.groups[page] ? -1 : b.title === t.groups[page] ? 1 : 0))

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            id="tools-menu"
            role="dialog"
            aria-modal="true"
            aria-label={t.layout.title}
            initial={reducedMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={reducedMotion ? { opacity: 1 } : { x: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { x: '-100%', transition: { duration: 0.2, ease: [0.64, 0, 0.78, 0] } }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex h-dvh w-[min(360px,88vw)] flex-col border-r border-line-strong bg-raised shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 p-5 pb-3">
              <div className="min-w-0 flex-1">
                {/* Sayfa sekmeleri (soldan sağa): seçili sekme, menüde düzenlenen sayfadır */}
                <div id="tools-page-tabs" role="group" aria-label={t.layout.pageTabs} className="flex gap-1 rounded-2xl border border-line p-1">
                  {Array.from({ length: PAGE_COUNT }, (_, i) => {
                    const current = i === page
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => onSelectPage(i)}
                        aria-pressed={current}
                        aria-label={current ? t.layout.pageNames[i] : t.layout.goToPage(t.layout.pageNames[i])}
                        className={`flex h-10 flex-1 items-center justify-center rounded-xl px-1 font-display text-[15.5px] font-semibold whitespace-nowrap transition-colors ${
                          current ? 'bg-holo/12 text-holo ring-1 ring-holo/40' : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
                        }`}
                      >
                        {t.layout.pageShort[i]}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-[15.5px] leading-relaxed text-ink-muted">{t.layout.desc}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label={t.layout.close}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <X size={17} />
              </button>
            </div>

            {/* Bölüm listesi: uzun ekranlarda sığar, kısa ekranlarda kendi içinde kayar */}
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-14">
              <div id="tools-menu-list" className="space-y-5">
                {groups.map((g, gi) => (
                  <section key={g.title}>
                    <h3 className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{g.title}</h3>
                    {/* Tümünü ekle (standart yerleşimle) ve tümünü kaldır: açık olan sayfa için */}
                    {gi === 0 && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Tooltip label={canAddAll ? t.layout.addAllTip(t.layout.pageNames[page]) : t.layout.addAllDisabledTip} side="bottom" align="start" className="w-full">
                          <button
                            id="tools-add-all"
                            type="button"
                            onClick={() => canAddAll && onAddAll()}
                            aria-disabled={!canAddAll}
                            className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-center text-[14.5px] leading-tight font-semibold transition-colors ${
                              canAddAll ? 'border-holo/45 bg-holo/12 text-holo hover:bg-holo/20' : 'cursor-not-allowed border-line text-ink-dim opacity-50'
                            }`}
                          >
                            <LayoutGrid size={15} className="shrink-0" aria-hidden />
                            {t.layout.addAll}
                          </button>
                        </Tooltip>
                        <Tooltip label={canRemoveAll ? t.layout.removeAllTip(t.layout.pageNames[page]) : t.layout.removeAllDisabledTip} side="bottom" align="end" className="w-full">
                          <button
                            id="tools-remove-all"
                            type="button"
                            onClick={() => canRemoveAll && onRemoveAll()}
                            aria-disabled={!canRemoveAll}
                            className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-center text-[14.5px] leading-tight font-semibold transition-colors ${
                              canRemoveAll
                                ? 'border-line-strong text-ink-muted hover:border-crit/50 hover:bg-crit/10 hover:text-crit'
                                : 'cursor-not-allowed border-line text-ink-dim opacity-50'
                            }`}
                          >
                            <EyeOff size={15} className="shrink-0" aria-hidden />
                            {t.layout.removeAll}
                          </button>
                        </Tooltip>
                      </div>
                    )}
                    <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                      {g.ids.map((id) => {
                        const Icon = ICONS[id]
                        const name = labelOf(id)
                        const visible = pl.visible[id]
                        const state = !visible ? t.layout.stateHidden : pl.pinned[id] ? t.layout.statePinned : t.layout.stateLoose
                        return (
                          <li key={id} className="flex items-center gap-3 px-3.5 py-2.5">
                            <Icon size={17} className={`shrink-0 ${visible ? 'text-holo' : 'text-ink-dim'}`} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-[16.5px] font-medium ${visible ? 'text-ink' : 'text-ink-muted'}`}>{name}</p>
                              <p className={`text-[13.5px] ${visible && !pl.pinned[id] ? 'text-warn' : 'text-ink-dim'}`}>{state}</p>
                            </div>
                            <Tooltip label={visible ? t.layout.hide : t.layout.show} align="end">
                              <button
                                type="button"
                                onClick={() => onToggle(id)}
                                aria-pressed={visible}
                                aria-label={visible ? t.layout.hideTool(name) : t.layout.showTool(name)}
                                className={`flex size-11 items-center justify-center rounded-xl border transition-colors ${
                                  visible
                                    ? 'border-holo/40 bg-holo/10 text-holo hover:bg-holo/15'
                                    : 'border-line text-ink-dim hover:border-line-strong hover:text-ink'
                                }`}
                              >
                                {visible ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                              </button>
                            </Tooltip>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </div>

            </div>

            {/* Alt şerit: profiller ve düzeni sıfırlama her zaman görünür */}
            <div className="shrink-0 border-t border-line bg-surface/60 px-5 pt-4 pb-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="layout-profiles-title" className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">
                  {t.layout.profiles}
                </h3>
                <p className="truncate text-[13.5px] text-ink-dim" aria-live="polite">
                  {t.layout.profile(activeProfile + 1)} · {canReset ? t.layout.profileCustom : t.layout.profileDefault}
                </p>
              </div>

              <div className="mt-2.5 flex items-center gap-2.5">
                <div id="layout-profiles" role="group" aria-labelledby="layout-profiles-title" className="flex flex-1 gap-1 rounded-2xl border border-line p-1">
                  {Array.from({ length: PROFILE_COUNT }, (_, i) => {
                    const n = i + 1
                    const current = i === activeProfile
                    return (
                      <Tooltip
                        key={i}
                        side="top"
                        align={i === 0 ? 'start' : i === PROFILE_COUNT - 1 ? 'end' : 'center'}
                        label={`${t.layout.profile(n)} · ${customized[i] ? t.layout.profileCustom : t.layout.profileDefault}`}
                        className="flex-1"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectProfile(i)}
                          aria-pressed={current}
                          aria-label={current ? t.layout.profile(n) : t.layout.switchProfile(n)}
                          className={`relative flex h-11 w-full items-center justify-center rounded-xl font-mono text-[17px] font-medium transition-colors ${
                            current ? 'bg-holo/12 text-holo ring-1 ring-holo/40' : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink'
                          }`}
                        >
                          {n}
                          {/* Özelleştirilmiş profilin köşesinde küçük nokta */}
                          {customized[i] && <span className={`absolute top-2 right-2.5 size-1.5 rounded-full ${current ? 'bg-holo' : 'bg-ink-dim'}`} aria-hidden />}
                        </button>
                      </Tooltip>
                    )
                  })}
                </div>

                <span className="h-9 w-px shrink-0 bg-line" aria-hidden />

                <div id="layout-reset" className="shrink-0">
                  <Tooltip side="top" align="end" label={canReset ? t.layout.resetTip(activeProfile + 1) : t.layout.resetDisabledTip}>
                    <button
                      type="button"
                      onClick={() => canReset && onReset()}
                      aria-disabled={!canReset}
                      aria-label={t.layout.reset}
                      className={`relative flex size-[54px] items-center justify-center rounded-2xl border transition-[color,background-color,border-color,opacity] duration-150 ${
                        canReset
                          ? 'border-line-strong text-ink hover:border-warn/50 hover:bg-warn/10 hover:text-warn'
                          : 'cursor-not-allowed border-line text-ink-dim opacity-45'
                      }`}
                    >
                      <RotateCcw size={21} strokeWidth={2} aria-hidden />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

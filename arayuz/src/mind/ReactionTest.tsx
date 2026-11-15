import { RotateCcw, Zap } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { GLASS_EASE as EASE, GlassDialog, PillPrimary } from '../components/GlassDialog'
import { relativeStatus } from '../core/catalog'
import { CREW, MISSION, missionDay } from '../core/crew'
import type { Point } from '../core/sim'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { usePrefersReducedMotion } from '../lib/settings'

const TRIALS = 5
/** Yeşilden önceki bekleme: her denemede rastgele (tahmin edilemesin) */
const WAIT_MIN = 1000
const WAIT_SPAN = 1800
/** Erken basıştan sonra alanın yeniden hazırlanma süresi */
const EARLY_MS = 800
/** Geçerli basıştan sonra süre bu kadar gösterilir */
const HIT_MS = 550
/** Bundan hızlı basış tepki değil tahmindir (yeşilden önce basılmış sayılır); ölçümün geçerli alt sınırı da budur */
const MIN_HUMAN_MS = 100

type Stage = 'intro' | 'wait' | 'go' | 'early' | 'hit' | 'done'

/**
 * Tepki testi (cam pencere, check-in ile aynı görünüm). Solda sahne, sağda geçmiş sonuçlar.
 * - Alan yeşile dönünce basılır (fare, dokunma, Boşluk ya da Enter). Yalnızca yeşilken yapılan basış denemeyi ilerletir.
 * - Yeşilden önce basılırsa "Çok erken!" yazar, deneme sayılmaz ve alan kendiliğinden yeniden hazırlanır; sınır yoktur.
 * - 5 geçerli denemenin ortalaması "tepki süresi" ölçümü olarak kaydedilir ve uçuş öncesi başlangıçla karşılaştırılır.
 * - Geçmiş: görev boyunca haftalık kontroller ve burada yapılan testler (grafik ve son sonuçlar).
 * Yeşile dönüş anında ve renk geçişsiz olur (uyaran gecikmesin). Hareketi azaltmada süsleyici hareketler yoktur.
 */
export function ReactionTest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const r = t.reaction
  // Pencere kapanınca içerik kaldırılır: yeniden açılınca test baştan başlar
  return (
    <GlassDialog open={open} onClose={onClose} id="reaction-test" title={r.title} subtitle={r.eyebrow} closeLabel={r.close}>
      <ReactionBody />
    </GlassDialog>
  )
}

function ReactionBody() {
  const { t, lang } = useI18n()
  const r = t.reaction
  const { astronaut, mutate } = useHealth()
  const reduced = usePrefersReducedMotion()
  const [stage, setStage] = useState<Stage>('intro')
  const [times, setTimes] = useState<number[]>([])
  const [last, setLast] = useState<number | null>(null)
  // Geçmiş: görevin başından bu ana; test kaydedilince yenilenir
  const [until, setUntil] = useState(() => Date.now())
  const shownAt = useRef(0)
  const timer = useRef(0)
  const pad = useRef<HTMLButtonElement | null>(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  /** Alanı hazırlar: bekleme başlar, rastgele bir an sonra yeşile döner */
  const arm = () => {
    clearTimeout(timer.current)
    setStage('wait')
    timer.current = window.setTimeout(() => {
      shownAt.current = performance.now()
      setStage('go')
    }, WAIT_MIN + Math.random() * WAIT_SPAN)
    // Klavyeyle de basılabilsin: odak alana
    requestAnimationFrame(() => pad.current?.focus({ preventScroll: true }))
  }

  const start = () => {
    setTimes([])
    setLast(null)
    arm()
  }

  /** Çok erken: deneme sayılmaz, alan kısa bir süre sonra kendiliğinden yeniden hazırlanır (sınırsız) */
  const tooEarly = () => {
    clearTimeout(timer.current)
    setStage('early')
    timer.current = window.setTimeout(arm, EARLY_MS)
  }

  const press = () => {
    if (stage === 'wait' || stage === 'early') return tooEarly()
    if (stage !== 'go') return
    const ms = Math.round(performance.now() - shownAt.current)
    // İnsan 100 ms'den hızlı tepki veremez: bu, yeşilden önce tahminle basmaktır; o da erken sayılır
    if (ms < MIN_HUMAN_MS) return tooEarly()
    const list = [...times, ms]
    setTimes(list)
    setLast(ms)
    setStage('hit')
    clearTimeout(timer.current)
    if (list.length >= TRIALS) {
      const avg = Math.round(list.reduce((a, b) => a + b, 0) / list.length)
      timer.current = window.setTimeout(() => setStage('done'), HIT_MS)
      if (astronaut) {
        void Promise.all([mutate('addMeasurement', astronaut, 'reaction', avg), mutate('setTaskDone', astronaut, 'reaction', true)]).then(() => setUntil(Date.now() + 1))
      }
    } else timer.current = window.setTimeout(arm, HIT_MS)
  }
  const onPadKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    e.preventDefault()
    if (!e.repeat) press()
  }

  const baseline = astronaut ? CREW[astronaut].baseline.reaction : null
  const history = useQuery('series', astronaut ? [astronaut, 'reaction', MISSION.start - 7 * 86_400_000, until] : null)
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
  // Sıradaki deneme; geçerli basışın süresi gösterilirken o deneme
  const trialNow = Math.min(TRIALS, times.length + (stage === 'hit' ? 0 : 1))

  return (
    <div className="relative grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pt-6 pb-6 sm:px-10 sm:pb-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-8 lg:overflow-hidden">
      {/* Sahne */}
      <section aria-label={r.title} className="relative flex min-h-[620px] flex-col sm:min-h-[540px] lg:min-h-0">
        {stage !== 'intro' && stage !== 'done' && <TrialDots done={times.length} current={trialNow - 1} label={r.trial(trialNow, TRIALS)} reduced={reduced} />}
        <div className="relative mt-3 min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {stage === 'intro' && <Intro key="intro" onStart={start} reduced={reduced} />}
            {(stage === 'wait' || stage === 'go' || stage === 'early' || stage === 'hit') && (
              <motion.div key="run" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                <Pad stage={stage} last={last} trial={times.length} onPress={press} onKey={onPadKey} padRef={pad} reduced={reduced} />
              </motion.div>
            )}
            {stage === 'done' && <Result key="done" times={times} avg={avg} baseline={baseline} lang={lang} onAgain={start} reduced={reduced} />}
          </AnimatePresence>
        </div>
      </section>

      {/* Geçmiş sonuçlar */}
      <History points={history?.points ?? []} baseline={baseline} />
    </div>
  )
}

/* ---------- Sahne parçaları ---------- */

function Intro({ onStart, reduced }: { onStart: () => void; reduced: boolean }) {
  const { t } = useI18n()
  const r = t.reaction
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8 rounded-[2rem] bg-white/[0.02] px-6 text-center ring-1 ring-white/[0.06]"
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{r.ready}</p>
      {/* Başlat: nefes alan halkaların ortasında yuvarlak düğme */}
      <div className="relative flex size-48 items-center justify-center">
        {!reduced &&
          [0, 1].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full ring-1 ring-holo/40"
              animate={{ scale: [0.82, 1.18], opacity: [0.55, 0] }}
              transition={{ duration: 2.4, delay: i * 1.2, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        <button
          type="button"
          id="reaction-start"
          onClick={onStart}
          className="group relative flex size-36 flex-col items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-holo/25 to-holo/10 font-display text-[18px] font-semibold text-holo shadow-[0_0_60px_-12px_var(--color-holo),inset_0_1px_1px_rgb(255_255_255/0.2)] ring-1 ring-holo/40 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo active:scale-[0.97]"
        >
          <Zap size={22} strokeWidth={1.75} aria-hidden className="transition-transform duration-500 group-hover:-translate-y-0.5" />
          {r.start}
        </button>
      </div>
      <p className="max-w-md text-[16px] leading-relaxed text-ink-muted">{r.howTo}</p>
    </motion.div>
  )
}

/**
 * Basma alanı. Bekleme: koyu ve sakin. Yeşil: anında, geçişsiz dolu yeşil. Erken: amber ve hafif sarsıntı. Geçerli basış:
 * süre büyük yazılır. Durum yazısı ekran okuyucuya da söylenir.
 */
function Pad({
  stage,
  last,
  trial,
  onPress,
  onKey,
  padRef,
  reduced,
}: {
  stage: Stage
  last: number | null
  trial: number
  onPress: () => void
  onKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  padRef: RefObject<HTMLButtonElement | null>
  reduced: boolean
}) {
  const { t } = useI18n()
  const r = t.reaction
  const go = stage === 'go'
  // Alan, giriş ekranı çıktıktan sonra gelir: klavyeyle basılabilsin diye gelir gelmez odak alır
  useEffect(() => {
    padRef.current?.focus({ preventScroll: true })
  }, [padRef])
  // Yeşile geçişte renk geçişi yok (uyaran gecikmesin); diğer durumlarda yumuşak
  const tone = go
    ? 'bg-ok text-void'
    : stage === 'early'
      ? 'bg-warn/[0.12] text-warn ring-warn/40 transition-colors duration-300'
      : stage === 'hit'
        ? 'bg-holo/[0.08] text-ink ring-holo/30 transition-colors duration-300'
        : 'bg-white/[0.025] text-ink ring-white/[0.08] transition-colors duration-300'
  return (
    <motion.button
      ref={padRef}
      type="button"
      id="reaction-pad"
      data-stage={stage}
      onPointerDown={onPress}
      onKeyDown={onKey}
      animate={stage === 'early' && !reduced ? { x: [0, -8, 8, -4, 0] } : { x: 0 }}
      transition={{ duration: 0.35 }}
      className={`relative flex size-full touch-manipulation flex-col items-center justify-center gap-3 overflow-hidden rounded-[2rem] ring-1 outline-none select-none focus-visible:ring-2 focus-visible:ring-holo/60 ${tone}`}
    >
      {/* Beklerken ortada ince bir hedef halkası (hareketsiz: yeşilin habercisi olmasın) */}
      {stage === 'wait' && <span aria-hidden className="absolute size-40 rounded-full ring-1 ring-white/10" />}
      <span aria-live="assertive" className="relative flex flex-col items-center gap-2">
        {stage === 'hit' && last !== null ? (
          <>
            <span className="tabular font-display text-[64px] leading-none font-semibold tracking-tight md:text-[80px]">
              {last}
              <span className="ml-1 text-[24px] font-medium text-ink-muted md:text-[28px]">ms</span>
            </span>
            <span className="text-[15px] text-ink-muted">{r.hit(trial)}</span>
          </>
        ) : (
          <span className={`font-display font-semibold tracking-tight ${go ? 'text-[52px] md:text-[64px]' : 'text-[32px] md:text-[40px]'}`}>{go ? r.go : stage === 'early' ? r.early : r.wait}</span>
        )}
        {stage === 'early' && <span className="max-w-sm px-6 text-center text-[15px] font-normal text-ink">{r.earlyNote}</span>}
      </span>
      <span className={`absolute bottom-5 text-[14px] ${go ? 'text-void/70' : 'text-ink-dim'}`}>{r.keyHint}</span>
    </motion.button>
  )
}

/** Deneme ilerlemesi: beş çizgi, yapılanlar dolu, sıradaki parlar; yazıyla da söylenir */
function TrialDots({ done, current, label, reduced }: { done: number; current: number; label: string; reduced: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{label}</p>
      <div className="flex w-40 gap-1.5" aria-hidden>
        {Array.from({ length: TRIALS }, (_, i) => (
          <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <motion.span
              className="absolute inset-0 origin-left rounded-full bg-holo"
              initial={false}
              animate={{ scaleX: i < done ? 1 : 0, opacity: i < done ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 0.5, ease: EASE }}
            />
            {i === current && i >= done && <span className="absolute inset-0 rounded-full bg-holo/35" />}
          </span>
        ))}
      </div>
    </div>
  )
}

function Result({ times, avg, baseline, lang, onAgain, reduced }: { times: number[]; avg: number; baseline: number | null; lang: 'tr' | 'en'; onAgain: () => void; reduced: boolean }) {
  const { t } = useI18n()
  const r = t.reaction
  const pct = baseline ? Math.round(((avg - baseline) / baseline) * 100) : null
  const status = baseline ? relativeStatus(avg, baseline) : null
  const tone = status?.status === 'kritik' ? 'text-crit bg-crit/10 ring-crit/30' : status?.status === 'dikkat' ? 'text-warn bg-warn/10 ring-warn/30' : 'text-ok bg-ok/10 ring-ok/30'
  const max = Math.max(...times, baseline ?? 0) * 1.1
  const fastest = Math.min(...times)
  const slowest = Math.max(...times)
  const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.07, delayChildren: reduced ? 0 : 0.15 } } }
  const item: Variants = reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }
  return (
    <motion.div
      role="status"
      data-reaction-result
      className="absolute inset-0 flex flex-col overflow-y-auto rounded-[2rem] bg-white/[0.02] p-6 ring-1 ring-white/[0.06] sm:px-8 sm:py-7"
      variants={stagger}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
    >
      <motion.p variants={item} className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">
        {r.doneTitle}
      </motion.p>
      <motion.div variants={item} className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        <p className="tabular font-display text-[60px] leading-[0.9] font-semibold tracking-tight md:text-[72px]">
          {avg}
          <span className="ml-1.5 text-[22px] font-medium text-ink-muted">ms</span>
        </p>
        <div className="pb-2">
          <p className="text-[14.5px] text-ink-muted">{r.avgLabel}</p>
          {status && pct !== null && (
            <p className={`mt-1.5 inline-flex rounded-full px-3 py-1 text-[14px] font-semibold ring-1 ${tone}`}>
              {r.diff(pct)} · {resolve(status.label, lang)}
            </p>
          )}
        </div>
      </motion.div>

      {/* Beş deneme: dikey çubuklar; başlangıç kesikli çizgiyle */}
      <motion.div variants={item} className="relative mt-7 mr-24 flex min-h-28 flex-1 items-end gap-3" aria-label={r.trialsLabel} role="list">
        {baseline !== null && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/25" style={{ bottom: `${(baseline / max) * 100}%` }}>
            <span className="tabular absolute top-0 left-full ml-3 -translate-y-1/2 font-mono text-[12px] whitespace-nowrap text-ink-dim">
              {r.baselineShort} {baseline}
            </span>
          </span>
        )}
        {times.map((ms, i) => (
          <div key={i} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className={`tabular font-mono text-[13px] ${ms === fastest ? 'text-holo' : 'text-ink-muted'}`}>{ms}</span>
            <motion.span
              className={`w-full max-w-14 rounded-t-xl rounded-b-md ${ms === fastest ? 'bg-gradient-to-t from-holo/40 to-holo' : 'bg-gradient-to-t from-white/10 to-white/30'}`}
              initial={{ height: reduced ? `${(ms / max) * 100}%` : '0%' }}
              animate={{ height: `${(ms / max) * 100}%` }}
              transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.25 + i * 0.06, ease: EASE }}
            />
          </div>
        ))}
      </motion.div>

      <motion.dl variants={item} className="mt-5 grid grid-cols-3 gap-4">
        <Stat label={r.fastest} value={r.ms(fastest)} />
        <Stat label={r.slowest} value={r.ms(slowest)} />
        {baseline !== null && <Stat label={r.baselineShort} value={r.ms(baseline)} />}
      </motion.dl>

      <motion.div variants={item} className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-ok">{r.saved}</p>
        <PillPrimary onClick={onAgain} icon={<RotateCcw size={16} strokeWidth={2} aria-hidden />}>
          {r.again}
        </PillPrimary>
      </motion.div>
    </motion.div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[12px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{label}</dt>
      <dd className="tabular mt-1 font-display text-[20px] font-semibold">{value}</dd>
    </div>
  )
}

/* ---------- Geçmiş ---------- */

/**
 * Geçmiş sonuçlar: görev boyunca tepki süresi grafiği (kesikli çizgi uçuş öncesi başlangıç; burada yapılan testler
 * parlayan nokta) ve son sonuçların listesi (gün, süre, başlangıca göre fark, kaynak).
 */
function History({ points, baseline }: { points: Point[]; baseline: number | null }) {
  const { t, locale } = useI18n()
  const r = t.reaction
  const sorted = useMemo(() => [...points].sort((a, b) => a.t - b.t), [points])
  const recent = sorted.slice(-7).reverse()
  const tag = (p: Point) => (p.source === 'manual' ? r.you : p.source === 'demo' ? r.demo : p.source.startsWith('import:') ? r.imported : r.weekly)
  const date = (ts: number) => new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })

  return (
    <aside aria-labelledby="reaction-history-title" className="flex min-h-0 flex-col">
      <h3 id="reaction-history-title" className="font-display text-[20px] font-semibold tracking-tight">
        {r.historyTitle}
      </h3>
      <p className="mt-1 text-[14px] leading-snug text-ink-muted">{r.historySub}</p>
      {sorted.length === 0 ? (
        <p className="mt-6 text-[15px] text-ink-dim">{r.historyEmpty}</p>
      ) : (
        <>
          <Chart points={sorted} baseline={baseline} label={r.chartLabel(sorted.length, sorted[sorted.length - 1].v)} />
          <p className="mt-5 font-mono text-[12px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{r.historyList}</p>
          <ul className="scroll-thin mt-2 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-reaction-history>
            {recent.map((p) => {
              const pct = baseline ? Math.round(((p.v - baseline) / baseline) * 100) : null
              const status = baseline ? relativeStatus(p.v, baseline).status : 'normal'
              const tone = status === 'kritik' ? 'text-crit' : status === 'dikkat' ? 'text-warn' : 'text-ink-muted'
              return (
                <li key={p.t} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-full px-4 py-2 transition-colors hover:bg-white/[0.03]">
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] text-ink">
                      {r.day(missionDay(p.t))} · {date(p.t)}
                    </span>
                    <span className={`block text-[12.5px] ${p.source === 'manual' ? 'text-holo' : 'text-ink-dim'}`}>{tag(p)}</span>
                  </span>
                  <span className="tabular font-mono text-[15px] text-ink">{r.ms(Math.round(p.v))}</span>
                  {pct !== null && <span className={`tabular w-14 text-right font-mono text-[13px] ${tone}`}>{r.diffShort(pct)}</span>}
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="mt-4 text-[13px] leading-snug text-ink-dim">{r.source}</p>
    </aside>
  )
}

/** Çizgi grafik: çizgi esneyerek kutuya oturur; noktalar HTML olarak üstte (yuvarlak kalsınlar diye) */
function Chart({ points, baseline, label }: { points: Point[]; baseline: number | null; label: string }) {
  const values = points.map((p) => p.v)
  const lo = Math.min(...values, baseline ?? Infinity) * 0.92
  const hi = Math.max(...values, baseline ?? 0) * 1.06
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const x = (t: number) => (t1 === t0 ? 50 : ((t - t0) / (t1 - t0)) * 100)
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ')
  const area = `${path} L${x(t1).toFixed(2)},100 L${x(t0).toFixed(2)},100 Z`
  return (
    <figure role="img" aria-label={label} className="relative mt-5 h-36 shrink-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="reaction-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-holo)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-holo)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#reaction-area)" />
        {baseline !== null && <line x1="0" x2="100" y1={y(baseline)} y2={y(baseline)} stroke="rgb(255 255 255 / 0.3)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
        <path d={path} fill="none" stroke="var(--color-holo)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((p, i) => {
        const mine = p.source === 'manual'
        const lastOne = i === points.length - 1
        return (
          <span
            key={p.t}
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${mine ? 'size-2.5 bg-holo shadow-[0_0_10px_var(--color-holo)]' : 'size-1.5 bg-holo/60'} ${lastOne ? 'ring-4 ring-holo/20' : ''}`}
            style={{ left: `${x(p.t)}%`, top: `${y(p.v)}%` }}
          />
        )
      })}
    </figure>
  )
}

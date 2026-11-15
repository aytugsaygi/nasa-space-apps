import { ArrowLeft, ArrowRight, Brain, Eye, Layers, RotateCcw, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useRef, useState } from 'react'
import { GLASS_EASE as EASE, GlassDialog, PillGhost, PillPrimary } from '../components/GlassDialog'
import { axisAngle, bestScore, MIND_BETTER, MIND_EXERCISES, multiply, SPATIAL, type MindExercise, type MindSessionDoc, type Vec3 } from '../core/mindTraining'
import { SOURCES, type SourceId } from '../core/sources'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { usePrefersReducedMotion } from '../lib/settings'
import { MemoryStream } from './MemoryStream'
import { BlockFigure, MentalRotation } from './MentalRotation'
import type { MindSummary } from './MindStage'
import { QuickGlance } from './QuickGlance'

/*
 * Zihin egzersizleri (cam pencere; tepki testi ve nefes egzersiziyle aynı aile). Uçuşta yavaşladığı ölçülen üç beceri
 * için üç kısa egzersiz (core/mindTraining.ts): Hızlı bakış (işlem hızı), Bellek akışı (görsel çalışma belleği) ve
 * Zihinde döndür (uzamsal düşünme).
 * - Liste: solda üç büyük egzersiz kartı, sağda neden bu üçü, son oturumlar ve not.
 * - Egzersiz: solda sahne (giriş → egzersiz → sonuç), sağda neden uzayda, nasıl çalışır ve gelişim grafiği.
 * Sonuç astronota göre kaydedilir (mindSessions); hekim görünümünde denenebilir ama kaydedilmez.
 */

/** Egzersizin gerekçe kaynakları (sağ panelde bağlantı olarak) */
const SOURCES_FOR: Record<MindExercise, SourceId[]> = {
  speed: ['mindIss', 'actSpeed'],
  memory: ['mindIss', 'nbackMeta'],
  spatial: ['visuospatial', 'sensorimotorRisk', 'spatialTraining'],
}
const ICON: Record<MindExercise, LucideIcon> = { speed: Eye, memory: Layers, spatial: Brain }

const newSessionId = () => `ms_${crypto.randomUUID().replaceAll('-', '')}`

export function MindTrainingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const m = t.mindTraining
  // Pencere kapanınca içerik kaldırılır: yeniden açılınca liste ekranından başlanır
  return (
    <GlassDialog open={open} onClose={onClose} id="mind-training" title={m.title} subtitle={m.subtitle} closeLabel={t.mindPage.library.close}>
      <MindTrainingBody />
    </GlassDialog>
  )
}

function MindTrainingBody() {
  const { astronaut } = useHealth()
  const reduced = usePrefersReducedMotion()
  const [view, setView] = useState<MindExercise | null>(null)
  const sessions = useQuery('mindSessions', astronaut ? [astronaut] : null)
  const list = sessions ?? []
  return (
    <AnimatePresence mode="wait" initial={false}>
      {view === null ? (
        <motion.div key="home" className="relative flex min-h-0 flex-1 flex-col" {...fade(reduced)}>
          <Home sessions={list} onPick={setView} reduced={reduced} />
        </motion.div>
      ) : (
        <motion.div key={view} className="relative flex min-h-0 flex-1 flex-col" {...fade(reduced)}>
          <ExerciseView exercise={view} sessions={list} onBack={() => setView(null)} reduced={reduced} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const fade = (reduced: boolean) => ({
  initial: { opacity: 0, y: reduced ? 0 : 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.18 } },
  transition: { duration: 0.45, ease: EASE },
})

/* ---------------- Liste ---------------- */

function Home({ sessions, onPick, reduced }: { sessions: MindSessionDoc[]; onPick: (e: MindExercise) => void; reduced: boolean }) {
  const { t, locale } = useI18n()
  const { canEdit } = useHealth()
  const m = t.mindTraining
  const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.07, delayChildren: reduced ? 0 : 0.08 } } }
  const item: Variants = reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } } }
  const recent = sessions.slice(0, 5)
  const date = (ts: number) => new Date(ts).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

  return (
    <div
      className="relative grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pt-6 pb-6 sm:px-10 sm:pb-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-8 lg:overflow-hidden"
      data-mind-training="home"
    >
      <section aria-labelledby="mind-pick" className="flex flex-col lg:min-h-0">
        <p id="mind-pick" className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">
          {m.pick}
        </p>
        <motion.ul className="mt-4 flex flex-col gap-3 lg:min-h-0 lg:flex-1" variants={stagger} initial="hidden" animate="show">
          {MIND_EXERCISES.map((ex, i) => {
            const best = bestScore(sessions, ex)
            return (
              <motion.li key={ex} variants={item} className="flex lg:min-h-[9.5rem] lg:flex-1">
                <button
                  type="button"
                  data-mind-exercise={ex}
                  onClick={() => onPick(ex)}
                  aria-label={m.open(m.names[ex])}
                  className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[1.75rem] bg-white/[0.02] p-4 pr-5 text-left ring-1 ring-white/[0.06] transition-[background-color,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.04] hover:ring-holo/30 sm:p-5"
                >
                  <span aria-hidden className="pointer-events-none absolute -top-2 right-24 hidden font-display text-[88px] sm:block leading-none font-semibold tracking-tight text-white/[0.035] tabular">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Glyph exercise={ex} />
                  <span className="relative min-w-0 flex-1">
                    <span className="block font-mono text-[12.5px] font-semibold tracking-[0.14em] text-holo uppercase">{m.domains[ex]}</span>
                    <span className="mt-1 block font-display text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-[24px]">{m.names[ex]}</span>
                    <span className="mt-1 block text-[15px] leading-snug text-ink-muted">{m.teasers[ex]}</span>
                    <span className="mt-2 block text-[13.5px] text-ink-dim">
                      {m.duration[ex]} · <span className={best === null ? '' : 'text-ink-muted'}>{best === null ? m.notTried : bestText(m, ex, best)}</span>
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-holo/10 text-holo ring-1 ring-holo/25 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:bg-holo/15"
                  >
                    <ArrowRight size={18} strokeWidth={2} />
                  </span>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>
      </section>

      <aside aria-labelledby="mind-why" className="flex flex-col lg:min-h-0">
        <h3 id="mind-why" className="font-display text-[20px] font-semibold tracking-tight">
          {m.whyTitle}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{m.why}</p>
        <SourceLinks ids={['mindIss', 'visuospatial', 'actSpeed', 'nbackMeta', 'spatialTraining']} />

        <h3 className="mt-6 font-mono text-[12px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{m.recentTitle}</h3>
        {recent.length === 0 ? (
          <p className="mt-2 text-[15px] text-ink-dim">{m.recentEmpty}</p>
        ) : (
          <ul className="scroll-thin mt-2 pr-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-mind-recent>
            {recent.map((s) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-full px-4 py-2 transition-colors hover:bg-white/[0.03]">
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] text-ink">{m.names[s.exercise]}</span>
                  <span className="tabular block text-[12.5px] text-ink-dim">{date(s.ts)}</span>
                </span>
                <span className="tabular font-mono text-[15px] text-ink">{scoreText(m, s.exercise, s.score)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto pt-4 text-[13px] leading-snug text-ink-dim">
          {m.note}
          {!canEdit && <> {m.surgeonView}</>}
        </p>
      </aside>
    </div>
  )
}

type Dict = ReturnType<typeof useI18n>['t']['mindTraining']

function bestText(m: Dict, ex: MindExercise, v: number) {
  return ex === 'speed' ? m.best.speed(v) : ex === 'memory' ? m.best.memory(v) : m.best.spatial(v, SPATIAL.trials)
}
function scoreText(m: Dict, ex: MindExercise, v: number) {
  return ex === 'speed' ? `${v} ms` : ex === 'memory' ? m.memory.level(v) : `${v}/${SPATIAL.trials}`
}

/** Kaynak bağlantıları: yeni sekmede açılır */
function SourceLinks({ ids }: { ids: SourceId[] }) {
  const { t, lang } = useI18n()
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-dim">
      <span>{t.mindTraining.sourcesLabel}:</span>
      {ids.map((id, i) => (
        <span key={id}>
          <a href={SOURCES[id].url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-holo">
            {sourceName(id, lang)}
          </a>
          {i < ids.length - 1 ? ',' : ''}
        </span>
      ))}
    </p>
  )
}

/** "Dev ve ark., 2024" gibi kısa ad: başlıktaki parantezli yazar adından; yazar yoksa kurum */
function sourceName(id: SourceId, lang: 'tr' | 'en') {
  const s = SOURCES[id]
  const author = s.title.match(/\(([^)]+?) et al\.\)$/)?.[1]
  if (!author) return s.org
  return `${author} ${lang === 'tr' ? 've ark.' : 'et al.'}${s.date ? `, ${s.date.slice(-4)}` : ''}`
}

/** Kartın solundaki küçük çizim: egzersizin ne olduğunu bir bakışta anlatır */
/** Kart çizimindeki sabit figür (ağırlık merkezine göre ortalı) ve bakış açısı */
const GLYPH_CUBES: Vec3[] = (() => {
  const raw: Vec3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
    [2, 1, 0],
    [2, 2, 0],
    [2, 2, 1],
    [2, 2, 2],
    [1, 2, 2],
  ]
  const c = [0, 1, 2].map((k) => raw.reduce((a, v) => a + v[k], 0) / raw.length)
  return raw.map((v) => [v[0] - c[0], v[1] - c[1], v[2] - c[2]] as Vec3)
})()
const GLYPH_VIEW = multiply(axisAngle([1, 0, 0], 24), axisAngle([0, 1, 0], -35))

function Glyph({ exercise }: { exercise: MindExercise }) {
  return (
    <span aria-hidden className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-holo/[0.06] ring-1 ring-holo/20 sm:size-24 lg:size-28">
      {exercise === 'speed' && (
        <svg viewBox="0 0 100 100" className="size-[78%]">
          <circle cx="50" cy="50" r="36" fill="none" stroke="var(--color-holo)" strokeOpacity="0.25" strokeDasharray="2 4" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 - Math.PI / 2
            const lit = i === 2
            return <circle key={i} cx={50 + Math.cos(a) * 36} cy={50 + Math.sin(a) * 36} r={lit ? 6 : 3} fill="var(--color-holo)" fillOpacity={lit ? 1 : 0.3} />
          })}
          <circle cx="50" cy="50" r="9" fill="none" stroke="var(--color-ink)" strokeWidth="2" />
        </svg>
      )}
      {exercise === 'memory' && (
        <svg viewBox="0 0 100 100" className="size-[72%]">
          {Array.from({ length: 9 }, (_, i) => (
            <rect
              key={i}
              x={8 + (i % 3) * 29}
              y={8 + Math.floor(i / 3) * 29}
              width="25"
              height="25"
              rx="7"
              fill="var(--color-holo)"
              fillOpacity={i === 5 ? 0.9 : 0.08}
              stroke="var(--color-holo)"
              strokeOpacity={i === 5 ? 1 : 0.3}
            />
          ))}
        </svg>
      )}
      {exercise === 'spatial' && <BlockFigure cubes={GLYPH_CUBES} rotation={GLYPH_VIEW} className="size-[84%]" />}
    </span>
  )
}

/* ---------------- Egzersiz ---------------- */

type Phase = 'intro' | 'run' | 'done'

function ExerciseView({ exercise, sessions, onBack, reduced }: { exercise: MindExercise; sessions: MindSessionDoc[]; onBack: () => void; reduced: boolean }) {
  const { t } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const m = t.mindTraining
  const [phase, setPhase] = useState<Phase>('intro')
  const [run, setRun] = useState(0)
  const [result, setResult] = useState<{ summary: MindSummary; prevBest: number | null; saved: boolean | null } | null>(null)
  const startedAt = useRef(0)
  const mine = sessions.filter((s) => s.exercise === exercise)
  // Bellek akışı bir önceki oturumun bittiği seviyeden başlar
  const startLevel = exercise === 'memory' ? (mine[0]?.endLevel ?? 1) : 1

  const begin = () => {
    startedAt.current = Date.now()
    setResult(null)
    setRun((r) => r + 1)
    setPhase('run')
  }
  const finish = (summary: MindSummary) => {
    const prevBest = bestScore(sessions, exercise)
    setResult({ summary, prevBest, saved: null })
    setPhase('done')
    if (!astronaut || !canEdit) return
    const { stats: _stats, ...fields } = summary
    void mutate('saveMindSession', astronaut, { id: newSessionId(), ts: startedAt.current, endedAt: Date.now(), exercise, ...fields })
      .then((r) => setResult((x) => x && { ...x, saved: r?.ok === true }))
      .catch(() => setResult((x) => x && { ...x, saved: false }))
  }

  return (
    <div
      className="relative grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pt-5 pb-6 sm:px-10 sm:pb-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-8 lg:overflow-hidden"
      data-mind-training={exercise}
    >
      <section aria-label={m.names[exercise]} className="relative flex min-h-[600px] flex-col sm:min-h-[540px] lg:min-h-0">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={m.backLabel}
            data-mind-back
            className="group -ml-3 flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] text-ink-muted transition-[background-color,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.05] hover:text-ink"
          >
            <ArrowLeft size={17} className="transition-transform duration-500 group-hover:-translate-x-0.5" aria-hidden />
            {m.back}
          </button>
          <p className="font-mono text-[12.5px] font-semibold tracking-[0.14em] text-holo uppercase">{m.domains[exercise]}</p>
        </div>
        <div className="relative mt-3 min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 'intro' && <Intro key="intro" exercise={exercise} startLevel={startLevel} onStart={begin} reduced={reduced} />}
            {phase === 'run' && (
              <motion.div key={`run-${run}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}>
                {exercise === 'speed' && <QuickGlance onDone={finish} reduced={reduced} />}
                {exercise === 'memory' && <MemoryStream startLevel={startLevel} onDone={finish} reduced={reduced} />}
                {exercise === 'spatial' && <MentalRotation onDone={finish} reduced={reduced} />}
              </motion.div>
            )}
            {phase === 'done' && result && (
              <Result
                key="done"
                exercise={exercise}
                summary={result.summary}
                prevBest={result.prevBest}
                saved={canEdit && astronaut ? result.saved : null}
                onAgain={begin}
                onBack={onBack}
                reduced={reduced}
              />
            )}
          </AnimatePresence>
        </div>
      </section>

      <ExerciseInfo exercise={exercise} sessions={mine} startLevel={startLevel} />
    </div>
  )
}

/** Giriş: büyük yuvarlak başlat düğmesi (tepki testiyle aynı dil) ve egzersizin kısa tarifi */
function Intro({ exercise, startLevel, onStart, reduced }: { exercise: MindExercise; startLevel: number; onStart: () => void; reduced: boolean }) {
  const { t } = useI18n()
  const m = t.mindTraining
  const Icon = ICON[exercise]
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center gap-7 rounded-[2rem] bg-white/[0.02] px-6 text-center ring-1 ring-white/[0.06]"
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{exercise === 'memory' ? m.memory.startsAt(startLevel) : m.ready}</p>
      <div className="relative flex size-44 items-center justify-center">
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
          id="mind-start"
          onClick={onStart}
          className="group relative flex size-32 flex-col items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-holo/25 to-holo/10 font-display text-[18px] font-semibold text-holo shadow-[0_0_60px_-12px_var(--color-holo),inset_0_1px_1px_rgb(255_255_255/0.2)] ring-1 ring-holo/40 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo active:scale-[0.97]"
        >
          <Icon size={22} strokeWidth={1.75} aria-hidden className="transition-transform duration-500 group-hover:-translate-y-0.5" />
          {m.start}
        </button>
      </div>
      <p className="max-w-md text-[16px] leading-relaxed text-ink-muted">{m.teasers[exercise]}</p>
      <p className="text-[13.5px] text-ink-dim">
        {m.duration[exercise]} · {m.keysHint}
      </p>
    </motion.div>
  )
}

function Result({
  exercise,
  summary,
  prevBest,
  saved,
  onAgain,
  onBack,
  reduced,
}: {
  exercise: MindExercise
  summary: MindSummary
  prevBest: number | null
  saved: boolean | null
  onAgain: () => void
  onBack: () => void
  reduced: boolean
}) {
  const { t } = useI18n()
  const m = t.mindTraining
  const better = prevBest !== null && (MIND_BETTER[exercise] === 'lower' ? summary.score < prevBest : summary.score > prevBest)
  const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.07, delayChildren: reduced ? 0 : 0.12 } } }
  const item: Variants = reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }
  const [value, unit] = exercise === 'speed' ? [String(summary.score), 'ms'] : exercise === 'memory' ? [m.memory.level(summary.score), ''] : [String(summary.score), `/${SPATIAL.trials}`]
  const label = exercise === 'speed' ? m.speed.resultLabel : exercise === 'memory' ? m.memory.resultLabel : m.spatial.resultLabel
  const hint = exercise === 'speed' ? m.speed.resultHint : exercise === 'memory' ? m.memory.resultHint : m.spatial.resultHint
  const compare = prevBest === null ? m.firstResult : better ? m.newBest : bestText(m, exercise, prevBest)

  return (
    <motion.div
      role="status"
      data-mind-result={exercise}
      className="absolute inset-0 flex flex-col overflow-y-auto rounded-[2rem] bg-white/[0.02] p-6 ring-1 ring-white/[0.06] sm:px-8 sm:py-7"
      variants={stagger}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
    >
      <motion.p variants={item} className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">
        {label}
      </motion.p>
      <motion.div variants={item} className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
        <p className="tabular font-display text-[60px] leading-[0.9] font-semibold tracking-tight md:text-[72px]" data-mind-score>
          {value}
          {unit && <span className="ml-1.5 text-[22px] font-medium text-ink-muted">{unit}</span>}
        </p>
        <p className={`mb-2 inline-flex rounded-full px-3 py-1 text-[14px] font-semibold ring-1 ${better ? 'bg-holo/12 text-holo ring-holo/30' : 'bg-white/[0.04] text-ink-muted ring-white/10'}`}>
          {compare}
        </p>
      </motion.div>
      <motion.p variants={item} className="mt-3 max-w-lg text-[15px] leading-snug text-ink-muted">
        {hint}
      </motion.p>

      <motion.dl variants={item} className="mt-auto grid grid-cols-3 items-end gap-4 pt-8">
        {summary.stats.map((s) => (
          <div key={s.label}>
            <dt className="font-mono text-[12px] font-semibold tracking-[0.12em] text-ink-dim uppercase">{s.label}</dt>
            <dd className="tabular mt-1 font-display text-[20px] font-semibold">{s.value}</dd>
          </div>
        ))}
      </motion.dl>

      <motion.div variants={item} className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-[14.5px] ${saved === false ? 'text-ink-muted' : 'text-holo'}`} aria-live="polite">
          {saved === true ? m.saved : saved === false ? m.notSaved : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PillGhost onClick={onBack} icon={<ArrowLeft size={16} aria-hidden />}>
            {m.back}
          </PillGhost>
          <PillPrimary onClick={onAgain} icon={<RotateCcw size={16} strokeWidth={2} aria-hidden />}>
            {m.again}
          </PillPrimary>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Sağ panel: neden uzayda (kaynaklarıyla), nasıl çalışır ve bu egzersizdeki gelişim */
function ExerciseInfo({ exercise, sessions, startLevel }: { exercise: MindExercise; sessions: MindSessionDoc[]; startLevel: number }) {
  const { t } = useI18n()
  const m = t.mindTraining
  const steps = exercise === 'memory' ? m.how.memory(startLevel) : m.how[exercise]
  const best = bestScore(sessions, exercise)
  return (
    <aside aria-labelledby="mind-info-title" className="flex flex-col lg:min-h-0 lg:overflow-y-auto lg:pr-1">
      <h3 id="mind-info-title" className="font-display text-[20px] font-semibold tracking-tight">
        {m.spaceTitle}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{m.space[exercise]}</p>
      <SourceLinks ids={SOURCES_FOR[exercise]} />

      <h3 className="mt-6 font-mono text-[12px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{m.howTitle}</h3>
      <ol className="mt-2 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-snug text-ink-muted">
            <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-holo/10 font-mono text-[12.5px] font-semibold text-holo">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <h3 className="mt-6 font-mono text-[12px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{m.progressTitle}</h3>
      {sessions.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-dim">{m.progressEmpty}</p>
      ) : (
        <>
          {/* Tek oturumda çizgi olmaz: grafik ikinci oturumdan sonra çizilir */}
          {sessions.length > 1 && <ProgressChart exercise={exercise} sessions={sessions} />}
          <p className="mt-2 text-[14.5px] text-ink-muted">
            {best !== null && bestText(m, exercise, best)} · {m.sessions(sessions.length)}
          </p>
        </>
      )}
    </aside>
  )
}

/** Son oturumların çizgi grafiği; hızda kısa süre iyi olduğu için eksen ters çevrilir (yukarı her zaman daha iyi) */
function ProgressChart({ exercise, sessions }: { exercise: MindExercise; sessions: MindSessionDoc[] }) {
  const { t } = useI18n()
  const m = t.mindTraining
  const points = [...sessions].slice(0, 10).reverse()
  const values = points.map((p) => p.score)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const up = MIND_BETTER[exercise] === 'higher'
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100)
  const y = (v: number) => {
    const f = (v - lo) / span
    return 88 - (up ? f : 1 - f) * 76
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.score).toFixed(2)}`).join(' ')
  return (
    <figure role="img" aria-label={m.chartLabel(m.names[exercise], points.length)} className="relative mt-3 h-24 shrink-0" data-mind-chart>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="mind-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-holo)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-holo)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 1 && <path d={`${path} L${x(points.length - 1)},100 L${x(0)},100 Z`} fill="url(#mind-area)" />}
        <path d={path} fill="none" stroke="var(--color-holo)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((p, i) => (
        <span
          key={p.id}
          aria-hidden
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-holo ${i === points.length - 1 ? 'size-2.5 shadow-[0_0_10px_var(--color-holo)] ring-4 ring-holo/20' : 'size-1.5 opacity-70'}`}
          style={{ left: `${x(i)}%`, top: `${y(p.score)}%` }}
        />
      ))}
    </figure>
  )
}

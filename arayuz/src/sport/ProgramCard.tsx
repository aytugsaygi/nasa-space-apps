import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Info, Orbit, Pause, Play, Sparkles, Square, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { doneMinutes, ENV_PLANS, EXERCISES, PROGRAM_ENVIRONMENT, programMinutes } from '../core/coach'
import { SOURCES } from '../core/sources'
import { useHealth, useQuery } from '../data/health'
import { resolve, useI18n } from '../i18n'
import { setTrainer, useTrainer } from './trainerStore'

/**
 * Günün antrenman programı: istasyondaki cihazlara göre hareketler, setler ve süreler (program her zaman istasyon
 * programıdır). Şikayete göre uyarlanan hareketler not taşır ("Sağ elin için hafif yükle"). Her hareketin yanındaki
 * Göster düğmesi hologram antrenörde hareketi oynatır; tekrar basınca duraklatır. Gösterilen hareketin yanında
 * bitir (kare) düğmesi kayarak açılır.
 */
export function ProgramCard() {
  const { t, lang } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const program = useQuery('program', astronaut ? [astronaut] : null)
  const plan = ENV_PLANS[PROGRAM_ENVIRONMENT]
  const trainer = useTrainer()
  const reduce = useReducedMotion()
  const total = program ? programMinutes(program) : 0
  const done = program ? doneMinutes(program) : 0
  const allDone = program?.items.every((i) => i.done)

  return (
    <section id="tour-program" aria-labelledby="program-title" className="panel flex size-full min-h-0 flex-col overflow-hidden !rounded-3xl">
      <header className="shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="program-title" className="font-display text-[18px] font-semibold">
            {t.sport.programTitle}
          </h2>
          <span className="tabular font-mono text-[14px] text-ink-dim">{t.sport.programSub(done, total)}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
          <div className="h-full rounded-full bg-holo transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        {program?.skipped && (
          <p role="alert" className="mt-2 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/[0.06] px-3 py-2 text-[14.5px] text-ink">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
            {t.sport.skipped}
          </p>
        )}
        {program && program.adaptedFor.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-[14px] text-holo">
            <Sparkles size={13} aria-hidden />
            {t.sport.complaintsActive(program.adaptedFor.length)}
          </p>
        )}
        {allDone && <p className="mt-2 text-[14.5px] text-ok">{t.sport.allDone}</p>}
      </header>

      <ol data-wheel-scroll className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {program?.items.map((it, i) => {
          const ex = EXERCISES[it.exercise]
          const name = resolve(ex.name, lang)
          const showing = trainer.exercise === it.exercise && trainer.index === i
          return (
            <li
              key={`${it.exercise}-${i}`}
              data-exercise={it.exercise}
              data-done={it.done || undefined}
              className={`rounded-2xl border px-3 py-2.5 transition-colors ${showing ? 'border-holo/50 bg-holo/[0.06]' : 'border-line bg-white/[0.015]'}`}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => astronaut && void mutate('setExerciseDone', astronaut, i, !it.done)}
                  aria-pressed={it.done}
                  aria-label={it.done ? t.sport.markUndone(name) : t.sport.markDone(name)}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-default ${it.done ? 'border-ok/50 bg-ok/15 text-ok' : 'border-line-strong text-transparent hover:border-holo/50'}`}
                >
                  <Check size={15} strokeWidth={3} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15.5px] font-medium ${it.done ? 'text-ink-dim line-through decoration-ink-dim/50' : 'text-ink'}`}>{name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13.5px] text-ink-dim">
                    <span>{t.sport.device[ex.device]}</span>
                    <span className="tabular font-mono">
                      {it.sets && it.reps ? t.sport.sets(it.sets, it.reps) : it.sets ? t.sport.setsOnly(it.sets) : ''} {it.sets ? '·' : ''} {t.sport.minutes(it.minutes)}
                    </span>
                    {it.intensity === 'light' && <span className="rounded-md bg-holo/10 px-1.5 py-px text-[12.5px] font-semibold text-holo">{t.sport.light}</span>}
                  </p>
                  {it.note && <p className="mt-1 text-[14px] leading-snug text-holo">{resolve(it.note, lang)}</p>}
                </div>
                {/* Gösterilen harekette düğme duraklat/sürdür olur: tekrar basınca animasyon durur, bir daha basınca devam eder */}
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => (showing ? setTrainer({ playing: !trainer.playing }) : setTrainer({ exercise: it.exercise, playing: true, index: i }))}
                    aria-label={!showing ? t.sport.showLabel(name) : trainer.playing ? t.sport.pauseLabel(name) : t.sport.resumeLabel(name)}
                    aria-pressed={showing && trainer.playing}
                    data-state={!showing ? 'idle' : trainer.playing ? 'playing' : 'paused'}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[14px] font-semibold ring-1 transition-colors ${
                      !showing
                        ? 'bg-holo/10 text-holo ring-holo/30 hover:bg-holo/15'
                        : trainer.playing
                          ? 'bg-holo text-void ring-holo hover:bg-holo/85'
                          : 'bg-holo/20 text-holo ring-holo/60 hover:bg-holo/25'
                    }`}
                  >
                    {showing && trainer.playing ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
                    {!showing ? t.sport.show : trainer.playing ? t.sport.showing : t.sport.paused}
                  </button>
                  {/* Bitir: yalnızca gösterilen harekette, Göster düğmesinin sağından kayarak açılır */}
                  <AnimatePresence initial={false}>
                    {showing && (
                      <motion.button
                        key="stop"
                        type="button"
                        onClick={() => setTrainer({ exercise: null, playing: false, index: null })}
                        aria-label={t.sport.stopLabel(name)}
                        data-stop
                        initial={reduce ? { opacity: 0 } : { width: 0, marginLeft: 0, opacity: 0, scale: 0.6 }}
                        animate={reduce ? { opacity: 1 } : { width: 36, marginLeft: 6, opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { width: 0, marginLeft: 0, opacity: 0, scale: 0.6 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                        style={reduce ? { width: 36, marginLeft: 6 } : undefined}
                        className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-ink-muted ring-1 ring-line-strong transition-colors hover:bg-crit/10 hover:text-crit hover:ring-crit/50"
                      >
                        <Square size={13} fill="currentColor" aria-hidden />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {/* Program ve dayanak: program istasyondaki cihazlara göre kurulur; şikayet notları ve kaynaklar (R-02) "i" düğmesinde */}
      <div className="relative flex shrink-0 items-center gap-2 border-t border-line px-5 py-2.5 text-[14px]">
        <p className="flex items-center gap-1.5 font-medium text-ink-muted">
          <Orbit size={13} className="text-holo" aria-hidden />
          {t.sport.stationProgram}
        </p>
        <EnvInfo label={t.sport.envInfo}>
          {/* Şikayete göre yapılan değişiklikler madde madde; ortam notu ayrı */}
          {program && program.notes.length > 0 && (
            <ul className="space-y-1">
              {program.notes.map((n) => (
                <li key={n.tr} className="flex gap-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-holo" aria-hidden />
                  {resolve(n, lang)}
                </li>
              ))}
            </ul>
          )}
          <p data-env-note className={program && program.notes.length > 0 ? 'border-t border-line pt-1.5' : undefined}>
            {resolve(plan.note, lang)}
          </p>
          <p className="text-[13px] text-ink-dim">
            {t.sport.sourcesLabel}:{' '}
            {plan.sources.map((id, i) => (
              <span key={id}>
                {i > 0 && ' · '}
                <a href={SOURCES[id].url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-holo">
                  {SOURCES[id].title.split(' (')[0].split(':')[0]}
                </a>
              </span>
            ))}
          </p>
        </EnvInfo>
      </div>
    </section>
  )
}

/**
 * Ortam notları ve kaynaklar için küçük "i" düğmesi. Üzerine gelince, klavyeyle odaklanınca ya da dokununca açılır;
 * içindeki kaynak bağlantılarına tıklanabilsin diye panel düğmeden panele geçerken kapanmaz. Escape, dışarı çıkma ve
 * odağın panelden ayrılması kapatır.
 */
function EnvInfo({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = () => {
    clearTimeout(timer.current)
    setOpen(true)
  }
  const hideSoon = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(false), 180)
  }
  const hover = {
    onPointerEnter: (e: PointerEvent) => e.pointerType !== 'touch' && show(),
    onPointerLeave: (e: PointerEvent) => e.pointerType !== 'touch' && hideSoon(),
  }
  return (
    <span
      className="contents"
      onFocus={show}
      onBlur={(e: FocusEvent<HTMLSpanElement>) => {
        // Odak düğmeden panele (bağlantılara) geçerken açık kalır
        if (!(e.relatedTarget as HTMLElement | null)?.closest('[data-env-info]')) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        id="program-info"
        data-env-info
        aria-label={label}
        aria-expanded={open}
        aria-controls="program-info-panel"
        onClick={show}
        {...hover}
        className={`ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${open ? 'border-holo/50 text-holo' : 'border-line text-ink-muted hover:border-line-strong hover:text-holo'}`}
      >
        <Info size={15} aria-hidden />
      </button>
      {open && (
        <div
          id="program-info-panel"
          data-env-info
          role="region"
          aria-label={label}
          {...hover}
          className="absolute inset-x-3 bottom-full z-20 mb-1.5 space-y-1.5 rounded-xl border border-holo/30 bg-raised/95 px-3.5 py-2.5 text-[14px] leading-snug text-ink-muted shadow-2xl backdrop-blur-md"
        >
          {children}
        </div>
      )}
    </span>
  )
}

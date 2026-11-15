import { ArrowLeft, Bird, Check, CloudRain, Flame, Info, Pause, PenLine, Play, Square, Timer, Volume2, VolumeX, Waves } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GLASS_EASE as EASE, GlassDialog, PillGhost, PillPrimary } from '../components/GlassDialog'
import type { BreathingFeedback } from '../core/breathingLog'
import { BREATHING_FEEDBACK } from '../core/breathingLog'
import { useHealth } from '../data/health'
import { useI18n } from '../i18n'
import { playBreathTick, startAmbience, type Ambience } from '../lib/audio'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion } from '../lib/settings'
import { BREATHING_SESSION_CONFIG, defaultSessionSettings, pacingPattern, type BreathingSessionConfig, type BreathingSessionSettings } from './breathing'
import { EmergencyPaths } from './EmergencySupport'
import { frameAt, pauseClock, resumeClock, startClock, type SessionClock, type SessionFrame } from './sessionClock'

/*
 * Nefes egzersizi (docs/wellbeing BR-01…BR-07), check-in ile aynı cam pencerede.
 * Kurulum: sorular tek tek gelir; seçince kısa bir an sonra kendiliğinden sonraki soruya geçilir (Geri / İleri da var).
 *   1. Ne kadar süre? (1, 3, 5 dakika)
 *   2. Arka plan sesi ister misin? → Evet ise hangi ses: dalgalar, kuş sesleri, ateş çıtırtısı, yağmur
 *   3. Nefes geçişlerinde tık sesi olsun mu? (gözler kapalıyken takip için)
 *   Sonra hazır ekranı: seçimlerin özeti (satıra basınca o soruya dönülür) ve Başlat. Hiçbir şey kendiliğinden başlamaz.
 * Oturum: nefese göre büyüyüp küçülen bir küre; ortada evre ve evrenin geri sayımı, üstte kalan süre. Tık açıksa her
 * al ↔ ver geçişinde kısa bir ses (alırken ince, verirken kalın).
 * Zamanlama: tek zaman kaynağı (sessionClock); aralık yalnızca yeniden çizimi tetikler. Duraklatılan süre sayılmaz.
 * Arka plan: sayfa gizlenince oturum duraklar ve ses durur; dönünce kendiliğinden sürmez.
 * Ses: ortam sesi yalnızca oturum çalışırken çalar; duraklatma, gizlenme, bitiş ve kapanışta durur. Sesler cihazda
 * üretilir (lib/audio), dosya yoktur.
 * Hareketi azaltma tercihi (oturum sürerken değişse de): yalnızca sabit bir odak noktası, evre yazısı ve süre.
 * Kayıt: oturumun üst bilgisi ve isteğe bağlı geri bildirim; puan ya da başarı ölçüsü yok.
 */

type Stage = 'setup' | 'running' | 'paused' | 'earlyEnd' | 'complete'
type Step = 'duration' | 'sound' | 'soundPick' | 'click' | 'ready'
/** İlerleme çizgileri: ses seçimi "ses" adımının parçasıdır */
const SEGMENTS: Exclude<Step, 'soundPick'>[] = ['duration', 'sound', 'click', 'ready']
const QUESTION_COUNT = 3
const AMBIENCES: Ambience[] = ['waves', 'birds', 'fire', 'rain']
const AMBIENCE_ICON: Record<Ambience, typeof Waves> = { waves: Waves, birds: Bird, fire: Flame, rain: CloudRain }

/** Yeniden çizim aralığı: yalnızca görüntüyü tazeler; zaman her seferinde saatten okunur */
const REDRAW_MS = 100
/** Seçimden sonra sonraki soruya geçmeden önceki an: yalnızca seçim işaretinin bir an görüldüğü kadar */
const AUTO_ADVANCE_MS = 150

const newSessionId = () => `bs_${crypto.randomUUID().replaceAll('-', '')}`

/** Destek kütüphanesindeki "Başlat" ile açılan pencere */
export function BreathingDialog({ open, onClose, config = BREATHING_SESSION_CONFIG }: { open: boolean; onClose: () => void; config?: BreathingSessionConfig }) {
  const { t } = useI18n()
  const l = t.mindPage.library
  return (
    <GlassDialog open={open} onClose={onClose} id="breathing-sheet" title={l.breathing.title} subtitle={t.mindPage.breath.subtitle(config.pacing.inhaleSeconds, config.pacing.exhaleSeconds)} closeLabel={l.close}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <BreathingBreak config={config} onClose={onClose} />
      </div>
    </GlassDialog>
  )
}

/** Kişinin verdiği cevaplar; verilmeyen soru için varsayılan geçerlidir (3 dakika, sessiz, tık kapalı) */
interface Picks {
  duration?: number
  sound?: 'yes' | 'no'
  ambience?: Ambience
  click?: 'yes' | 'no'
}

export function BreathingBreak({ config = BREATHING_SESSION_CONFIG, onClose }: { config?: BreathingSessionConfig; onClose?: () => void }) {
  const { t, locale } = useI18n()
  const { astronaut, canEdit, mutate } = useHealth()
  const b = t.mindPage.breath
  const reducedMotion = usePrefersReducedMotion()
  const [picks, setPicks] = useState<Picks>({})
  const [stage, setStage] = useState<Stage>('setup')
  const [nav, setNav] = useState<{ step: Step; dir: 1 | -1; editing: boolean; moved: boolean }>({ step: 'duration', dir: 1, editing: false, moved: false })
  const [settings, setSettings] = useState<BreathingSessionSettings>(() => defaultSessionSettings(reducedMotion, config))
  const [frame, setFrame] = useState<SessionFrame | null>(null)
  const [hiddenPause, setHiddenPause] = useState(false)
  const [audioFailed, setAudioFailed] = useState(false)
  const [feedback, setFeedback] = useState<BreathingFeedback | 'skipped' | null>(null)
  const clock = useRef<SessionClock | null>(null)
  const session = useRef<{ id: string; startedAt: number } | null>(null)
  const stopAmbience = useRef<(() => void) | null>(null)
  const lastPhase = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pattern = pacingPattern(config.pacing)
  const totalMs = settings.durationMin * 60_000
  // Oturum ve sonrasındaki ekranlarda otomatik içerik (ör. check-in sorusu) açılmaz
  useInteraction('breathing', stage !== 'setup')

  /** Cevaplardan oturum ayarları (görünüm sorulmaz: hareketi azaltma tercihinden gelir) */
  const toSettings = (p: Picks): BreathingSessionSettings => ({
    durationMin: p.duration ?? config.defaultDurationMin,
    visual: reducedMotion ? 'still' : 'animated',
    audio: p.sound === 'yes' && p.ambience ? p.ambience : 'silent',
    click: p.click === 'yes',
  })

  const ambienceOn = (s: BreathingSessionSettings = settings) => {
    if (s.audio === 'silent' || stopAmbience.current) return
    const stop = startAmbience(s.audio)
    if (stop) stopAmbience.current = stop
    else setAudioFailed(true)
  }
  const ambienceOff = () => {
    stopAmbience.current?.()
    stopAmbience.current = null
  }

  /** Oturum kaydı: yalnızca üst bilgi (puan yok); yazılamazsa mola etkilenmez */
  const record = (outcome: 'completed' | 'endedEarly', activeMs: number) => {
    const s = session.current
    if (!s || !astronaut || !canEdit) return
    void mutate('saveBreathingSession', astronaut, {
      id: s.id,
      ts: s.startedAt,
      endedAt: Date.now(),
      plannedMs: totalMs,
      activeMs: Math.round(activeMs),
      outcome,
      durationMin: settings.durationMin,
      visual: settings.visual,
      audio: settings.audio,
      click: settings.click,
      pacingId: config.pacing.id,
    }).catch(() => {})
  }

  const draw = () => {
    if (!clock.current) return null
    const f = frameAt(clock.current, Date.now(), totalMs, pattern)
    setFrame(f)
    // Evre değişince tık (gözler kapalıyken takip için)
    if (f.phase.phase !== lastPhase.current) {
      if (lastPhase.current !== null && settings.click && !f.done) playBreathTick(f.phase.phase === 'exhale' ? 'exhale' : 'inhale')
      lastPhase.current = f.phase.phase
    }
    return f
  }

  // Çalışırken tek yeniden çizim döngüsü; süre dolunca tamamlanır
  useEffect(() => {
    if (stage !== 'running') return
    const loop = setInterval(() => {
      const f = draw()
      if (f?.done) {
        clearInterval(loop)
        ambienceOff()
        clock.current = pauseClock(clock.current!, Date.now())
        record('completed', f.elapsedMs)
        setStage('complete')
      }
    }, REDRAW_MS)
    return () => clearInterval(loop)
    // draw ve record her çizimde yeniden oluşur; döngü yalnızca aşama değişince kurulur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // Sayfa gizlenince duraklat (belgelenmiş davranış); dönünce kendiliğinden sürmez
  useEffect(() => {
    if (stage !== 'running') return
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      clock.current = pauseClock(clock.current!, Date.now())
      ambienceOff()
      setHiddenPause(true)
      draw()
      setStage('paused')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // Çıkışta (pencere kapanınca) bütün sesler kesin durur
  useEffect(
    () => () => {
      ambienceOff()
      if (timer.current) clearTimeout(timer.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // Adım değişince bekleyen otomatik geçiş iptal olur
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [nav.step])

  /* ---------- Kurulum gezintisi ---------- */

  const order = (p: Picks): Step[] => (p.sound === 'yes' ? ['duration', 'sound', 'soundPick', 'click', 'ready'] : ['duration', 'sound', 'click', 'ready'])
  const go = (step: Step, dir: 1 | -1, editing = false) => setNav({ step, dir, editing, moved: true })
  const nextFrom = (step: Step, p: Picks, editing: boolean) => {
    // Özetten gelindiyse: ses "evet" denince önce hangi ses sorulur, sonra özete dönülür
    if (editing && !(step === 'sound' && p.sound === 'yes' && !p.ambience)) return go('ready', 1)
    const list = order(p)
    go(list[Math.min(list.length - 1, list.indexOf(step) + 1)], 1, editing && step === 'sound')
  }
  const next = () => nextFrom(nav.step, picks, nav.editing)
  const back = () => {
    const list = order(picks)
    go(list[Math.max(0, list.indexOf(nav.step) - 1)], -1)
  }
  const choose = (patch: Picks) => {
    const p = { ...picks, ...patch }
    setPicks(p)
    // Seçim sırasında ses çalınmaz; sesler yalnızca oturum başlayınca çalar
    if (timer.current) clearTimeout(timer.current)
    const from = nav.step
    const editing = nav.editing
    timer.current = setTimeout(() => nextFrom(from, p, editing), AUTO_ADVANCE_MS)
  }

  const start = () => {
    const s = toSettings(picks)
    setSettings(s)
    session.current = { id: newSessionId(), startedAt: Date.now() }
    clock.current = startClock(Date.now())
    lastPhase.current = null
    setAudioFailed(false)
    setHiddenPause(false)
    setFeedback(null)
    const f = frameAt(clock.current, Date.now(), s.durationMin * 60_000, pattern)
    lastPhase.current = f.phase.phase
    setFrame(f)
    setStage('running')
    ambienceOn(s)
    if (s.click) playBreathTick('inhale')
  }
  /** Bitişten sonra "Ayarlara dön": özetten başlanır */
  const toSetup = () => {
    setNav({ step: 'ready', dir: -1, editing: false, moved: true })
    setStage('setup')
  }
  const pause = () => {
    clock.current = pauseClock(clock.current!, Date.now())
    ambienceOff()
    draw()
    setStage('paused')
  }
  const resume = () => {
    clock.current = resumeClock(clock.current!, Date.now())
    setHiddenPause(false)
    draw()
    setStage('running')
    ambienceOn()
  }
  const finish = () => {
    clock.current = pauseClock(clock.current!, Date.now())
    ambienceOff()
    const f = draw()
    record('endedEarly', f?.elapsedMs ?? 0)
    setStage('earlyEnd')
  }
  const answer = (value: BreathingFeedback | 'skipped') => {
    setFeedback(value)
    const s = session.current
    if (value !== 'skipped' && s && astronaut && canEdit) void mutate('setBreathingFeedback', astronaut, s.id, value).catch(() => {})
  }

  // Klavye (kurulumda): rakam seçer, ← → geçer; yazı alanı yok
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  const onKey = (e: KeyboardEvent) => {
    if (stage !== 'setup' || e.altKey || e.ctrlKey || e.metaKey) return
    const options = optionsFor(nav.step)
    const n = Number(e.key)
    if (options && Number.isInteger(n) && n >= 1 && n <= options.length) {
      e.preventDefault()
      choose(options[n - 1])
    } else if (e.key === 'ArrowRight' && nav.step !== 'ready') {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft' && nav.step !== 'duration') {
      e.preventDefault()
      back()
    }
  }
  useEffect(() => {
    keyRef.current = onKey
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])
  const optionsFor = (step: Step): Picks[] | null =>
    step === 'duration'
      ? config.durationsMin.map((m) => ({ duration: m }))
      : step === 'sound'
        ? [{ sound: 'yes' }, { sound: 'no' }]
        : step === 'soundPick'
          ? AMBIENCES.map((a) => ({ ambience: a }))
          : step === 'click'
            ? [{ click: 'yes' }, { click: 'no' }]
            : null

  /* ---------- Görünümler ---------- */

  if (stage === 'setup') {
    const s = toSettings(picks)
    const segment = nav.step === 'soundPick' ? 'sound' : nav.step
    return (
      <div className="relative flex min-h-[460px] flex-1 flex-col" data-setup-step={nav.step}>
        <Progress current={SEGMENTS.indexOf(segment)} />
        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
            <Slide key={nav.step} dir={nav.dir} reduced={reducedMotion}>
              {nav.step === 'ready' ? (
                <Ready settings={s} config={config} onJump={(step) => go(step, -1, true)} focus={nav.moved} />
              ) : (
                <Question
                  step={nav.step}
                  picks={picks}
                  config={config}
                  onChoose={choose}
                  focus={nav.moved}
                  index={nav.step === 'duration' ? 1 : nav.step === 'click' ? 3 : 2}
                  reduced={reducedMotion}
                />
              )}
            </Slide>
          </AnimatePresence>
        </div>
        <footer className="relative flex shrink-0 flex-wrap items-center gap-3 px-6 pt-3 pb-6 sm:px-10 sm:pb-8">
          {nav.step !== 'duration' ? (
            <PillGhost onClick={back} icon={<ArrowLeft size={17} strokeWidth={1.5} aria-hidden />}>
              {b.back}
            </PillGhost>
          ) : (
            <span />
          )}
          <span className="flex-1" />
          {nav.step === 'ready' ? (
            <PillPrimary onClick={start} large icon={<Play size={18} strokeWidth={2} aria-hidden />}>
              {b.start}
            </PillPrimary>
          ) : (
            <PillPrimary onClick={next}>{nav.editing ? b.toSummary : b.next}</PillPrimary>
          )}
        </footer>
      </div>
    )
  }

  if (stage === 'earlyEnd' || stage === 'complete') {
    return (
      <div className="relative flex min-h-[460px] flex-1 flex-col items-center justify-center px-6 py-8 text-center sm:px-10" data-stage={stage}>
        {stage === 'earlyEnd' ? (
          <>
            <p role="status" className="max-w-lg font-display text-[26px] leading-snug font-semibold tracking-tight md:text-[30px]">
              {b.earlyEnd}
            </p>
            <EndActions onSetup={toSetup} onClose={onClose} />
          </>
        ) : (
          <>
            <motion.span
              aria-hidden
              className="mb-6 flex size-16 items-center justify-center rounded-full bg-holo/15 text-holo shadow-[0_0_40px_-6px_var(--color-holo)] ring-1 ring-holo/40"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <Check size={26} strokeWidth={2} />
            </motion.span>
            <p role="status" className="max-w-lg font-display text-[26px] leading-snug font-semibold tracking-tight md:text-[30px]">
              {b.complete}
            </p>
            {feedback === null ? (
              <>
                <div role="group" aria-label={b.feedbackLabel} className="mt-7 flex w-full max-w-md flex-col gap-1">
                  {BREATHING_FEEDBACK.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => answer(f)}
                      className="group relative min-h-12 rounded-full px-6 text-left text-[17px] text-ink-muted transition-colors duration-300 hover:text-ink"
                    >
                      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.16] via-holo/[0.05] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
                      <span className="relative">{b.feedback[f]}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => answer('skipped')} className="mt-4 min-h-11 px-3 text-[14.5px] text-ink-dim underline-offset-4 hover:text-ink hover:underline">
                  {b.skip}
                </button>
              </>
            ) : feedback === 'moreUncomfortable' ? (
              // Daha rahatsız: başka bir mola önerilmez; isteğe bağlı olarak bir insana ulaşma yolları gösterilir
              <section aria-label={t.mindPage.emergency.title} className="mt-6 flex w-full max-w-lg flex-col gap-3 text-left" data-support>
                <p className="text-[15.5px] leading-snug text-ink">{b.support}</p>
                <EmergencyPaths onLeave={onClose} />
                <EndActions onClose={onClose} />
              </section>
            ) : (
              <>
                {feedback !== 'skipped' && <p className="mt-4 text-[15.5px] text-ink-muted">{b.thanks}</p>}
                <EndActions onSetup={toSetup} onClose={onClose} />
              </>
            )}
          </>
        )}
      </div>
    )
  }

  // Oturum (çalışıyor ya da duraklatılmış)
  const f = frame!
  const still = settings.visual === 'still' || reducedMotion
  const time = new Intl.DateTimeFormat(locale, { minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(f.remainingSeconds * 1000)
  const progress = Math.min(1, f.elapsedMs / totalMs)
  const pct = Math.round(progress * 100)
  // Küre: nefes alırken büyür, verirken küçülür (geniş bir aralık; çember hep görünür)
  const scale = 0.42 + 0.58 * f.phase.openness
  const phaseText = stage === 'paused' ? b.paused : b.phase[f.phase.phase]
  return (
    <div className="relative flex min-h-[460px] flex-1 flex-col items-center justify-between gap-4 px-6 pt-4 pb-6 sm:px-10 sm:pb-8" data-visual={still ? 'still' : 'animated'} data-stage={stage}>
      {/* Üst: kalan süre ve molanın ilerlemesi */}
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <p role="timer" aria-label={b.timerLabel} className="tabular font-display text-[30px] font-semibold tracking-tight text-ink" data-remaining={f.remainingSeconds}>
          {time}
        </p>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={b.progressLabel(pct)}>
          <div className="h-full origin-left rounded-full bg-holo shadow-[0_0_10px_var(--color-holo)] transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${progress})` }} />
        </div>
        {settings.audio !== 'silent' && (
          <p className="flex items-center gap-1.5 text-[13.5px] text-ink-dim">
            <Volume2 size={14} strokeWidth={1.5} aria-hidden />
            {b.audioModes[settings.audio]}
          </p>
        )}
      </div>

      {/* Orta: küre ve yönerge */}
      <div className="relative flex aspect-square w-[min(58vw,22rem)] items-center justify-center md:w-[min(46vh,24rem)]">
        {still ? (
          // Sabit odak noktası: hiçbir şey hareket etmez
          <span className="absolute size-3 rounded-full bg-holo" data-focus-point aria-hidden />
        ) : (
          <>
            {/* Kılavuz halka: kürenin en büyük hâli */}
            <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-white/[0.07]" />
            <span aria-hidden className="absolute inset-[22%] rounded-full ring-1 ring-white/[0.05]" />
            {/* Arkadaki yumuşak ışık */}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(111_233_214/0.32),transparent_65%)] blur-2xl transition-transform duration-100 ease-linear"
              style={{ transform: `scale(${scale * 1.1})` }}
            />
            {/* Gecikmeli dış halka: küreyi yumuşakça izler */}
            <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-holo/35 transition-transform duration-700 ease-out" style={{ transform: `scale(${Math.min(1, scale * 1.08)})` }} />
            {/* Küre */}
            <span
              data-circle
              aria-hidden
              className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_38%_32%,rgb(190_255_244/0.55),rgb(111_233_214/0.26)_42%,rgb(111_233_214/0.08)_72%,transparent)] shadow-[0_0_80px_-10px_rgb(111_233_214/0.55),inset_0_1px_1px_rgb(255_255_255/0.25)] ring-1 ring-holo/45 transition-transform duration-100 ease-linear"
              style={{ transform: `scale(${scale})` }}
            />
          </>
        )}
        {/* Yönerge: kürenin ortasında */}
        <div className={`relative flex flex-col items-center gap-1 text-center ${still ? 'mt-16' : ''}`}>
          <p aria-live="polite" className="font-display text-[30px] font-semibold tracking-tight text-ink md:text-[34px]" data-phase={f.phase.phase}>
            {phaseText}
          </p>
          {stage === 'running' && <p className="tabular font-mono text-[14px] text-ink-muted">{b.phaseLeft(f.phase.remaining)}</p>}
        </div>
      </div>

      {/* Alt: tek duraklatma; duraklatılınca devam et ve bitir */}
      <div className="flex flex-col items-center gap-3">
        {stage === 'paused' && hiddenPause && <p className="max-w-md text-center text-[15px] text-ink-muted">{b.pausedHidden}</p>}
        {audioFailed && <p className="text-center text-[14.5px] text-ink-muted">{b.audioUnavailable}</p>}
        <div className="flex flex-wrap justify-center gap-2">
          {stage === 'running' ? (
            <PillGhost onClick={pause} icon={<Pause size={17} strokeWidth={1.75} aria-hidden />}>
              {b.pause}
            </PillGhost>
          ) : (
            <>
              <PillPrimary onClick={resume} icon={<Play size={17} strokeWidth={2} aria-hidden />}>
                {b.resume}
              </PillPrimary>
              <PillGhost onClick={finish} icon={<Square size={15} strokeWidth={1.75} aria-hidden />}>
                {b.finish}
              </PillGhost>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- Kurulum parçaları ---------- */

/** İlerleme: dört çizgi (süre, ses, tık, hazır); yalnızca bulunulan adım yanar */
function Progress({ current }: { current: number }) {
  return (
    <div className="relative mt-6 flex shrink-0 gap-1.5 px-6 sm:px-10" aria-hidden>
      {SEGMENTS.map((s, i) => (
        <span key={s} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          <span className={`absolute inset-0 origin-left rounded-full bg-holo transition-[transform,box-shadow] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${i === current ? 'scale-x-100 shadow-[0_0_10px_var(--color-holo)]' : 'scale-x-0'}`} />
        </span>
      ))}
    </div>
  )
}

function Slide({ dir, reduced, children }: { dir: 1 | -1; reduced: boolean; children: ReactNode }) {
  const v: Variants = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 48, filter: 'blur(6px)' }),
        center: { opacity: 1, x: 0, filter: 'blur(0px)' },
        exit: (d: number) => ({ opacity: 0, x: d * -32, filter: 'blur(4px)', transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }),
      }
  return (
    <motion.div custom={dir} variants={v} initial="enter" animate="center" exit="exit" transition={{ duration: reduced ? 0.12 : 0.3, ease: EASE }} className="scroll-thin absolute inset-0 overflow-y-auto px-6 py-5 sm:px-10">
      <div className="flex min-h-full flex-col justify-center">{children}</div>
    </motion.div>
  )
}

/** Tek soru: solda büyük sıra numarası ve soru, sağda seçenekler (oval, sağa doğru solan vurgu) */
function Question({ step, picks, config, onChoose, focus, index, reduced }: { step: Exclude<Step, 'ready'>; picks: Picks; config: BreathingSessionConfig; onChoose: (p: Picks) => void; focus: boolean; index: number; reduced: boolean }) {
  const { t } = useI18n()
  const b = t.mindPage.breath
  const ids = useId()
  const heading = useFocusOnMount<HTMLHeadingElement>(focus)
  const label = step === 'duration' ? b.askDuration : step === 'sound' ? b.askSound : step === 'soundPick' ? b.askSoundPick : b.askClick
  const hint = step === 'duration' ? b.durationHint : step === 'soundPick' ? b.soundPickHint : step === 'click' ? b.clickYesDesc : null
  const options: { key: string; label: string; desc?: string; icon?: ReactNode; checked: boolean; pick: Picks }[] =
    step === 'duration'
      ? config.durationsMin.map((m) => ({ key: String(m), label: b.minutes(m), icon: <Timer size={18} strokeWidth={1.5} />, checked: picks.duration === m, pick: { duration: m } }))
      : step === 'sound'
        ? [
            { key: 'yes', label: b.soundYes, icon: <Volume2 size={18} strokeWidth={1.5} />, checked: picks.sound === 'yes', pick: { sound: 'yes' } },
            { key: 'no', label: b.soundNo, icon: <VolumeX size={18} strokeWidth={1.5} />, checked: picks.sound === 'no', pick: { sound: 'no' } },
          ]
        : step === 'soundPick'
          ? AMBIENCES.map((a) => {
              const Icon = AMBIENCE_ICON[a]
              return { key: a, label: b.audioModes[a], desc: b.audioDesc[a], icon: <Icon size={18} strokeWidth={1.5} />, checked: picks.ambience === a, pick: { ambience: a } }
            })
          : [
              { key: 'yes', label: b.clickYes, checked: picks.click === 'yes', pick: { click: 'yes' } },
              { key: 'no', label: b.clickNo, checked: picks.click === 'no', pick: { click: 'no' } },
            ]
  const list: Variants = { hidden: {}, show: { transition: { staggerChildren: reduced ? 0 : 0.05, delayChildren: reduced ? 0 : 0.08 } } }
  const item: Variants = reduced ? { hidden: { opacity: 0 }, show: { opacity: 1 } } : { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-14">
      <div className="min-w-0">
        <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{b.questionOf(index, QUESTION_COUNT)}</p>
        <p aria-hidden className="mt-3 bg-gradient-to-b from-white/30 to-white/0 bg-clip-text font-display text-[84px] leading-[0.85] font-semibold tracking-tight text-transparent tabular-nums md:text-[112px]">
          {String(index).padStart(2, '0')}
        </p>
        <h3 ref={heading} id={`${ids}-label`} tabIndex={-1} className="mt-5 font-display text-[28px] leading-[1.12] font-semibold tracking-tight text-balance outline-none md:text-[36px]">
          {label}
        </h3>
        {hint && <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-muted">{hint}</p>}
      </div>
      <motion.fieldset data-question={step} aria-labelledby={`${ids}-label`} className="min-w-0 self-center" variants={list} initial="hidden" animate="show">
        {options.map((o, i) => (
          <motion.label key={o.key} variants={item} className="group/opt relative my-1 flex min-h-[3.75rem] cursor-pointer items-center gap-4 rounded-full py-3 pr-3 pl-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo">
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.2] via-holo/[0.07] to-transparent transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${o.checked ? 'opacity-100' : 'opacity-0 group-hover/opt:opacity-40'}`}
            />
            <input
              type="radio"
              name={`${ids}-${step}`}
              value={o.key}
              checked={o.checked}
              onChange={() => onChoose(o.pick)}
              onClick={() => o.checked && onChoose(o.pick)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
            />
            <span aria-hidden className={`pointer-events-none relative w-6 shrink-0 font-mono text-[13px] tabular-nums transition-colors duration-500 ${o.checked ? 'text-holo' : 'text-ink-dim'}`}>
              {i + 1}
            </span>
            {o.icon && <span aria-hidden className={`pointer-events-none relative shrink-0 transition-colors duration-500 ${o.checked ? 'text-holo' : 'text-ink-dim group-hover/opt:text-ink-muted'}`}>{o.icon}</span>}
            <span className="pointer-events-none relative min-w-0 flex-1">
              <span className={`block font-display text-[20px] leading-snug transition-[color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:text-[22px] ${o.checked ? 'translate-x-1 text-ink' : 'text-ink-muted group-hover/opt:translate-x-1 group-hover/opt:text-ink'}`}>{o.label}</span>
              {o.desc && <span className="mt-0.5 block text-[14px] text-ink-dim">{o.desc}</span>}
            </span>
            <span
              aria-hidden
              className={`pointer-events-none relative flex size-7 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${o.checked ? 'scale-100 bg-holo text-void shadow-[0_0_22px_-2px_var(--color-holo)]' : 'scale-90 ring-1 ring-white/15 group-hover/opt:ring-white/30'}`}
            >
              {o.checked && <Check size={15} strokeWidth={2.5} />}
            </span>
          </motion.label>
        ))}
      </motion.fieldset>
    </div>
  )
}

/** Hazır ekranı: seçimlerin özeti (satır o soruya götürür), tempo ve incelenmemiş prototip notu */
function Ready({ settings, config, onJump, focus }: { settings: BreathingSessionSettings; config: BreathingSessionConfig; onJump: (step: Step) => void; focus: boolean }) {
  const { t } = useI18n()
  const b = t.mindPage.breath
  const heading = useFocusOnMount<HTMLHeadingElement>(focus)
  const rows: { key: Step; label: string; value: string }[] = [
    { key: 'duration', label: b.duration, value: b.minutes(settings.durationMin) },
    { key: 'sound', label: b.audio, value: b.audioModes[settings.audio] },
    { key: 'click', label: b.clickShort, value: settings.click ? b.on : b.off },
  ]
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{b.readyEyebrow}</p>
      <h3 ref={heading} tabIndex={-1} className="mt-3 font-display text-[28px] leading-[1.12] font-semibold tracking-tight outline-none md:text-[34px]">
        {b.readyTitle}
      </h3>
      <p className="mt-2 text-[15.5px] text-ink-muted">{b.readyHint}</p>
      <ul className="mt-5">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              data-summary={r.key}
              onClick={() => onJump(r.key)}
              className="group/row relative my-0.5 grid w-full grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-4 rounded-full py-3 pr-4 pl-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holo sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.14] via-holo/[0.05] to-transparent opacity-0 transition-opacity duration-500 group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
              <span className="relative font-mono text-[12.5px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{r.label}</span>
              <span className="relative truncate text-[18px] text-ink">{r.value}</span>
              <span className="relative flex items-center gap-1.5 text-[14px] text-ink-dim transition-colors duration-500 group-hover/row:text-holo">
                <PenLine size={15} strokeWidth={1.5} aria-hidden />
                <span className="hidden sm:inline">{b.change}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-[14px] leading-snug text-ink-muted" data-pacing={config.pacing.id} data-reviewed={config.pacing.reviewed}>
        <p className="text-ink">{b.pacing(config.pacing.inhaleSeconds, config.pacing.exhaleSeconds)}</p>
        {!config.pacing.reviewed && (
          <p className="mt-1.5 flex items-start gap-1.5">
            <Info size={14} className="mt-0.5 shrink-0 text-holo" aria-hidden />
            {b.pacingUnreviewed}
          </p>
        )}
      </div>
    </div>
  )
}

function EndActions({ onSetup, onClose }: { onSetup?: () => void; onClose?: () => void }) {
  const { t } = useI18n()
  const b = t.mindPage.breath
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {onSetup && (
        <PillGhost onClick={onSetup} icon={<ArrowLeft size={16} strokeWidth={1.5} aria-hidden />}>
          {b.settings}
        </PillGhost>
      )}
      {onClose && (
        <PillPrimary onClick={onClose} icon={<Check size={17} strokeWidth={2} aria-hidden />}>
          {b.close}
        </PillPrimary>
      )}
    </div>
  )
}

/** Adım değişince odak yeni adımın başlığına geçer; ilk açılışta odak pencerenin kapat düğmesinde kalır */
function useFocusOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (enabled) ref.current?.focus({ preventScroll: true })
    // yalnızca adım açılırken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

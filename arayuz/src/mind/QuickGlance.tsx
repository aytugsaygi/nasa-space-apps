import { Check, Rocket, Satellite, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GLASS_EASE as EASE } from '../components/GlassDialog'
import { nextStaircase, SPEED, speedThreshold, type Staircase } from '../core/mindTraining'
import { useI18n } from '../i18n'
import { ProgressDots, StageFrame, type MindSummary } from './MindStage'
import { useWindowKeys } from './useWindowKeys'

/*
 * Hızlı bakış (işlem hızı; yararlı görüş alanı tipi hız eğitimi). Her denemede:
 *   bakış noktası → ortada nesne (roket ya da uydu) ve çevredeki sekiz yuvadan birinde sinyal, diğerlerinde soluk
 *   çeldiriciler, kısa bir süre → maske (görüntünün ard izini siler) → önce ortadaki nesne, sonra sinyalin yeri sorulur.
 * İkisi de doğruysa sayılır; zorluk merdiveni gösterim süresini kısaltır ya da uzatır (core/mindTraining.ts).
 * Gösterim süresi kare saatine (requestAnimationFrame) göre ölçülür; zamanlayıcının gecikmesi süreyi uzatmasın.
 * Hareketi azaltmada da gösterim aynıdır (uyaran zaten anlıktır); yalnızca süsleyici geçişler kapanır.
 */

type Obj = 'rocket' | 'satellite'
type Step = 'fixate' | 'show' | 'mask' | 'center' | 'where' | 'feedback'

const FIXATE_MS = 650
const MASK_MS = 260
const FEEDBACK_MS = 850
const RING = 72
const slotXY = (i: number) => {
  const a = (i / SPEED.slots) * Math.PI * 2 - Math.PI / 2
  return { x: 100 + Math.cos(a) * RING, y: 100 + Math.sin(a) * RING }
}

interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
}
interface Trial {
  obj: Obj
  slot: number
  ms: number
  /** Maske: kısa çizgilerden rastgele bir doku (her denemede yeni) */
  mask: Line[]
}

const newTrial = (ms: number, prevSlot = -1): Trial => {
  let slot = Math.floor(Math.random() * SPEED.slots)
  if (slot === prevSlot) slot = (slot + 3) % SPEED.slots
  const mask = Array.from({ length: 70 }, () => {
    const x = 18 + Math.random() * 164
    const y = 18 + Math.random() * 164
    const a = Math.random() * Math.PI
    return { x1: x - Math.cos(a) * 7, y1: y - Math.sin(a) * 7, x2: x + Math.cos(a) * 7, y2: y + Math.sin(a) * 7 }
  })
  return { obj: Math.random() < 0.5 ? 'rocket' : 'satellite', slot, ms, mask }
}

export function QuickGlance({ onDone, reduced }: { onDone: (s: MindSummary) => void; reduced: boolean }) {
  const { t, lang } = useI18n()
  const g = t.mindTraining.speed
  const [stair, setStair] = useState<Staircase>({ ms: SPEED.startMs, streak: 0 })
  const [trial, setTrial] = useState<Trial>(() => newTrial(SPEED.startMs))
  const [step, setStep] = useState<Step>('fixate')
  const [answerObj, setAnswerObj] = useState<Obj | null>(null)
  const [last, setLast] = useState<{ ok: boolean; slot: number; picked: number } | null>(null)
  const [log, setLog] = useState<{ ms: number; ok: boolean }[]>([])
  const firstButton = useRef<HTMLButtonElement | null>(null)
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => {
    onDoneRef.current = onDone
  })

  /*
   * Deneme akışı: bakış noktası → gösterim (kare saatiyle) → maske → soru → geri bildirim → sıradaki deneme ya da sonuç.
   * Her adımın zamanlayıcısı o adımın durumundan kurulur ve adım değişince temizlenir; bir adımın zamanlayıcısı başka
   * bir adımın temizliğiyle iptal edilemez (önceden geri bildirimden sonraki geçiş böyle kayboluyor, egzersiz takılıyordu).
   */
  useEffect(() => {
    let timer = 0
    let frame = 0
    if (step === 'fixate') {
      timer = window.setTimeout(() => setStep('show'), FIXATE_MS)
    } else if (step === 'show') {
      let start = 0
      const tick = (now: number) => {
        if (!start) start = now
        if (now - start >= trial.ms - 4) setStep('mask')
        else frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    } else if (step === 'mask') {
      timer = window.setTimeout(() => setStep('center'), MASK_MS)
    } else if (step === 'feedback') {
      timer = window.setTimeout(() => {
        if (log.length >= SPEED.trials) {
          const correct = log.filter((l) => l.ok).length
          const pct = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'percent' }).format(correct / log.length)
          onDoneRef.current({
            score: speedThreshold(log.map((l) => l.ms)),
            accuracy: correct / log.length,
            trials: log.length,
            stats: [
              { label: g.accuracy, value: pct },
              { label: g.fastest, value: `${Math.min(...log.filter((l) => l.ok).map((l) => l.ms), SPEED.maxMs)} ms` },
              { label: g.trials, value: String(log.length) },
            ],
          })
          return
        }
        setAnswerObj(null)
        setLast(null)
        setTrial(newTrial(stair.ms, trial.slot))
        setStep('fixate')
      }, FEEDBACK_MS)
    }
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [step, trial.ms, trial.slot, log, stair.ms, lang, g])

  useEffect(() => {
    if (step === 'center' || step === 'where') requestAnimationFrame(() => firstButton.current?.focus({ preventScroll: true }))
  }, [step])

  const pickObj = useCallback((o: Obj) => {
    setAnswerObj(o)
    setStep('where')
  }, [])

  const pickSlot = useCallback(
    (slot: number) => {
      const ok = answerObj === trial.obj && slot === trial.slot
      const entry = { ms: trial.ms, ok }
      setLog([...log, entry])
      setLast({ ok, slot: trial.slot, picked: slot })
      setStair(nextStaircase(stair, ok))
      setStep('feedback')
    },
    [answerObj, trial, log, stair],
  )

  // Klavye: ortadaki nesne 1/2 (ya da ←/→), konum 1-8
  useWindowKeys((e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (step === 'center') {
      if (e.key === '1' || e.key === 'ArrowLeft') pickObj('rocket')
      else if (e.key === '2' || e.key === 'ArrowRight') pickObj('satellite')
      else return
      e.preventDefault()
    } else if (step === 'where') {
      const d = Number(e.key)
      if (d >= 1 && d <= SPEED.slots) {
        e.preventDefault()
        pickSlot(d - 1)
      }
    }
  })

  const showing = step === 'show'
  const ObjIcon = trial.obj === 'rocket' ? Rocket : Satellite
  const asking = step === 'center' || step === 'where'

  return (
    <StageFrame
      label={g.stageLabel}
      top={
        <>
          <ProgressDots total={SPEED.trials} done={log.length} label={g.trial(Math.min(SPEED.trials, log.length + 1), SPEED.trials)} reduced={reduced} />
          <span className="tabular hidden font-mono text-[13px] text-ink-dim sm:inline" data-speed-ms>
            {g.showing(trial.ms)}
          </span>
        </>
      }
    >
      {/* Kare alan, kalan yüksekliğe ve genişliğe sığar (kapsayıcı boyut sorgusu) */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        <div className="relative size-[min(100cqw,100cqh,420px)]" data-speed-step={step}>
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
            {/* Yuvaların izi: hep görünür, nerede olabileceğini gösterir */}
            <circle cx="100" cy="100" r={RING} fill="none" stroke="var(--color-holo)" strokeOpacity="0.12" strokeDasharray="1.5 4" />
            {Array.from({ length: SPEED.slots }, (_, i) => {
              const p = slotXY(i)
              return <circle key={i} cx={p.x} cy={p.y} r="10" fill="none" stroke="var(--color-holo)" strokeOpacity="0.1" />
            })}
            {step === 'fixate' && (
              <g stroke="var(--color-ink)" strokeWidth="1.5" strokeLinecap="round">
                <line x1="94" y1="100" x2="106" y2="100" />
                <line x1="100" y1="94" x2="100" y2="106" />
              </g>
            )}
            {showing && (
              <g data-speed-stimulus>
                {Array.from({ length: SPEED.slots }, (_, i) => {
                  const p = slotXY(i)
                  if (i === trial.slot)
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="9" fill="var(--color-holo)" />
                        <circle cx={p.x} cy={p.y} r="13" fill="none" stroke="var(--color-holo)" strokeWidth="1.5" />
                      </g>
                    )
                  // Çeldirici: soluk eşkenar dörtgen (sinyalle karışmasın diye biçimi farklı)
                  return (
                    <path key={i} d={`M${p.x},${p.y - 6} L${p.x + 6},${p.y} L${p.x},${p.y + 6} L${p.x - 6},${p.y} Z`} fill="none" stroke="var(--color-ink)" strokeOpacity="0.5" strokeWidth="1.25" />
                  )
                })}
                <circle cx="100" cy="100" r="21" fill="var(--color-holo)" fillOpacity="0.1" stroke="var(--color-holo)" strokeOpacity="0.5" />
                <ObjIcon x={86} y={86} width={28} height={28} strokeWidth={1.75} color="var(--color-ink)" />
              </g>
            )}
            {step === 'mask' && (
              <g stroke="var(--color-ink)" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" data-speed-mask>
                {trial.mask.map((l, i) => (
                  <line key={i} {...l} />
                ))}
              </g>
            )}
            {step === 'feedback' && last && (
              <g>
                <circle cx={slotXY(last.slot).x} cy={slotXY(last.slot).y} r="13" fill="var(--color-holo)" fillOpacity="0.2" stroke="var(--color-holo)" strokeWidth="1.5" />
                {!last.ok && last.picked !== last.slot && (
                  <circle cx={slotXY(last.picked).x} cy={slotXY(last.picked).y} r="11" fill="none" stroke="var(--color-ink)" strokeOpacity="0.5" strokeDasharray="2 2" />
                )}
              </g>
            )}
          </svg>

          {/* Konum sorusu: sekiz yuva düğme olur (klavyede 1-8) */}
          {step === 'where' &&
            Array.from({ length: SPEED.slots }, (_, i) => {
              const p = slotXY(i)
              return (
                <button
                  key={i}
                  ref={i === 0 ? firstButton : undefined}
                  type="button"
                  data-speed-slot={i}
                  onClick={() => pickSlot(i)}
                  aria-label={g.slot(i + 1)}
                  className="tabular absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.04] font-mono text-[14px] text-ink-muted ring-1 ring-holo/30 transition-[background-color,color,transform] duration-300 hover:scale-105 hover:bg-holo/15 hover:text-ink focus-visible:bg-holo/15"
                  style={{ left: `${p.x / 2}%`, top: `${p.y / 2}%` }}
                >
                  {i + 1}
                </button>
              )
            })}

          {/* Soru ve geri bildirim ortada */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {step === 'feedback' && last && (
                <motion.p
                  key="fb"
                  role="status"
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14.5px] font-semibold ring-1 ${last.ok ? 'bg-holo/12 text-holo ring-holo/30' : 'bg-white/[0.05] text-ink-muted ring-white/10'}`}
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE }}
                >
                  {last.ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                  {last.ok ? g.correct : g.wrong}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Cevap satırı: önce nesne, sonra konum */}
      <div className="mt-3 flex min-h-[7.25rem] w-full max-w-md shrink-0 flex-col items-center justify-start gap-3" aria-live="polite">
        {asking && <p className="font-display text-[19px] font-semibold tracking-tight text-ink">{step === 'center' ? g.center : g.where}</p>}
        {step === 'center' && (
          <div className="grid w-full grid-cols-2 gap-3" role="group" aria-label={g.center}>
            {(['rocket', 'satellite'] as const).map((o, i) => {
              const Icon = o === 'rocket' ? Rocket : Satellite
              return (
                <button
                  key={o}
                  ref={i === 0 ? firstButton : undefined}
                  type="button"
                  data-speed-object={o}
                  onClick={() => pickObj(o)}
                  className="group flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-white/[0.03] text-[16px] font-semibold text-ink ring-1 ring-white/10 transition-[background-color,box-shadow] duration-300 hover:bg-holo/10 hover:ring-holo/40"
                >
                  <span className="tabular font-mono text-[12.5px] text-ink-dim">{i + 1}</span>
                  <Icon size={20} strokeWidth={1.75} aria-hidden className="text-holo" />
                  {g.objects[o]}
                </button>
              )
            })}
          </div>
        )}
        {step === 'feedback' && last && !last.ok && <p className="text-[14px] text-ink-dim">{g.wrongWhere}</p>}
        {!asking && step !== 'feedback' && <p className="text-[13.5px] text-ink-dim">{g.keys}</p>}
      </div>
    </StageFrame>
  )
}

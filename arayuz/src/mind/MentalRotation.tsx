import { Check, FlipHorizontal2, Repeat2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { GLASS_EASE as EASE } from '../components/GlassDialog'
import { axisAngle, makeFigure, mirror, multiply, nextSpatialLevel, projectFaces, randomAxis, SPATIAL, trialAngle, type Mat3, type Vec3 } from '../core/mindTraining'
import { useI18n } from '../i18n'
import { ProgressDots, StageFrame, type MindSummary } from './MindStage'
import { useWindowKeys } from './useWindowKeys'

/*
 * Zihinde döndür (Shepard-Metzler tipi zihinsel döndürme). İki 3B blok figür yan yana: ikincisi birincinin döndürülmüş
 * hali ya da döndürülmüş ayna görüntüsüdür. "Aynı" ya da "Ayna" seçilir (klavyede ← ve →). Doğru bildikçe açı farkı
 * büyür (core/mindTraining.ts → nextSpatialLevel). Figürler SVG ile dik izdüşümle çizilir (WebGL gerekmez).
 */

const FEEDBACK_MS = 900
/** Bakış açısı: figür hafifçe yukarıdan ve yandan görünür (üç yüz birden okunur) */
const VIEW: Mat3 = multiply(axisAngle([1, 0, 0], 22), axisAngle([0, 1, 0], -28))

interface Trial {
  cubes: Vec3[]
  mirrored: boolean
  left: Mat3
  right: Mat3
  angle: number
}

function newTrial(level: number): Trial {
  const cubes = makeFigure()
  const base = axisAngle(randomAxis(), Math.random() * 360)
  const angle = trialAngle(level)
  const turn = axisAngle(randomAxis(), angle)
  return { cubes, mirrored: Math.random() < 0.5, left: multiply(VIEW, base), right: multiply(VIEW, multiply(turn, base)), angle }
}

export function MentalRotation({ onDone, reduced }: { onDone: (s: MindSummary) => void; reduced: boolean }) {
  const { t, lang } = useI18n()
  const g = t.mindTraining.spatial
  const [level, setLevel] = useState({ level: 0, streak: 0 })
  const [trial, setTrial] = useState<Trial>(() => newTrial(0))
  const [count, setCount] = useState(0)
  const [log, setLog] = useState<{ ok: boolean; ms: number; angle: number }[]>([])
  const [feedback, setFeedback] = useState<{ ok: boolean; mirrored: boolean } | null>(null)
  const shownAt = useRef(0)
  const sameRef = useRef<HTMLButtonElement | null>(null)
  const onDoneRef = useRef(onDone)
  useLayoutEffect(() => {
    onDoneRef.current = onDone
  })
  useEffect(() => {
    shownAt.current = performance.now()
    sameRef.current?.focus({ preventScroll: true })
  }, [trial])

  const answer = useCallback(
    (saysMirror: boolean) => {
      if (feedback) return
      const ok = saysMirror === trial.mirrored
      const entry = { ok, ms: Math.round(performance.now() - shownAt.current), angle: trial.angle }
      setLog([...log, entry])
      setFeedback({ ok, mirrored: trial.mirrored })
      setLevel(nextSpatialLevel(level.level, level.streak, ok))
    },
    [feedback, trial, log, level],
  )

  /*
   * Geri bildirim gösterildiği sürece sıradaki adım buradan zamanlanır (durumdan türer): yeniden çizim ya da başka bir
   * güncelleme zamanlayıcıyı kaybettiremez. Son denemeden sonra sonuç kabuğa verilir.
   */
  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => {
      if (log.length >= SPATIAL.trials) {
        const right = log.filter((l) => l.ok)
        const fmt = (v: number, style: 'percent' | 'decimal') =>
          new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', style === 'percent' ? { style } : { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v)
        const avg = right.length ? Math.round(right.reduce((a, l) => a + l.ms, 0) / right.length) : undefined
        onDoneRef.current({
          score: right.length,
          accuracy: right.length / log.length,
          trials: log.length,
          avgMs: avg,
          stats: [
            { label: t.mindTraining.speed.accuracy, value: fmt(right.length / log.length, 'percent') },
            { label: g.avgTime, value: avg === undefined ? '–' : g.seconds(fmt(avg / 1000, 'decimal')) },
            { label: g.maxAngle, value: right.length ? `${Math.round(Math.max(...right.map((l) => l.angle)))}°` : '–' },
          ],
        })
        return
      }
      setFeedback(null)
      setCount((c) => c + 1)
      setTrial(newTrial(level.level))
    }, FEEDBACK_MS)
    return () => clearTimeout(id)
  }, [feedback, log, level, lang, g, t])

  useWindowKeys((e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'ArrowLeft') answer(false)
    else if (e.key === 'ArrowRight') answer(true)
    else return
    e.preventDefault()
  })

  const rightCubes = useMemo(() => (trial.mirrored ? mirror(trial.cubes) : trial.cubes), [trial])

  return (
    <StageFrame
      label={t.mindTraining.names.spatial}
      top={
        <>
          <ProgressDots total={SPATIAL.trials} done={log.length} label={g.trial(Math.min(SPATIAL.trials, log.length + 1), SPATIAL.trials)} reduced={reduced} />
          <span className="tabular hidden font-mono text-[13px] text-ink-dim sm:inline" data-spatial-angle>
            {g.angle(Math.round(trial.angle / 5) * 5)}
          </span>
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={count}
          className="grid w-full max-w-[640px] grid-cols-2 gap-3 sm:gap-5"
          initial={{ opacity: 0, scale: reduced ? 1 : 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          data-spatial-trial={trial.mirrored ? 'mirror' : 'same'}
          data-spatial-index={count}
        >
          {[
            { label: g.left, cubes: trial.cubes, rotation: trial.left },
            { label: g.right, cubes: rightCubes, rotation: trial.right },
          ].map((f) => (
            <figure key={f.label} className="relative flex aspect-square items-center justify-center rounded-[1.5rem] bg-black/20 ring-1 ring-white/[0.06]">
              <BlockFigure cubes={f.cubes} rotation={f.rotation} className="size-[94%]" label={f.label} />
              <figcaption className="absolute top-3 left-4 font-mono text-[12px] font-semibold tracking-[0.12em] text-ink-dim uppercase">{f.label}</figcaption>
            </figure>
          ))}
        </motion.div>
      </AnimatePresence>

      <div className="mt-5 flex h-9 items-center" aria-live="polite">
        {feedback && (
          <p
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold ring-1 ${feedback.ok ? 'bg-holo/12 text-holo ring-holo/30' : 'bg-white/[0.05] text-ink-muted ring-white/10'}`}
            data-spatial-feedback={feedback.ok ? 'ok' : 'wrong'}
          >
            {feedback.ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
            {feedback.ok ? g.correct : g.wrong} · {feedback.mirrored ? g.wasMirror : g.wasSame}
          </p>
        )}
      </div>

      <div className="mt-3 grid w-full max-w-md grid-cols-2 gap-3" role="group" aria-label={t.mindTraining.names.spatial}>
        {[
          { mirror: false, label: g.same, Icon: Repeat2, key: '←' },
          { mirror: true, label: g.mirror, Icon: FlipHorizontal2, key: '→' },
        ].map((b) => (
          <button
            key={b.label}
            ref={b.mirror ? undefined : sameRef}
            type="button"
            data-spatial-answer={b.mirror ? 'mirror' : 'same'}
            disabled={feedback !== null}
            onClick={() => answer(b.mirror)}
            className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-white/[0.03] text-[16px] font-semibold text-ink ring-1 ring-white/10 transition-[background-color,box-shadow,opacity] duration-300 hover:bg-holo/10 hover:ring-holo/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <b.Icon size={19} strokeWidth={1.75} className="text-holo" aria-hidden />
            {b.label}
            <kbd className="rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-[12.5px] text-ink-dim">{b.key}</kbd>
          </button>
        ))}
      </div>
    </StageFrame>
  )
}

/**
 * 3B blok figür (SVG, dik izdüşüm). Görünür yüzler ışığa göre tonlanır; kenar çizgileri hologram gibi parlak. Ölçek
 * figürün çevrel küresine göre sabittir: aynı figür her açıdan aynı büyüklükte görünür (karşılaştırma adil olsun).
 */
export function BlockFigure({ cubes, rotation, className, label }: { cubes: Vec3[]; rotation: Mat3; className?: string; label?: string }) {
  const faces = useMemo(() => projectFaces(cubes, rotation), [cubes, rotation])
  const r = useMemo(() => Math.max(...cubes.map((c) => Math.hypot(c[0], c[1], c[2]))) + 0.9, [cubes])
  return (
    <svg viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {faces.map((f, i) => {
        const points = f.points.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ')
        // Önce opak taban: arkadaki küpler öndekinin içinden görünmesin; üstüne ışığa göre hologram tonu
        return (
          <g key={i}>
            <polygon points={points} fill="var(--color-base)" />
            <polygon
              points={points}
              fill="var(--color-holo)"
              fillOpacity={0.08 + f.light * 0.5}
              stroke="var(--color-holo)"
              strokeOpacity={0.85}
              strokeWidth={1.1}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}

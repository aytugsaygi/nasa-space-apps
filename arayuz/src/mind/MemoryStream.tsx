import { ArrowRight, Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GLASS_EASE as EASE, PillPrimary } from '../components/GlassDialog'
import { makeNBack, MEMORY, nextLevel, scoreNBack, type BlockScore } from '../core/mindTraining'
import { useI18n } from '../i18n'
import { ProgressDots, StageFrame, type MindSummary } from './MindStage'
import { useWindowKeys } from './useWindowKeys'

/*
 * Bellek akışı (görsel-uzamsal n-geri). 3×3 ızgarada her 2,5 saniyede bir pencere yanar (0,9 saniye görünür).
 * Yanan pencere n adım önceki ile aynı yerdeyse "Eşleşiyor"a basılır (Boşluk da olur). Her blok 20 + n öğedir;
 * blok sonunda hata sayısına göre seviye artar, aynı kalır ya da azalır (core/mindTraining.ts → nextLevel).
 * Basışın hemen ardından kısa bir geri bildirim görünür (yakaladın / eşleşme değildi); kaçırılan eşleşme blok
 * sonunda hata olarak sayılır. Hareketi azaltmada pencere geçişsiz yanar.
 */

type Phase = 'running' | 'between'

export function MemoryStream({ startLevel, onDone, reduced }: { startLevel: number; onDone: (s: MindSummary) => void; reduced: boolean }) {
  const { t, lang } = useI18n()
  const g = t.mindTraining.memory
  const [n, setN] = useState(Math.max(1, Math.min(MEMORY.maxN, startLevel)))
  const [block, setBlock] = useState(0)
  const [seq, setSeq] = useState<number[]>(() => makeNBack(Math.max(1, Math.min(MEMORY.maxN, startLevel))))
  const [i, setI] = useState(0)
  const [lit, setLit] = useState(true)
  const [pressed, setPressed] = useState<Set<number>>(() => new Set())
  // Blok sonu puanı bundan okunur: adım zamanlayıcısı kurulduktan sonra (ör. son öğede) yapılan basış da sayılsın
  const pressedRef = useRef<Set<number>>(new Set())
  const [flash, setFlash] = useState<{ at: number; hit: boolean } | null>(null)
  const [phase, setPhase] = useState<Phase>('running')
  const [results, setResults] = useState<{ n: number; score: BlockScore; next: number }[]>([])
  const matchRef = useRef<HTMLButtonElement | null>(null)

  // Öğe akışı: her adımda pencere yanar, bir süre sonra söner; dizi bitince blok puanlanır
  useEffect(() => {
    if (phase !== 'running') return
    const off = window.setTimeout(() => setLit(false), MEMORY.showMs)
    const step = window.setTimeout(() => {
      if (i + 1 < seq.length) {
        setI(i + 1)
        setLit(true)
        setFlash(null)
        return
      }
      const score = scoreNBack(seq, n, pressedRef.current)
      const next = nextLevel(n, score.errors)
      setResults((r) => [...r, { n, score, next }])
      setPhase('between')
    }, MEMORY.stepMs)
    return () => {
      clearTimeout(off)
      clearTimeout(step)
    }
  }, [phase, i, seq, n])

  useEffect(() => {
    if (phase === 'running') matchRef.current?.focus({ preventScroll: true })
  }, [phase, block])

  const press = useCallback(() => {
    if (phase !== 'running' || pressed.has(i)) return
    pressedRef.current = new Set(pressedRef.current).add(i)
    setPressed(pressedRef.current)
    setFlash({ at: i, hit: i >= n && seq[i] === seq[i - n] })
  }, [phase, pressed, i, n, seq])

  // Boşluk tuşu: odak düğmedeyse düğmenin kendisi basar (çift sayılmasın)
  useWindowKeys((e) => {
    if (e.key !== ' ' || e.repeat || (e.target as HTMLElement | null)?.closest?.('button')) return
    e.preventDefault()
    press()
  })

  const nextBlock = () => {
    const last = results[results.length - 1]
    if (results.length >= MEMORY.blocks) {
      const scored = results.reduce((a, r) => a + r.score.hits + r.score.misses + r.score.falseAlarms + r.score.correctRejections, 0)
      const accuracy = results.reduce((a, r) => a + r.score.accuracy, 0) / results.length
      const hits = results.reduce((a, r) => a + r.score.hits, 0)
      const targets = results.reduce((a, r) => a + r.score.hits + r.score.misses, 0)
      const falses = results.reduce((a, r) => a + r.score.falseAlarms, 0)
      const pct = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'percent' }).format(accuracy)
      onDone({
        score: Math.max(...results.map((r) => r.n)),
        accuracy,
        trials: scored,
        endLevel: last.next,
        stats: [
          { label: g.accuracy, value: pct },
          { label: g.hits, value: `${hits}/${targets}` },
          { label: g.falseAlarms, value: String(falses) },
        ],
      })
      return
    }
    setN(last.next)
    setSeq(makeNBack(last.next))
    setBlock((b) => b + 1)
    setI(0)
    setLit(true)
    pressedRef.current = new Set()
    setPressed(pressedRef.current)
    setFlash(null)
    setPhase('running')
  }

  const current = seq[i]
  const last = results[results.length - 1]
  const message = last ? (last.next > last.n ? g.up(last.next) : last.next < last.n ? g.down(last.next) : g.same(last.next)) : ''
  const finished = results.length >= MEMORY.blocks

  return (
    <StageFrame
      label={g.gridLabel}
      top={
        <>
          <ProgressDots total={MEMORY.blocks} done={results.length} label={g.block(Math.min(MEMORY.blocks, block + 1), MEMORY.blocks)} reduced={reduced} />
          <span className="tabular rounded-full bg-holo/10 px-3 py-1 font-mono text-[13.5px] font-semibold whitespace-nowrap text-holo ring-1 ring-holo/25" data-memory-level>
            {g.level(n)}
          </span>
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'running' ? (
          <motion.div
            key={`run-${block}`}
            className="flex min-h-0 w-full flex-1 flex-col items-center gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            {/* Blok içindeki ilerleme: ince çizgi */}
            <div className="h-[3px] w-full max-w-[340px] shrink-0 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              <div className="h-full rounded-full bg-holo/60 transition-[width] duration-300" style={{ width: `${((i + 1) / seq.length) * 100}%` }} />
            </div>
            {/* Ekran okuyucu için yanan pencerenin adı */}
            <p className="sr-only" aria-live="polite">
              {lit ? g.cell(current + 1) : ''}
            </p>
            <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
              <div aria-hidden className="grid size-[min(100cqw,100cqh,340px)] grid-cols-3 gap-2.5" data-memory-grid data-memory-index={i}>
                {Array.from({ length: MEMORY.cells }, (_, c) => {
                  const on = lit && c === current
                  return (
                    <div
                      key={c}
                      data-memory-cell={c}
                      data-on={on || undefined}
                      className={`relative rounded-2xl ring-1 ${reduced ? '' : 'transition-[background-color,box-shadow] duration-200'} ${
                        on ? 'bg-holo shadow-[0_0_40px_-6px_var(--color-holo)] ring-holo' : 'bg-white/[0.025] ring-white/[0.07]'
                      }`}
                    >
                      {/* Pencere çerçevesinin iç parıltısı: istasyon penceresi gibi */}
                      <span aria-hidden className={`absolute inset-2 rounded-xl ring-1 ${on ? 'ring-white/40' : 'ring-white/[0.04]'}`} />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex h-9 shrink-0 items-center" aria-live="polite">
              <AnimatePresence mode="wait">
                {flash && (
                  <motion.p
                    key={flash.at}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold ring-1 ${flash.hit ? 'bg-holo/12 text-holo ring-holo/30' : 'bg-white/[0.05] text-ink-muted ring-white/10'}`}
                    initial={{ opacity: 0, y: reduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {flash.hit ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
                    {flash.hit ? g.hit : g.falseAlarm}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <button
              ref={matchRef}
              type="button"
              id="memory-match"
              onClick={press}
              aria-pressed={pressed.has(i)}
              disabled={i < n}
              className="group flex min-h-14 w-full max-w-[340px] shrink-0 items-center justify-center gap-3 rounded-full bg-holo/12 text-[17px] font-semibold text-holo ring-1 ring-holo/35 transition-[background-color,transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-holo/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 aria-pressed:bg-holo/25"
            >
              {g.match}
              <kbd className="rounded-md bg-black/25 px-2 py-0.5 font-mono text-[12.5px] font-semibold text-holo/90">{g.matchKey}</kbd>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key={`between-${block}`}
            role="status"
            className="flex w-full max-w-md flex-col items-center gap-4 text-center"
            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            data-memory-between
          >
            <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{g.blockDone(results.length)}</p>
            <p className="tabular font-display text-[44px] leading-none font-semibold tracking-tight">{g.errors(last?.score.errors ?? 0)}</p>
            {!finished && <p className="text-[16px] text-ink-muted">{message}</p>}
            <PillPrimary onClick={nextBlock} icon={<ArrowRight size={17} strokeWidth={2} aria-hidden />} id="memory-next">
              {finished ? g.seeResult : g.next}
            </PillPrimary>
            <FocusOnMount targetId="memory-next" />
          </motion.div>
        )}
      </AnimatePresence>
    </StageFrame>
  )
}

/** Blok arası ekranı açılınca düğmeye odaklanır (PillPrimary ref almaz; Enter ile hemen devam edilebilsin) */
function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus({ preventScroll: true })
  }, [targetId])
  return null
}

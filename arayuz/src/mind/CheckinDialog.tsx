import { ArrowLeft, Check, Info, PenLine } from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { GLASS_EASE as EASE, GlassDialog, PillGhost, PillPrimary } from '../components/GlassDialog'
import { CHECKIN_CONFIG, countWords, type CheckinAnswers, type CheckinWindowView } from '../core/checkins'
import type { CrewId } from '../core/crew'
import type { CheckinError } from '../core/engine'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { setDraft, useDraft } from '../lib/drafts'
import { usePrefersReducedMotion } from '../lib/settings'
import { missionTime } from './checkinFormat'

/*
 * Check-in (docs/wellbeing CI-01…CI-10): ekranın ortasında açılan, adım adım ilerleyen bir akış.
 * - Sorular tek tek gelir; bir seçeneğe basınca kısa bir an sonra kendiliğinden sonraki soruya geçilir. Geri ve İleri
 *   ile istenen soruya dönülür; bütün sorular isteğe bağlıdır (İleri cevapsız da geçer). Rakam tuşları seçer, ← → geçer.
 * - Sorulardan sonra "Eklemek istediğin başka bir şey var mı?" (not), ardından özet: her satır o soruya götürür; orada
 *   cevap değişince akış özete geri döner. Kaydet özetin en altındadır.
 * - X / Esc / arka plan: "sonra yaparım" (deferred). Taslak saklanır, sonuç kesinleşmez.
 * - "Bu check-in'i atla": pencere bilerek atlanır (skipped).
 * - Kaydet: en az bir cevap ya da boş olmayan not gerekir. Kaydedilince bitiş animasyonu oynar ve akış kapanır; ayrıca
 *   bildirim gösterilmez (tek olay, tek bildirim).
 * - Kaydedilemezse akış kapanmaz, yazılanlar korunur. Not 100 kelimeyi aşarsa kaydedilmez ama hiçbir şey silinmez.
 * - Akış açıkken pencere kapanırsa form değişmez; süre içinde aynı pencereye geç gönderim olarak kaydedilir.
 * Cevaplardan puan, tanı ya da uyarı üretilmez.
 */

interface FormState {
  answers: CheckinAnswers
  note: string
}

const QUESTIONS = CHECKIN_CONFIG.questions
const NOTE = QUESTIONS.length
const SUMMARY = NOTE + 1
/** Seçimden sonra sonraki soruya geçmeden önceki an: yalnızca seçim işaretinin bir an görüldüğü kadar */
const AUTO_ADVANCE_MS = 150
/** Bitiş animasyonu bu kadar görünür, sonra akış kapanır */
const DONE_MS = 2300
const DONE_MS_REDUCED = 1400

const emptyForm = (): FormState => ({
  answers: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
  note: '',
})

/** Formun pencere kapanınca da güncel kalması için dakikada birkaç kez okunan saat */
function useNow(stepMs = 10_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), stepMs)
    return () => clearInterval(timer)
  }, [stepMs])
  return now
}

export function CheckinDialog({ windowKey, onClose }: { windowKey: string | null; onClose: () => void }) {
  const { t, locale } = useI18n()
  const { astronaut } = useHealth()
  const f = t.mindPage.form
  const open = windowKey !== null
  const view = useQuery('checkinWindow', astronaut && windowKey ? [astronaut, windowKey] : null)
  const panelRef = useRef<HTMLDivElement>(null)
  const title = view ? f.title(t.mindPage.windowName(view.window)) : t.mindPage.title
  const range = view ? t.mindPage.range(missionTime(view.opensAt, locale), missionTime(view.closesAt, locale)) : null

  return (
    <GlassDialog open={open} onClose={onClose} id="checkin-dialog" title={title} subtitle={range} closeLabel={f.close} panelRef={panelRef}>
      {view && astronaut ? (
        <CheckinFlow key={`${astronaut}|${view.key}`} view={view} astronaut={astronaut} onClose={onClose} panelRef={panelRef} />
      ) : (
        <div className="flex flex-1 items-center justify-center" aria-label={t.mindPage.loading}>
          <span className="size-8 animate-spin rounded-full border-2 border-holo/20 border-t-holo" aria-hidden />
        </div>
      )}
    </GlassDialog>
  )
}

interface Nav {
  step: number
  /** Geçiş yönü: 1 ileri, -1 geri (adım kayarak gelir) */
  dir: 1 | -1
  /** Özetten bir soruya dönüldü: cevaptan sonra özete geri gidilir */
  editing: boolean
  /** Kullanıcı en az bir kez adım değiştirdi: yeni adımın başlığına odaklanılır (ilk açılışta odak kapat düğmesinde kalır) */
  moved: boolean
}

/** Panel kapanırken bileşen kaldırılır; X ile kapatma bu bileşenin dışında olduğu için taslak her değişiklikte bellekte de tutulur */
function CheckinFlow({ view, astronaut, onClose, panelRef }: { view: CheckinWindowView; astronaut: CrewId; onClose: () => void; panelRef: RefObject<HTMLDivElement | null> }) {
  const { t, locale } = useI18n()
  const { mutate } = useHealth()
  const f = t.mindPage.form
  const reduced = usePrefersReducedMotion()
  const ids = useId()
  const draftKey = `checkin:${astronaut}:${view.key}`
  const [, setMemo] = useDraft(draftKey)
  const saved = view.record?.outcome === 'saved'
  // Başlangıç: kayıtlı check-in düzenleniyorsa kaydı, değilse boş form (hiçbir seçenek önceden seçili gelmez; yarım
  // bırakılan bir check-in yeniden açıldığında da sorular boş başlar)
  const [form, setForm] = useState<FormState>(() => {
    if (saved && view.record)
      return {
        answers: { ...emptyForm().answers, ...view.record.answers },
        note: view.record.note,
      }
    return emptyForm()
  })
  // Kayıtlı bir check-in düzenlenirken özetten başlanır: ne cevaplandığı bir bakışta görünür
  const [nav, setNav] = useState<Nav>({
    step: saved ? SUMMARY : 0,
    dir: 1,
    editing: false,
    moved: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | 'ok' | 'late'>(null)
  const now = useNow()
  const finalized = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const update = (next: FormState) => {
    setForm(next)
    setMemo(JSON.stringify(next))
    setError(null)
  }

  /* Kapatılınca (X, Esc, arka plan): taslak saklanır, açık pencere ertelenmiş sayılır */
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  }, [form])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (finalized.current) return
      const cur = formRef.current
      const hasContent = Object.values(cur.answers).some((v) => v !== null) || cur.note.trim() !== ''
      void (async () => {
        try {
          if (hasContent) await mutate('saveCheckinDraft', astronaut, view.key, cur.answers, cur.note)
          if (!view.record) await mutate('deferCheckin', astronaut, view.key)
        } catch {
          /* Sunucuya ulaşılamazsa taslak bu oturumun belleğinde kalır */
        }
      })()
    },
    // Yalnızca akış kapanırken çalışır
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Adım değişince bekleyen otomatik geçiş iptal olur (elle geri/ileri basılmışsa iki kez ilerlemesin)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [nav.step])

  const next = () =>
    setNav((n) =>
      n.editing && n.step < NOTE
        ? { step: SUMMARY, dir: 1, editing: false, moved: true }
        : {
            step: Math.min(SUMMARY, n.step + 1),
            dir: 1,
            editing: false,
            moved: true,
          },
    )
  const back = () =>
    setNav((n) => ({
      step: Math.max(0, n.step - 1),
      dir: -1,
      editing: false,
      moved: true,
    }))
  const jump = (step: number) => setNav({ step, dir: -1, editing: true, moved: true })

  const choose = (id: string, option: string) => {
    update({ ...form, answers: { ...form.answers, [id]: option } })
    if (timer.current) clearTimeout(timer.current)
    // Hekime bildirme önerisi çıkan cevapta durulur: öneri okunsun, İleri ile geçilir
    if (QUESTIONS.find((q) => q.id === id)?.advise?.includes(option)) return
    timer.current = setTimeout(next, AUTO_ADVANCE_MS)
  }

  const words = countWords(form.note)
  const overWords = words > CHECKIN_CONFIG.noteMaxWords
  const overChars = form.note.length > CHECKIN_CONFIG.noteMaxChars
  const answered = Object.values(form.answers).filter((v) => v !== null).length
  const empty = answered === 0 && form.note.trim() === ''
  const open = now < view.closesAt
  const lateOk = !open && view.lateUntil !== null && now < view.lateUntil
  const canSend = open || lateOk

  const messageFor = (e: CheckinError | 'network') =>
    e === 'noteTooLong' ? (overChars ? f.noteTooLongChars : f.noteTooLong(words, CHECKIN_CONFIG.noteMaxWords)) : e === 'invalid' ? f.invalid : e === 'expired' || e === 'notOpen' ? f.expiredNotice : f.failed

  const submit = async () => {
    if (busy || empty || overWords || overChars || !canSend) return
    setBusy(true)
    setError(null)
    try {
      const r = await mutate('submitCheckin', astronaut, view.key, form.answers, form.note)
      if (r?.ok) {
        finalized.current = true
        setDraft(draftKey, '')
        setDone(r.view.record?.late ? 'late' : 'ok')
        setTimeout(onClose, reduced ? DONE_MS_REDUCED : DONE_MS)
        return
      }
      setError(messageFor(r ? r.error : 'network'))
    } catch {
      setError(f.failed)
    } finally {
      setBusy(false)
    }
    // Kaydedilemedi: yazılanlar formda ve taslakta kalır
    try {
      await mutate('saveCheckinDraft', astronaut, view.key, form.answers, form.note)
    } catch {
      /* bellekteki taslak yeterli */
    }
  }

  const skip = async () => {
    if (busy || !canSend) return
    setBusy(true)
    setError(null)
    try {
      const r = await mutate('skipCheckin', astronaut, view.key)
      if (r?.ok) {
        finalized.current = true
        setDraft(draftKey, '')
        toast(f.skipped, { duration: 3500 })
        onClose()
        return
      }
      setError(messageFor(r ? r.error : 'network'))
    } catch {
      setError(f.failed)
    } finally {
      setBusy(false)
    }
  }

  /* Klavye: rakam seçer, ← → geçer, ↑ ↓ seçenekler arasında dolaşır (yazı alanında hiçbiri karışmaz) */
  const onKeyDown = (e: KeyboardEvent) => {
    if (done || (e.target as HTMLElement).tagName === 'TEXTAREA' || e.altKey || e.ctrlKey || e.metaKey) return
    const step = nav.step
    if (step < NOTE) {
      const q = QUESTIONS[step]
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
        e.preventDefault()
        choose(q.id, q.options[n - 1])
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        const radios = [...(panelRef.current?.querySelectorAll<HTMLInputElement>(`[data-question="${q.id}"] input`) ?? [])]
        const at = radios.indexOf(document.activeElement as HTMLInputElement)
        const to = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : -1) + radios.length) % radios.length
        radios[to]?.focus()
        return
      }
    }
    if (e.key === 'ArrowRight' && step < SUMMARY) {
      e.preventDefault()
      next()
    } else if (e.key === 'ArrowLeft' && step > 0) {
      e.preventDefault()
      back()
    }
  }

  // Dinleyici pencerenin tamamına bağlanır: odak kapat düğmesindeyken de rakamlar ve oklar çalışır
  const keyRef = useRef(onKeyDown)
  useEffect(() => {
    keyRef.current = onKeyDown
  })
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => keyRef.current(e)
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [panelRef])

  const progressTotal = SUMMARY
  const late = !open && (
    <p role="status" className="mx-6 mt-4 flex items-start gap-2 text-[14.5px] leading-snug text-ink-muted sm:mx-10">
      <Info size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-holo" aria-hidden />
      {lateOk && view.lateUntil ? f.closedNotice(missionTime(view.lateUntil, locale)) : f.expiredNotice}
    </p>
  )

  const slide: Variants = reduced
    ? { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 48, filter: 'blur(6px)' }),
        center: { opacity: 1, x: 0, filter: 'blur(0px)' },
        exit: (d: number) => ({
          opacity: 0,
          x: d * -32,
          filter: 'blur(4px)',
          transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
        }),
      }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* İlerleme: her soru ve not için bir çizgi; yalnızca bulunulan adım yanar (özette hepsi: son adım) */}
      <div className="relative mt-6 flex shrink-0 gap-1.5 px-6 sm:px-10" aria-hidden>
        {Array.from({ length: progressTotal }, (_, i) => {
          const current = i === nav.step || nav.step === SUMMARY
          return (
            <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <span
                className={`absolute inset-0 origin-left rounded-full transition-[transform,background-color,box-shadow] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${current ? 'scale-x-100 bg-holo shadow-[0_0_10px_var(--color-holo)]' : 'scale-x-0 bg-holo'}`}
              />
            </span>
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {f.progress(answered, QUESTIONS.length)}
      </p>
      {late}

      {/* Adım: kayarak gelir, kayarak gider */}
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false} custom={nav.dir}>
          <motion.div
            key={nav.step}
            custom={nav.dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduced ? 0.12 : 0.3, ease: EASE }}
            className="scroll-thin absolute inset-0 overflow-y-auto px-6 py-5 sm:px-10 sm:py-5"
          >
            {/* İçerik alanın dikey ortasında; sığmazsa kayar */}
            <div className="flex min-h-full flex-col justify-center">
              {nav.step < NOTE ? (
                <QuestionStep
                  index={nav.step}
                  value={form.answers[QUESTIONS[nav.step].id]}
                  name={`${ids}-${QUESTIONS[nav.step].id}`}
                  onChoose={(o) => choose(QUESTIONS[nav.step].id, o)}
                  onClear={() =>
                    update({
                      ...form,
                      answers: {
                        ...form.answers,
                        [QUESTIONS[nav.step].id]: null,
                      },
                    })
                  }
                  focusOnMount={nav.moved}
                  reduced={reduced}
                />
              ) : nav.step === NOTE ? (
                <NoteStep id={`${ids}-note`} value={form.note} onChange={(note) => update({ ...form, note })} words={words} overWords={overWords} overChars={overChars} focusOnMount={nav.moved} />
              ) : (
                <SummaryStep form={form} onJump={jump} focusOnMount={nav.moved} reduced={reduced} />
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Alt çubuk: Geri solda; sağda İleri ya da (özette) Kaydet. Hatalar ve uyarılar hemen üstünde. */}
      <footer className="relative shrink-0 px-6 pt-3 pb-6 sm:px-10 sm:pb-8">
        {error && (
          <p role="alert" className="mb-3 text-[15px] leading-snug text-ink">
            {error}
          </p>
        )}
        {nav.step === SUMMARY && empty && canSend && <p className="mb-3 text-[15px] leading-snug text-ink-muted">{f.emptyHint}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {nav.step > 0 ? (
            <PillGhost onClick={back} icon={<ArrowLeft size={17} strokeWidth={1.5} aria-hidden />}>
              {f.back}
            </PillGhost>
          ) : (
            <span />
          )}
          {nav.step === SUMMARY && !saved && (
            <button
              type="button"
              onClick={() => void skip()}
              disabled={busy || !canSend}
              className="order-last min-h-11 w-full px-2 text-center text-[14.5px] whitespace-nowrap text-ink-dim underline-offset-4 sm:order-none sm:w-auto sm:text-left transition-colors duration-300 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {f.skip}
            </button>
          )}
          <span className="flex-1" />
          {nav.step < SUMMARY ? (
            <PillPrimary onClick={next}>{nav.editing ? f.toSummary : f.next}</PillPrimary>
          ) : (
            <PillPrimary onClick={() => void submit()} disabled={busy || empty || overWords || overChars || !canSend} large icon={<Check size={18} strokeWidth={2} aria-hidden />}>
              {busy ? f.saving : saved ? f.update : f.save}
            </PillPrimary>
          )}
        </div>
      </footer>

      <AnimatePresence>{done && <DoneOverlay late={done === 'late'} reduced={reduced} />}</AnimatePresence>
    </div>
  )
}

/* ---------- Adımlar ---------- */

function QuestionStep({
  index,
  value,
  name,
  onChoose,
  onClear,
  focusOnMount,
  reduced,
}: {
  index: number
  value: string | null
  name: string
  onChoose: (option: string) => void
  onClear: () => void
  focusOnMount: boolean
  reduced: boolean
}) {
  const { t } = useI18n()
  const f = t.mindPage.form
  const q = QUESTIONS[index]
  const text = f.questions[q.id]
  const headingId = `${name}-label`
  const heading = useFocusOnMount<HTMLHeadingElement>(focusOnMount)
  const advise = value !== null && q.advise?.includes(value) && text.advice
  const list: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : 0.05,
        delayChildren: reduced ? 0 : 0.08,
      },
    },
  }
  const item: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
      }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-14">
      {/* Solda soru: büyük sıra numarası, soru metni ve (gerekirse) hekime bildirme önerisi */}
      <div className="min-w-0">
        <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{f.questionOf(index + 1, QUESTIONS.length)}</p>
        <p aria-hidden className="mt-3 bg-gradient-to-b from-white/30 to-white/0 bg-clip-text font-display text-[84px] leading-[0.85] font-semibold tracking-tight text-transparent tabular-nums md:text-[112px]">
          {String(index + 1).padStart(2, '0')}
        </p>
        <h3 ref={heading} id={headingId} tabIndex={-1} className="mt-5 font-display text-[28px] leading-[1.12] font-semibold tracking-tight text-balance outline-none md:text-[36px]">
          {text.label}
        </h3>
        <AnimatePresence>
          {advise && (
            <motion.p
              role="note"
              data-advice={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="mt-6 border-l-2 border-warn/70 pl-4 text-[15.5px] leading-relaxed text-ink"
            >
              {text.advice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Sağda seçenekler: kutu yok; ince çizgilerle ayrılmış büyük satırlar. Seçilen satıra ışık süzülür. */}
      <motion.fieldset data-question={q.id} aria-labelledby={headingId} className="min-w-0 self-center" variants={list} initial="hidden" animate="show">
        {q.options.map((o, i) => {
          const checked = value === o
          return (
            <motion.label
              key={o}
              variants={item}
              className="group/opt relative my-1 flex min-h-[3.75rem] cursor-pointer items-center gap-5 rounded-full py-3 pr-3 pl-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-holo"
            >
              {/* Oval, sağa doğru solan vurgu: üstüne gelince hafif, seçilince tam */}
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.2] via-holo/[0.07] to-transparent transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${checked ? 'opacity-100' : 'opacity-0 group-hover/opt:opacity-40'}`}
              />
              <input
                type="radio"
                name={name}
                value={o}
                checked={checked}
                onChange={() => onChoose(o)}
                // Seçili seçeneğe yeniden basmak da ilerletir
                onClick={() => checked && onChoose(o)}
                className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
              />
              <span aria-hidden className={`pointer-events-none relative w-6 shrink-0 font-mono text-[13px] tabular-nums transition-colors duration-500 ${checked ? 'text-holo' : 'text-ink-dim'}`}>
                {i + 1}
              </span>
              <span
                className={`pointer-events-none relative flex-1 font-display text-[20px] leading-snug transition-[color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:text-[23px] ${checked ? 'translate-x-1 text-ink' : 'text-ink-muted group-hover/opt:translate-x-1 group-hover/opt:text-ink'}`}
              >
                {text.options[o]}
              </span>
              <span
                aria-hidden
                className={`pointer-events-none relative flex size-7 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${checked ? 'scale-100 bg-holo text-void shadow-[0_0_22px_-2px_var(--color-holo)]' : 'scale-90 ring-1 ring-white/15 group-hover/opt:ring-white/30'}`}
              >
                {checked && <Check size={15} strokeWidth={2.5} />}
              </span>
            </motion.label>
          )
        })}
        {value !== null && (
          <button type="button" onClick={onClear} aria-label={f.clearLabel(text.label)} className="mt-4 min-h-10 text-[14.5px] text-ink-dim underline-offset-4 transition-colors hover:text-ink hover:underline">
            {f.clear}
          </button>
        )}
      </motion.fieldset>
    </div>
  )
}

function NoteStep({
  id,
  value,
  onChange,
  words,
  overWords,
  overChars,
  focusOnMount,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  words: number
  overWords: boolean
  overChars: boolean
  focusOnMount: boolean
}) {
  const { t } = useI18n()
  const f = t.mindPage.form
  const area = useFocusOnMount<HTMLTextAreaElement>(focusOnMount)
  const countId = `${id}-count`
  const errorId = `${id}-error`
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col">
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{f.noteEyebrow}</p>
      <label htmlFor={id} className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-display text-[28px] leading-[1.12] font-semibold tracking-tight text-balance md:text-[36px]">{f.noteLabel}</span>
        <span className="text-[14.5px] text-ink-dim">{f.optional}</span>
      </label>
      {/* Kutu yok: yazı alanının altında, odaklanınca parlayan tek bir çizgi */}
      <div className="group/note relative mt-8">
        <textarea
          ref={area}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          aria-describedby={`${countId}${overWords || overChars ? ` ${errorId}` : ''}`}
          aria-invalid={overWords || overChars || undefined}
          className="scroll-thin block min-h-44 w-full resize-none bg-transparent text-[19px] leading-relaxed text-ink outline-none placeholder:text-ink-dim"
        />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-white/10" />
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-gradient-to-r from-holo via-holo/60 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within/note:scale-x-100"
        />
      </div>
      <p id={countId} className={`tabular mt-2 text-right font-mono text-[13.5px] ${overWords ? 'text-ink' : 'text-ink-dim'}`}>
        {f.wordCount(words, CHECKIN_CONFIG.noteMaxWords)}
      </p>
      {(overWords || overChars) && (
        <p id={errorId} role="alert" className="mt-1 text-[15px] leading-snug text-ink">
          {overChars ? f.noteTooLongChars : f.noteTooLong(words, CHECKIN_CONFIG.noteMaxWords)}
        </p>
      )}
    </div>
  )
}

function SummaryStep({ form, onJump, focusOnMount, reduced }: { form: FormState; onJump: (step: number) => void; focusOnMount: boolean; reduced: boolean }) {
  const { t } = useI18n()
  const f = t.mindPage.form
  const heading = useFocusOnMount<HTMLHeadingElement>(focusOnMount)
  const list: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduced ? 0 : 0.045,
        delayChildren: reduced ? 0 : 0.06,
      },
    },
  }
  const item: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
      }
  const advice = QUESTIONS.find((q) => {
    const v = form.answers[q.id]
    return v !== null && q.advise?.includes(v) && f.questions[q.id].advice
  })

  const row = (key: string, label: string, answer: string | null, step: number, multiline = false) => (
    <motion.li key={key} variants={item}>
      <button
        type="button"
        data-summary={key}
        onClick={() => onJump(step)}
        className="group/row relative my-0.5 grid w-full grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-4 rounded-full py-2.5 pr-4 pl-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holo sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.14] via-holo/[0.05] to-transparent opacity-0 transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
        />
        <span className="relative font-mono text-[12.5px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{label}</span>
        <span className={`relative min-w-0 text-[18px] leading-snug ${answer === null ? 'text-ink-dim italic' : 'text-ink'} ${multiline ? 'line-clamp-2' : 'truncate'}`}>
          {answer ?? (key === 'note' ? f.noNote : f.omitted)}
        </span>
        <span className="relative flex items-center gap-1.5 text-[14px] text-ink-dim transition-[color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/row:-translate-x-1 group-hover/row:text-holo group-focus-visible/row:text-holo">
          <PenLine size={15} strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">{f.change}</span>
        </span>
      </button>
    </motion.li>
  )

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <p className="font-mono text-[12.5px] font-semibold tracking-[0.18em] text-ink-dim uppercase">{f.summaryEyebrow}</p>
      <h3 ref={heading} tabIndex={-1} className="mt-2 font-display text-[26px] leading-[1.12] font-semibold tracking-tight outline-none md:text-[30px]">
        {f.summaryTitle}
      </h3>
      <p className="mt-2 text-[15.5px] text-ink-muted">{f.summaryHint}</p>
      <motion.ul className="mt-3" variants={list} initial="hidden" animate="show">
        {QUESTIONS.map((q, i) => {
          const v = form.answers[q.id]
          return row(q.id, f.questions[q.id].short, v === null ? null : f.questions[q.id].options[v], i)
        })}
        {row('note', f.noteShort, form.note.trim() || null, NOTE, true)}
      </motion.ul>
      {advice && (
        <p role="note" data-advice={advice.id} className="mt-5 border-l-2 border-warn/70 pl-4 text-[15px] leading-relaxed text-ink">
          {f.questions[advice.id].advice}
        </p>
      )}
    </div>
  )
}

/* ---------- Bitiş animasyonu ---------- */

/**
 * Kaydedilince: halka çizilir, içinden onay işareti geçer, dışa doğru dalgalar ve kıvılcımlar yayılır; altında
 * "Check-in kaydedildi". Hareket azaltılmışsa yalnızca işaret ve yazı solarak gelir.
 */
function DoneOverlay({ late, reduced }: { late: boolean; reduced: boolean }) {
  const { t } = useI18n()
  const f = t.mindPage.form
  const sparks = 14
  return (
    <motion.div
      role="status"
      data-checkin-done
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#060a0f]/[0.97] text-center backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className="relative flex size-44 items-center justify-center">
        {!reduced &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-6 rounded-full ring-1 ring-holo/60"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 2.1], opacity: [0.7, 0] }}
              transition={{
                duration: 1.6,
                delay: 0.55 + i * 0.22,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          ))}
        {!reduced &&
          Array.from({ length: sparks }, (_, i) => {
            const a = (i / sparks) * Math.PI * 2
            const r = 92 + (i % 3) * 14
            return (
              <motion.span
                key={i}
                aria-hidden
                className="absolute size-1.5 rounded-full bg-holo shadow-[0_0_8px_var(--color-holo)]"
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  x: Math.cos(a) * r,
                  y: Math.sin(a) * r,
                  opacity: [0, 1, 0],
                  scale: [0.4, 1, 0.6],
                }}
                transition={{
                  duration: 1.1,
                  delay: 0.6 + (i % 4) * 0.03,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            )
          })}
        <motion.div
          aria-hidden
          className="absolute inset-6 rounded-full bg-holo/[0.08] shadow-[0_0_80px_-10px_var(--color-holo)]"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
        />
        <svg viewBox="0 0 120 120" className="relative size-32" aria-hidden>
          <g transform="rotate(-90 60 60)">
            <motion.circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--color-holo)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{
                pathLength: reduced ? 1 : 0,
                opacity: reduced ? 0 : 1,
              }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: reduced ? 0.2 : 0.7, ease: EASE }}
            />
          </g>
          <motion.path
            d="M38 62 L54 77 L84 45"
            fill="none"
            stroke="var(--color-holo)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 0 : 1 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0.2 : 0.45,
              delay: reduced ? 0 : 0.5,
              ease: EASE,
            }}
          />
        </svg>
      </div>
      <motion.p
        className="mt-8 font-display text-[30px] font-semibold tracking-tight md:text-[38px]"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, filter: 'blur(6px)' }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, delay: reduced ? 0 : 0.75, ease: EASE }}
      >
        {f.doneTitle}
      </motion.p>
      <motion.p
        className="mt-2 max-w-md px-6 text-[16px] text-ink-muted"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: reduced ? 0 : 0.9, ease: EASE }}
      >
        {late ? `${f.doneLate}. ${f.doneSub}` : f.doneSub}
      </motion.p>
    </motion.div>
  )
}

/** Adım değişince odak yeni adımın başlığına (ya da yazı alanına) geçer; ilk açılışta odak kapat düğmesinde kalır */
function useFocusOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (enabled) ref.current?.focus({ preventScroll: true })
    // yalnızca adım açılırken
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

import { Check, Lock, Mic, MicOff, Square } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { GLASS_EASE as EASE, GlassDialog, PillPrimary } from '../components/GlassDialog'
import { missionDay } from '../core/crew'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { useDraft } from '../lib/drafts'
import { usePrefersReducedMotion } from '../lib/settings'
import { useDictation } from '../lib/speech'

/*
 * Günlük yaz (check-in ile aynı cam pencere). Solda kutusuz, geniş bir yazma alanı; altında sesli yazma ve Kaydet.
 * Sağda son notlar. Notlar analiz edilmez, kimseye gönderilmez ve hekim görünümünde gösterilmez; bütün notlar ve silme
 * Kayıtlarım'dadır.
 * - Sesli yazma: mikrofona basınca konuşma yazıya dökülür; kesinleşen her cümle yazının sonuna eklenir, henüz kesinleşmemiş
 *   kısım soluk ve eğik görünür. Konuşurken mikrofonun gerçek ses seviyesine göre bir dalga oynar. Konuşma tanıma
 *   tarayıcının hizmetiyle yapılır; arayüz bunu açıkça söyler.
 * - Yazılan metin taslak olarak tutulur: pencere kapanıp açılınca da durur. Kaydedilemezse metin silinmez.
 * - Açılınca odak yazı alanındadır; sayfanın arka plandaki yenilemeleri odağı kaçırmaz.
 */
const WAVE_BARS = 28

/** fullscreen eski çağrılarla uyum için kabul edilir; pencere hep ortadaki cam penceredir */
export function JournalDialog({ open, onClose }: { open: boolean; onClose: () => void; fullscreen?: boolean }) {
  const { t } = useI18n()
  const j = t.journal
  const { canEdit } = useHealth()
  return (
    <GlassDialog
      open={open}
      onClose={onClose}
      id="journal-dialog"
      title={t.mindPage.library.journal.title}
      subtitle={
        <span className="flex items-center gap-1.5">
          <Lock size={12} strokeWidth={1.75} aria-hidden />
          {j.subtitle}
        </span>
      }
      closeLabel={j.close}
      initialFocus="#journal-text"
    >
      {canEdit ? (
        <JournalStudio />
      ) : (
        <p className="px-6 pt-6 text-[15.5px] text-ink-muted sm:px-10">{j.readOnly}</p>
      )}
    </GlassDialog>
  )
}

/** "bugün" + " ben" → "bugün ben"; nokta sonrası büyük harfle başlar */
function joinText(prev: string, chunk: string, locale: string): string {
  const cap = (s: string) => s.charAt(0).toLocaleUpperCase(locale) + s.slice(1)
  if (!prev.trim()) return cap(chunk)
  const endsSentence = /[.!?…]\s*$/.test(prev)
  const sep = /\s$/.test(prev) ? '' : ' '
  return prev + sep + (endsSentence ? cap(chunk) : chunk)
}

function JournalStudio() {
  const { t, lang, locale } = useI18n()
  const j = t.journal
  const { astronaut, mutate } = useHealth()
  const reduced = usePrefersReducedMotion()
  const notes = useQuery('journal', astronaut ? [astronaut] : null)
  // Yazılan not, pencere kapanıp yeniden açılınca da korunur (astronota göre ayrı)
  const [text, setText] = useDraft(`journal:${astronaut ?? ''}`)
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)
  const textRef = useRef(text)
  useEffect(() => {
    textRef.current = text
  }, [text])
  const area = useRef<HTMLTextAreaElement>(null)

  const dictation = useDictation(lang, (chunk) => {
    const next = joinText(textRef.current, chunk, locale)
    textRef.current = next
    setText(next)
    setSaved(false)
  })

  // Dalga: son seviyelerin kısa geçmişi (yeni değer sağdan girer)
  const [wave, setWave] = useState<number[]>(() => Array(WAVE_BARS).fill(0))
  useEffect(() => {
    if (!dictation.listening) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWave((w) => [...w.slice(1), dictation.level])
  }, [dictation.level, dictation.listening])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dictation.listening) setWave(Array(WAVE_BARS).fill(0))
  }, [dictation.listening])

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const today = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(Date.now())

  // Kaydedilemezse metin silinmez; açık bir hata gösterilir ve yeniden denenebilir
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!astronaut || !text.trim()) return
    dictation.stop()
    setFailed(false)
    try {
      await mutate('addJournal', astronaut, text)
    } catch {
      setFailed(true)
      return
    }
    setText('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2600)
    void mutate('setTaskDone', astronaut, 'journal', true).catch(() => {})
    area.current?.focus()
  }

  const when = (ts: number) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(ts)
  const dictateError = dictation.error === 'denied' ? j.dictateDenied : dictation.error === 'failed' ? j.dictateFailed : null

  return (
    <div className="relative grid min-h-0 flex-1 gap-8 overflow-y-auto px-6 pt-5 pb-6 sm:px-10 sm:pb-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:gap-10 lg:overflow-hidden">
      {/* Yazma alanı */}
      <form onSubmit={submit} className="flex min-h-[420px] flex-col lg:min-h-0">
        <p className="font-mono text-[12.5px] font-semibold tracking-[0.16em] text-ink-dim uppercase">{j.dayLine(today, missionDay(Date.now()))}</p>

        {/* Başlangıç cümleleri: oval, boşken metni başlatır */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[13.5px] text-ink-dim">{j.startWith}</span>
          {j.prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (!text.trim()) setText(p)
                area.current?.focus()
              }}
              className="group/p relative min-h-9 rounded-full px-3.5 text-[14px] text-ink-muted transition-colors duration-500 hover:text-ink"
            >
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-r from-holo/[0.16] via-holo/[0.05] to-transparent opacity-0 ring-1 ring-white/10 transition-opacity duration-500 group-hover/p:opacity-100" />
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/[0.08]" />
              <span className="relative">{p}</span>
            </button>
          ))}
        </div>

        {/* Kutusuz yazı alanı; altında odakta parlayan çizgi; kesinleşmemiş dikte soluk ve eğik */}
        <div className="group/area relative mt-5 flex min-h-0 flex-1 flex-col">
          <label htmlFor="journal-text" className="sr-only">
            {j.placeholder}
          </label>
          <textarea
            ref={area}
            id="journal-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setSaved(false)
            }}
            maxLength={4000}
            placeholder={j.placeholder}
            className="scroll-thin min-h-[180px] w-full flex-1 resize-none bg-transparent text-[19px] leading-[1.75] text-ink outline-none placeholder:text-ink-dim md:text-[20px]"
          />
          <AnimatePresence>
            {dictation.interim && (
              <motion.p
                key="interim"
                data-interim
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="mt-1 text-[18px] leading-relaxed text-holo/70 italic"
              >
                {dictation.interim}…
              </motion.p>
            )}
          </AnimatePresence>
          <span aria-hidden className="mt-3 h-px w-full bg-white/10" />
          <span aria-hidden className="-mt-px h-px w-full origin-left scale-x-0 bg-gradient-to-r from-holo via-holo/60 to-transparent transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within/area:scale-x-100" />
        </div>

        {/* Araç çubuğu: mikrofon ve dalga solda; kelime sayısı ve Kaydet sağda */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {dictation.supported ? (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? j.dictateStop : j.dictate}
              title={dictation.listening ? j.dictateStop : j.dictate}
              data-dictate
              className={`relative flex size-14 shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo active:scale-95 ${dictation.listening ? 'bg-holo text-void shadow-[0_0_40px_-6px_var(--color-holo)]' : 'bg-white/[0.05] text-ink ring-1 ring-white/15 hover:bg-white/[0.09]'}`}
            >
              {/* Dinlerken sese göre genişleyen halkalar */}
              {dictation.listening && !reduced && (
                <>
                  <span aria-hidden className="absolute inset-0 rounded-full ring-2 ring-holo/50 transition-transform duration-150" style={{ transform: `scale(${1.08 + dictation.level * 0.55})` }} />
                  <span aria-hidden className="absolute inset-0 rounded-full ring-1 ring-holo/25 transition-transform duration-300" style={{ transform: `scale(${1.2 + dictation.level * 0.9})` }} />
                </>
              )}
              {dictation.listening ? <Square size={18} strokeWidth={2} className="relative fill-current" aria-hidden /> : <Mic size={22} strokeWidth={1.75} className="relative" aria-hidden />}
            </button>
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/[0.03] text-ink-dim ring-1 ring-white/10" title={j.dictateUnsupported} aria-hidden>
              <MicOff size={20} strokeWidth={1.5} />
            </span>
          )}

          {/* Dalga: boş alanı doldurur; sese göre yükselir */}
          <div aria-hidden className="flex h-10 min-w-24 flex-1 items-center justify-between gap-[3px]">
            {wave.map((v, i) => (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-[height,background-color] duration-150 ${dictation.listening ? 'bg-holo' : 'bg-white/15'}`}
                style={{ height: `${4 + Math.round(v * 32 * (0.55 + 0.45 * Math.sin((i / WAVE_BARS) * Math.PI)))}px`, opacity: dictation.listening ? 0.35 + v * 0.65 : 1 }}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <span className="tabular font-mono text-[13px] text-ink-dim">{j.words(words)}</span>
            <PillPrimary onClick={() => void submit()} disabled={!text.trim()} icon={<Check size={17} strokeWidth={2} aria-hidden />}>
              {j.save}
            </PillPrimary>
          </div>
        </div>

        {/* Durum: kendi satırında (dinliyorum / ipucu / hata) */}
        <p aria-live="polite" data-dictate-status className={`mt-3 text-[14px] leading-snug ${dictation.listening ? 'text-holo' : dictateError ? 'text-ink' : 'text-ink-muted'}`}>
          {dictation.listening ? j.listening : dictateError ?? (dictation.supported ? j.dictateHint : j.dictateUnsupported)}
        </p>

        <div className="mt-1.5 min-h-5">
          <AnimatePresence mode="wait">
            {saved ? (
              <motion.p key="saved" role="status" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-[14.5px] text-ok">
                <Check size={15} strokeWidth={2.25} aria-hidden />
                {j.saved}
              </motion.p>
            ) : failed ? (
              <motion.p key="failed" role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[14.5px] text-ink">
                {j.saveFailed}
              </motion.p>
            ) : dictation.supported ? (
              <motion.p key="privacy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12.5px] leading-snug text-ink-dim">
                {j.dictatePrivacy}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </form>

      {/* Son notlar */}
      <aside aria-labelledby="journal-recent" className="flex min-h-0 flex-col">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="journal-recent" className="font-display text-[20px] font-semibold tracking-tight">
            {j.recent}
          </h3>
          {notes && notes.length > 0 && <span className="text-[13px] text-ink-dim">{j.noteCount(notes.length)}</span>}
        </div>
        {notes && notes.length === 0 && <p className="mt-4 text-[15px] text-ink-muted">{j.empty}</p>}
        <ul className="scroll-thin mt-3 flex min-h-0 flex-col gap-1 lg:flex-1 lg:overflow-y-auto">
          <AnimatePresence initial={false}>
            {notes?.slice(0, 6).map((n) => (
              <motion.li
                key={n.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="group/n relative rounded-[1.25rem] px-4 py-3"
              >
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.25rem] bg-gradient-to-r from-white/[0.05] to-transparent opacity-0 transition-opacity duration-500 group-hover/n:opacity-100" />
                <p className="relative font-mono text-[12px] tracking-[0.08em] text-ink-dim uppercase">{when(n.ts)}</p>
                <p className="relative mt-1 line-clamp-3 text-[15.5px] leading-snug whitespace-pre-line text-ink">{n.text}</p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <p className="mt-3 text-[13.5px] text-ink-dim">{j.allInRecords}</p>
      </aside>
    </div>
  )
}

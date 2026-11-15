import { ArrowLeft, Check, Keyboard, Mic, MicOff, Send, ShieldCheck, Siren, Stethoscope, Users, Volume2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { GLASS_EASE as EASE, GlassDialog, PillGhost, PillPrimary } from '../components/GlassDialog'
import { CREW, type CrewId } from '../core/crew'
import { ASSIST_NOTE_MAX, type AssistRequestDoc } from '../core/crewAssist'
import { useHealth } from '../data/health'
import { useI18n } from '../i18n'
import { closeCrewAssist, useCrewAssistOpen } from '../lib/emergencyFlow'
import { pushEmergencyNotice } from '../lib/emergencyNotices'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion, useSettings } from '../lib/settings'
import { speak, stopSpeaking, useDictation } from '../lib/speech'
import { useActiveEmergency } from './activeEmergency'
import { DoctorContactBody } from './DoctorContact'
import { missionTime } from './checkinFormat'

/*
 * Acil durum (üst çubuktaki kırmızı düğme; docs/wellbeing EM-01, EM-03…EM-05).
 * 1. Ekranın ortasında bir onay: büyük düğme yarım saniye basılı tutulunca acil durum etkinleşir. Erken bırakmak hiçbir
 *    şey göndermez (yanlışlıkla dokunma bildirim göndermez); klavyede Boşluk ya da Enter basılı tutulur.
 * 2. Etkinleşince mürettebata ve sağlık ekibine bildirim gider; bildiren kişinin ekranında da sağ altta tek bir bildirim
 *    çıkar. Asistan sesli olarak "Her şey yolunda mı? Sizi dinliyorum." der ve mikrofon kendiliğinden açılır: söylenen her
 *    cümle yazıya çevrilir ve acil duruma eklenir (alıcıların bildiriminde görünür). Mikrofon yoksa yazarak cevap verilir.
 * 3. "Acil durumu sonlandır" acil durumu kapatır; mürettebata ve sağlık ekibine "kapatıldı" bildirimi gider.
 * Pencere kapatılsa da acil durum sürer (üst çubuktaki düğme yanıp söner); yeniden açınca aynı ekrana dönülür.
 * Tedavi ya da ilaç önerisi yoktur.
 */

/** Etkinleştirmek için basılı tutma süresi */
const HOLD_MS = 500

const newRequestId = () => `as_${crypto.randomUUID().replaceAll('-', '')}`
/** Bu oturumda etkinleşen acil durumların istemci saatindeki başlangıcı (süre sayacı için) */
const startedAt = new Map<string, number>()

/** onOpenMessages: hekime giden mesaj gönderilince "Mesajlarda aç" (pencere kapanır, Mesajlar sayfası açılır) */
export function EmergencyDialog({ onOpenMessages = () => {} }: { onOpenMessages?: () => void }) {
  const { t } = useI18n()
  const { astronaut, canEdit } = useHealth()
  const open = useCrewAssistOpen()
  const active = useActiveEmergency()
  const s = t.mindPage.sos
  useInteraction('emergency', open)
  return (
    <GlassDialog
      open={open}
      onClose={closeCrewAssist}
      id="emergency-dialog"
      tone="crit"
      title={active ? s.activeTitle : s.title}
      subtitle={s.subtitle}
      closeLabel={s.close}
      initialFocus={active ? '#sos-end' : '#sos-hold'}
    >
      {!canEdit || !astronaut ? (
        <div className="flex flex-1 items-center justify-center px-6 sm:px-10">
          <p className="max-w-md text-center text-[16px] text-ink-muted">{t.mindPage.emergency.surgeon}</p>
        </div>
      ) : (
        <SosFlow astronaut={astronaut} onOpenMessages={onOpenMessages} />
      )}
    </GlassDialog>
  )
}

function SosFlow({ astronaut, onOpenMessages }: { astronaut: CrewId; onOpenMessages: () => void }) {
  const { mutate } = useHealth()
  const active = useActiveEmergency()
  /** Etkinleştirmeden (acil olmayan konu) hekime yazılı mesaj: form bu pencerede açılır */
  const [calmDoctor, setCalmDoctor] = useState(false)
  /** Bu pencerede az önce etkinleşti: sorgu güncellenene kadar sonuç buradan gösterilir; sesli karşılama yalnızca bunda */
  const [fresh, setFresh] = useState<AssistRequestDoc | null>(null)
  const [ended, setEnded] = useState(false)
  const pendingId = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const activate = async () => {
    if (busy) return
    // Kimlik ilk denemede bir kez üretilir; yeniden deneme aynı kimlikle yapılır (çift kayıt olmaz)
    const id = (pendingId.current ??= newRequestId())
    setBusy(true)
    setFailed(false)
    try {
      const r = await mutate('sendAssistRequest', astronaut, id)
      if (!r?.ok) throw new Error('send')
      pendingId.current = null
      startedAt.set(id, Date.now())
      setFresh(r.request)
      if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.([120, 60, 120])
      pushEmergencyNotice({ id: `${id}:start`, kind: 'start', sender: astronaut, name: CREW[astronaut].name, at: r.request.ts, demo: r.request.transport === 'local' })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // Sorgu, sonlandırılmış isteği de ilk anda gösterebilir: güncel olan tercih edilir
  const current = active ?? (fresh && !ended ? fresh : null)
  // Durum okunmadan basılı tutma düğmesi gösterilmez (süren bir acil durum varken ikincisi açılmasın)
  if (active === undefined && !fresh) return <div className="flex-1" aria-busy="true" />

  return (
    <AnimatePresence mode="wait" initial={false}>
      {ended ? (
        <Step key="ended">
          <EndedView />
        </Step>
      ) : current ? (
        <Step key="active">
          <ActiveView request={current} greet={fresh?.requestId === current.requestId} onEnded={() => setEnded(true)} onOpenMessages={onOpenMessages} />
        </Step>
      ) : calmDoctor ? (
        <Step key="doctor">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pt-2 pb-8 sm:px-10">
            <DoctorPanel astronaut={astronaut} onBack={() => setCalmDoctor(false)} onOpenMessages={onOpenMessages} />
          </div>
        </Step>
      ) : (
        <Step key="arm">
          <ArmView busy={busy} failed={failed} onActivate={() => void activate()} onDoctor={() => setCalmDoctor(true)} />
        </Step>
      )}
    </AnimatePresence>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  const reduced = usePrefersReducedMotion()
  return (
    <motion.div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.18 } }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/* ---------- 1. Basılı tutarak etkinleştirme ---------- */

function ArmView({ busy, failed, onActivate, onDoctor }: { busy: boolean; failed: boolean; onActivate: () => void; onDoctor: () => void }) {
  const { t } = useI18n()
  const s = t.mindPage.sos
  const ids = useId()
  const [holding, setHolding] = useState(false)
  const [short, setShort] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const begin = () => {
    if (busy || timer.current) return
    setShort(false)
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setHolding(false)
      onActivate()
    }, HOLD_MS)
  }
  const release = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
    setShort(true)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const isKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'
  const filled = holding || busy

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 pb-10 text-center sm:px-10">
      <p className="max-w-xl text-[17px] leading-relaxed text-ink-muted md:text-[18px]">{s.armLead}</p>

      <div className="relative w-full max-w-[700px]">
        {/* Dışta yavaşça nefes alan kırmızı hale: düğmenin acil olduğunu sakin ama açıkça söyler */}
        <span aria-hidden className="pointer-events-none absolute -inset-3 animate-pulse rounded-full bg-crit/[0.07] blur-xl" />
        <button
          id="sos-hold"
          type="button"
          disabled={busy}
          aria-describedby={`${ids}-hint ${ids}-keys`}
          onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
            // Yalnızca ana tuş (sağ tık ya da orta tuş etkinleştirmez)
            if (e.button > 0) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            begin()
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => {
            if (!isKey(e)) return
            e.preventDefault()
            if (!e.repeat) begin()
          }}
          onKeyUp={(e) => {
            if (!isKey(e)) return
            e.preventDefault()
            release()
          }}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative flex min-h-28 w-full touch-none items-center justify-center gap-4 overflow-hidden rounded-full px-8 py-6 ring-2 ring-crit/55 transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none select-none focus-visible:ring-4 focus-visible:ring-crit/80 disabled:cursor-progress md:min-h-32 ${holding ? 'scale-[0.985] shadow-[0_0_80px_-10px_var(--color-crit)]' : 'shadow-[0_24px_70px_-30px_var(--color-crit)]'} bg-crit/[0.07]`}
        >
          {/* Basılı tuttukça soldan sağa dolan kırmızı */}
          <span
            aria-hidden
            data-hold-fill
            className="absolute inset-0 origin-left bg-gradient-to-r from-crit/55 via-crit/75 to-crit"
            style={{ transform: `scaleX(${filled ? 1 : 0})`, transition: holding ? `transform ${HOLD_MS}ms linear` : 'transform 260ms cubic-bezier(0.32,0.72,0,1)' }}
          />
          <span
            className={`relative flex size-14 shrink-0 items-center justify-center rounded-full ring-1 transition-colors duration-300 ${filled ? 'bg-black/20 text-white ring-white/30' : 'bg-crit/12 text-crit ring-crit/40'}`}
          >
            <Siren size={26} strokeWidth={1.75} aria-hidden />
          </span>
          <span className={`relative text-center font-display text-[21px] leading-tight text-balance font-semibold tracking-[-0.01em] transition-colors duration-300 md:text-[26px] ${filled ? 'text-white' : 'text-ink'}`}>
            {busy ? s.sending : s.hold}
          </span>
        </button>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p id={`${ids}-hint`} aria-live="polite" className={`text-[15.5px] transition-colors ${short ? 'text-crit' : 'text-ink-muted'}`}>
          {short ? s.tooShort : s.releaseSafe}
        </p>
        <p id={`${ids}-keys`} className="flex items-center gap-1.5 text-[14px] text-ink-dim">
          <Keyboard size={14} aria-hidden />
          {s.holdKeys}
        </p>
      </div>

      {/* Acil olmayan bir konu: ortada onay yerine hekime yazılı mesaj (eski Acil destek yolunun devamı) */}
      <PillGhost onClick={onDoctor} icon={<Stethoscope size={17} aria-hidden />}>
        {s.notUrgent}
      </PillGhost>

      {failed && (
        <p role="alert" className="max-w-xl rounded-[1.25rem] bg-crit/[0.08] px-5 py-3.5 text-[15.5px] leading-snug text-ink ring-1 ring-crit/30">
          {s.failed}
        </p>
      )}
    </div>
  )
}

/* ---------- 2. Etkin acil durum: sesli karşılama, dinleme, ekip durumu, sonlandırma ---------- */

type Said = { key: string; text: string; state: 'sending' | 'ok' | 'failed' }

function ActiveView({ request, greet, onEnded, onOpenMessages }: { request: AssistRequestDoc; greet: boolean; onEnded: () => void; onOpenMessages: () => void }) {
  const { t, lang, locale } = useI18n()
  const { mutate } = useHealth()
  const { settings } = useSettings()
  const reduced = usePrefersReducedMotion()
  const s = t.mindPage.sos
  const sender = request.sender
  const [said, setSaid] = useState<Said[]>(() => (request.notes ?? []).map((n, i) => ({ key: `n${i}`, text: n.text, state: 'ok' })))
  const [speaking, setSpeaking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endFailed, setEndFailed] = useState(false)
  const [typed, setTyped] = useState('')
  /** Sağ sütunda hekime yazılı mesaj formu (acil durum ve sol sütun açık kalır) */
  const [doctor, setDoctor] = useState(false)
  const counter = useRef(0)
  const listRef = useRef<HTMLOListElement>(null)

  const share = async (text: string) => {
    const clean = text.trim().slice(0, ASSIST_NOTE_MAX)
    if (!clean) return
    const key = `l${counter.current++}`
    setSaid((list) => [...list, { key, text: clean, state: 'sending' }])
    let ok = false
    try {
      ok = !!(await mutate('addAssistNote', sender, request.requestId, clean))?.ok
    } catch {
      ok = false
    }
    setSaid((list) => list.map((x) => (x.key === key ? { ...x, state: ok ? 'ok' : 'failed' } : x)))
  }
  const dictation = useDictation(lang, (chunk) => void share(chunk))
  const { start: startMic, stop: stopMic } = dictation

  // Sesli karşılama: asistan sorar, bitince mikrofon kendiliğinden açılır (asistanın sesi yazıya geçmesin diye sonra)
  useEffect(() => {
    if (!greet) return
    let done = false
    const listen = () => {
      if (done) return
      done = true
      setSpeaking(false)
      startMic()
    }
    if ('speechSynthesis' in window) {
      setSpeaking(true)
      speak(s.prompt, { rate: settings.voiceRate, pitch: settings.voicePitch, voiceURI: settings.voiceURI, gender: settings.voiceGender }, lang, listen)
    }
    // Ses hiç çalmazsa ya da bitiş haber verilmezse yine dinlemeye geçilir
    const fallback = setTimeout(listen, 'speechSynthesis' in window ? 6000 : 0)
    return () => {
      done = true
      clearTimeout(fallback)
      stopSpeaking()
    }
    // Yalnızca etkinleştiği an bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greet])

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [said.length, dictation.interim, reduced])

  const end = async () => {
    setEnding(true)
    setEndFailed(false)
    stopMic()
    stopSpeaking()
    try {
      const r = await mutate('endAssist', sender, request.requestId)
      if (!r?.ok) throw new Error('end')
      pushEmergencyNotice({ id: `${request.requestId}:end`, kind: 'end', sender, name: CREW[sender].name, at: r.request.endedAt ?? r.request.ts, demo: r.request.transport === 'local' })
      onEnded()
    } catch {
      setEndFailed(true)
      setEnding(false)
    }
  }

  const submitTyped = (e: FormEvent) => {
    e.preventDefault()
    const v = typed
    setTyped('')
    void share(v)
  }

  const micError = !dictation.supported ? s.noSpeech : dictation.error === 'denied' ? s.micDenied : dictation.error === 'failed' ? s.micFailed : null
  const level = dictation.listening ? dictation.level : 0

  const panel = 'flex min-h-0 flex-col rounded-[1.75rem] bg-white/[0.025] ring-1 ring-white/[0.07]'
  const micState = dictation.listening ? s.listening : s.micIdle

  return (
    <div className="grid flex-1 gap-4 px-6 pt-1 pb-6 sm:px-10 lg:min-h-0 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5">
      {/* Sol: durum paneli. Üstte işaret ve süre, ortada bildirim gidenler, en altta eylemler */}
      <section aria-label={s.activeTitle} className={`${panel} p-5`}>
        <div className="flex items-center gap-4">
          <Beacon level={level} reduced={reduced} />
          <div className="min-w-0">
            <Elapsed requestId={request.requestId} fallback={request.ts} label={s.elapsedLabel} />
            <p className="mt-2 flex items-start gap-1.5 text-[13.5px] leading-snug text-ink-muted" data-sos-notified>
              <Check size={14} className="mt-0.5 shrink-0 text-crit" aria-hidden />
              {s.notified(missionTime(request.ts, locale))}
            </p>
          </div>
        </div>
        {request.transport === 'local' && <p className="mt-4 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-dim">{s.demo}</p>}
        <div aria-hidden className="my-4 h-px bg-white/[0.06]" />
        <TeamStatus request={request} />

        <div className="mt-auto flex flex-col gap-2 pt-5">
          <button
            id="sos-end"
            type="button"
            onClick={() => void end()}
            disabled={ending}
            className="group flex min-h-12 w-full items-center justify-between gap-3 rounded-full bg-white pr-1.5 pl-5 text-[15.5px] font-semibold text-void shadow-[0_14px_44px_-16px_rgb(255_255_255/0.5)] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
          >
            {ending ? s.ending : s.end}
            <span className="flex size-9 items-center justify-center rounded-full bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105">
              <ShieldCheck size={17} aria-hidden />
            </span>
          </button>
          <button
            type="button"
            aria-pressed={doctor}
            onClick={() => {
              // Konuşma yazıya geçip acil duruma eklenmesin diye mikrofon kapanır; dönünce yeniden açılabilir
              stopMic()
              setDoctor((d) => !d)
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] text-ink-muted ring-1 ring-white/10 transition-[background-color,color] duration-300 hover:bg-white/[0.05] hover:text-ink aria-pressed:bg-holo/10 aria-pressed:text-holo aria-pressed:ring-holo/35"
          >
            <Stethoscope size={17} aria-hidden />
            {s.doctor}
          </button>
          {endFailed && (
            <p role="alert" className="text-[14px] text-crit">
              {s.endFailed}
            </p>
          )}
        </div>
      </section>

      {/* Sağ: konuşma paneli (ya da hekime yazılı mesaj) */}
      {doctor ? (
        <div className={`${panel} p-5 lg:overflow-y-auto`}>
          <DoctorPanel astronaut={request.sender} onBack={() => setDoctor(false)} onOpenMessages={onOpenMessages} />
        </div>
      ) : (
        <section aria-label={s.conversation} className={`${panel} overflow-hidden`}>
          {/* Konuşma: asistanın sorusu solda, söylenenler sağda; uzadıkça kendi içinde kayar */}
          <div className="flex min-h-[180px] flex-1 flex-col gap-3 overflow-y-auto p-5">
            <div className="flex items-start gap-3">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] ring-1 ring-white/10 ${speaking ? 'text-crit' : 'text-ink-muted'}`}>
                <Volume2 size={17} aria-hidden className={speaking && !reduced ? 'animate-pulse' : ''} />
              </span>
              <div className="rounded-[1.4rem] rounded-tl-md bg-white/[0.045] px-4 py-3 ring-1 ring-white/[0.08]">
                <p className="font-mono text-[11.5px] font-semibold tracking-[0.08em] text-ink-dim uppercase">{s.assistantName}</p>
                <p className="mt-0.5 font-display text-[19px] leading-snug font-semibold text-ink">{s.prompt}</p>
              </div>
            </div>

            <ol ref={listRef} aria-label={s.conversation} aria-live="polite" className="flex flex-col items-end gap-2">
              {said.map((x) => (
                <li key={x.key} className="flex max-w-[85%] flex-col items-end gap-1" data-said={x.state}>
                  <p className="rounded-[1.4rem] rounded-br-md bg-crit/[0.12] px-4 py-2.5 text-[16px] leading-snug text-ink ring-1 ring-crit/25">{x.text}</p>
                  <span className={`flex items-center gap-1 text-[12.5px] ${x.state === 'failed' ? 'text-crit' : 'text-ink-dim'}`}>
                    {x.state === 'ok' && <Check size={12} aria-hidden />}
                    {x.state === 'ok' ? s.noteShared : x.state === 'failed' ? s.noteFailed : s.sending}
                  </span>
                </li>
              ))}
              {dictation.interim && <li className="max-w-[85%] rounded-[1.4rem] rounded-br-md bg-white/[0.03] px-4 py-2.5 text-[16px] leading-snug text-ink-muted italic ring-1 ring-white/[0.06]">{dictation.interim}</li>}
            </ol>
          </div>

          {/* Alt: mikrofon, yazı alanı ve gönder tek çubukta; altında mikrofonun durumu */}
          <div className="border-t border-white/[0.06] px-4 pt-3 pb-3.5">
            <form onSubmit={submitTyped} className="flex items-center gap-2 rounded-full bg-black/30 p-1.5 ring-1 ring-white/[0.08] transition-[box-shadow] focus-within:ring-crit/45">
              <button
                type="button"
                disabled={!dictation.supported}
                onClick={() => (dictation.listening ? stopMic() : startMic())}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? s.micOff : s.micOn}
                className={`relative flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${dictation.listening ? 'bg-crit text-void' : 'bg-white/[0.06] text-ink ring-1 ring-white/12 hover:bg-white/[0.1]'}`}
              >
                {dictation.listening && !reduced && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full ring-2 ring-crit/50"
                    style={{ transform: `scale(${1.08 + level * 0.5})`, opacity: 0.35 + level * 0.6, transition: 'transform 90ms linear, opacity 90ms linear' }}
                  />
                )}
                {dictation.listening ? <Mic size={19} aria-hidden /> : <MicOff size={19} aria-hidden />}
              </button>
              <label htmlFor="sos-type" className="sr-only">
                {s.typeLabel}
              </label>
              <input
                id="sos-type"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                maxLength={ASSIST_NOTE_MAX}
                placeholder={s.typePlaceholder}
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-[15.5px] text-ink outline-none placeholder:text-ink-dim"
              />
              <Wave level={level} on={dictation.listening} />
              <button
                type="submit"
                disabled={!typed.trim()}
                aria-label={s.sendNote}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ink ring-1 ring-white/12 transition-[background-color,transform] hover:bg-white/[0.1] active:scale-95 disabled:opacity-35"
              >
                <Send size={16} aria-hidden />
              </button>
            </form>
            <p className="mt-2 flex items-start gap-2 px-3 text-[13px] leading-snug text-ink-dim">
              <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${dictation.listening ? 'bg-crit shadow-[0_0_8px_var(--color-crit)]' : 'bg-ink-dim'}`} />
              <span>
                <span className="font-medium text-ink-muted" data-sos-mic={dictation.listening ? 'on' : 'off'}>
                  {micState}
                </span>
                {' · '}
                {micError ?? s.shareNote}
              </span>
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

/** Hekime yazılı mesaj, acil durum penceresinin içinde: geri düğmesiyle acil durum ekranına dönülür (taslak korunur) */
function DoctorPanel({ astronaut, onBack, onOpenMessages }: { astronaut: CrewId; onBack: () => void; onOpenMessages: () => void }) {
  const { t } = useI18n()
  const s = t.mindPage.sos
  const c = t.mindPage.contact
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus(), [])
  return (
    <section id="doctor-contact" aria-labelledby="sos-doctor-title" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <button
          ref={back}
          type="button"
          onClick={onBack}
          aria-label={s.backToEmergency}
          title={s.backToEmergency}
          className="group flex size-11 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-ink-muted ring-1 ring-white/10 transition-[background-color,color] duration-300 hover:bg-white/[0.08] hover:text-ink"
        >
          <ArrowLeft size={18} className="transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden />
        </button>
        <div className="min-w-0">
          <h3 id="sos-doctor-title" className="flex items-center gap-2 font-display text-[22px] leading-tight font-semibold text-ink">
            <Stethoscope size={19} className="text-holo" aria-hidden />
            {c.title}
          </h3>
          <p className="mt-0.5 text-[14.5px] leading-snug text-ink-muted">{c.subtitle}</p>
        </div>
      </div>
      <DoctorContactBody
        astronaut={astronaut}
        onOpenMessages={() => {
          closeCrewAssist()
          onOpenMessages()
        }}
      />
    </section>
  )
}

/** Kırmızı işaret: dışa doğru yayılan halkalar; mikrofon ses alınca çekirdeğin ışığı büyür */
function Beacon({ level, reduced }: { level: number; reduced: boolean }) {
  return (
    <div aria-hidden className="relative flex size-24 shrink-0 items-center justify-center">
      {!reduced &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-2 rounded-full ring-1 ring-crit/45"
            initial={{ scale: 0.7, opacity: 0.8 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: 'easeOut' }}
          />
        ))}
      <span className="absolute inset-6 rounded-full bg-crit/25 blur-xl transition-transform duration-100" style={{ transform: `scale(${1 + level * 0.7})` }} />
      <span className="relative flex size-14 items-center justify-center rounded-full bg-gradient-to-b from-crit/35 to-crit/10 text-crit shadow-[0_0_50px_-10px_var(--color-crit),inset_0_1px_1px_rgb(255_255_255/0.18)] ring-1 ring-crit/55">
        <Siren size={24} strokeWidth={1.7} />
      </span>
    </div>
  )
}

/** Geçen süre (dakika:saniye); bu oturumda etkinleştiyse istemcinin saatiyle */
function Elapsed({ requestId, fallback, label }: { requestId: string; fallback: number; label: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const sec = Math.max(0, Math.floor((now - (startedAt.get(requestId) ?? fallback)) / 1000))
  const text = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
  return (
    <p className="flex flex-col items-start">
      <span className="font-mono text-[11.5px] font-semibold tracking-[0.1em] text-ink-dim uppercase">{label}</span>
      <span className="tabular mt-0.5 font-mono text-[32px] leading-none font-semibold text-ink" role="timer" aria-label={`${label} ${text}`}>
        {text}
      </span>
    </p>
  )
}

/** Mikrofon dalgası: ses seviyesiyle yükselen ince çubuklar */
function Wave({ level, on }: { level: number; on: boolean }) {
  const bars = 10
  return (
    <span aria-hidden className="hidden h-8 shrink-0 items-center gap-[3px] pr-1 sm:flex">
      {Array.from({ length: bars }, (_, i) => {
        const shape = 0.35 + 0.65 * Math.sin(((i + 1) / (bars + 1)) * Math.PI)
        const h = on ? 4 + level * 26 * shape : 4
        return <span key={i} className={`w-[3px] rounded-full transition-[height] duration-100 ${on ? 'bg-crit/80' : 'bg-white/15'}`} style={{ height: `${h}px` }} />
      })}
    </span>
  )
}

/** Bildirim gidenler: her mürettebat için gitti / gördü / geliyor; sağlık ekibi ayrı satırda */
function TeamStatus({ request }: { request: AssistRequestDoc }) {
  const { t } = useI18n()
  const s = t.mindPage.sos
  const rows = [
    ...request.recipients.map((c) => ({
      key: c,
      name: CREW[c].name,
      icon: <Users size={15} aria-hidden />,
      state: request.acks[c] ? ('coming' as const) : request.deliveries[c] ? ('received' as const) : ('sent' as const),
    })),
    { key: 'medical', name: s.medical, icon: <Stethoscope size={15} aria-hidden />, state: 'sent' as const },
  ]
  const label = { sent: s.statusSent, received: s.statusReceived, coming: s.statusComing }
  return (
    <div className="w-full">
      <h3 className="mb-2.5 font-mono text-[11.5px] font-semibold tracking-[0.1em] text-ink-dim uppercase">{s.team}</h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.key} data-recipient={r.key} data-state={r.state} className="flex min-w-0 items-center gap-2.5 rounded-full bg-white/[0.03] py-1 pr-3.5 pl-1 ring-1 ring-white/[0.06]">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-ink-muted">{r.icon}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{r.name}</span>
            <span className={`flex items-center gap-1.5 text-[13px] ${r.state === 'coming' ? 'text-holo' : r.state === 'received' ? 'text-ink' : 'text-ink-muted'}`}>
              <span aria-hidden className={`size-1.5 rounded-full ${r.state === 'coming' ? 'bg-holo shadow-[0_0_8px_var(--color-holo)]' : r.state === 'received' ? 'bg-ink' : 'bg-ink-dim'}`} />
              {label[r.state]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- 3. Kapatıldı ---------- */

function EndedView() {
  const { t } = useI18n()
  const reduced = usePrefersReducedMotion()
  const s = t.mindPage.sos
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 pb-10 text-center sm:px-10" role="status">
      <motion.span
        className="flex size-24 items-center justify-center rounded-full bg-holo/12 text-holo shadow-[0_0_70px_-14px_var(--color-holo)] ring-1 ring-holo/40"
        initial={reduced ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
      >
        <ShieldCheck size={40} strokeWidth={1.6} aria-hidden />
      </motion.span>
      <h3 className="font-display text-[30px] leading-tight font-semibold text-ink">{s.endedTitle}</h3>
      <p className="max-w-md text-[16.5px] leading-relaxed text-ink-muted">{s.endedLead}</p>
      <PillPrimary onClick={closeCrewAssist} id="sos-done" icon={<Check size={17} aria-hidden />}>
        {s.done}
      </PillPrimary>
    </div>
  )
}

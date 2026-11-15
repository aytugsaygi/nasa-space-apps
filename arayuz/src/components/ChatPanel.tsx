import { ArrowLeft, History, Mic, MicOff, Play, Plus, SendHorizontal, ShieldAlert, Speaker, Sparkles, Square, Trash2, Volume2, VolumeOff, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { CREW } from '../core/crew'
import type { AssistantMode, ChatDoc } from '../core/model'
import { newId } from '../core/store'
import { useContent } from '../data/content'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import type { AssistantContext, StructureQuestion } from '../lib/assistant'
import type { AnswerSource } from '../lib/assistant'
import { runCommand } from '../lib/appCommands'
import { parseComplaint, planAnswer, type AssistantAction, type AssistantReply } from '../lib/assistantModes'
import { fallbackReply, routeQuestion } from '../lib/assistantRouter'
import { useSettings } from '../lib/settings'
import { pickVoice, speak, stopSpeaking, useSpeechToText, useVoices } from '../lib/speech'

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  /** Karşılama mesajı: metni dile ve sayfaya göre çizimde çözülür */
  greeting?: boolean
  actions?: AssistantAction[]
  /** Cevabın dayandığı kaynaklar (P-04) */
  sources?: AnswerSource[]
  ts: number
}

/** Dışarıdan gelen soru (örneğin "Asistana sor" düğmesi); hologramdan geldiyse seçilen yapı da gelir */
export interface PendingQuestion {
  text: string
  nonce: number
  structure?: StructureQuestion
}

interface Props {
  open: boolean
  onClose: () => void
  context: AssistantContext
  pending: PendingQuestion | null
  /** Asistanın önerdiği sayfaya geçer */
  onGoPage?: (page: number) => void
}

let nextId = 1
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Tek asistan: bütün sisteme hakimdir; konuya ve açık sayfaya göre spor koçu, dinleyen ya da arkadaş gibi davranır
 * (rol elle de seçilebilir). Her cevabın sağ altındaki hoparlör mesajı seçilen sesle (kadın/erkek) okur. Konuşmalar
 * kaydedilir ve geçmişten yeniden açılabilir; dinleyen rolündeki konuşmalar özeldir.
 */
export function ChatPanel({ open, onClose, context, pending, onGoPage }: Props) {
  const { settings, toggle, update } = useSettings()
  const { lang, t, locale } = useI18n()
  const { quickQuestions } = useContent()
  const { astronaut, canEdit, mutate, backend } = useHealth()
  const voices = useVoices(lang)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chatId, setChatId] = useState(() => newId('chat'))
  const [messages, setMessages] = useState<Message[]>([{ id: nextId++, role: 'assistant', text: '', greeting: true, ts: Date.now() }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [speaking, setSpeaking] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const program = useQuery('program', open && astronaut ? [astronaut] : null)
  const complaints = useQuery('complaints', open && astronaut ? [astronaut] : null)
  const checkin = useQuery('checkin', open && astronaut ? [astronaut] : null)
  const chats = useQuery('chats', historyOpen && astronaut ? [astronaut] : null)

  const ctxRef = useRef({ context, program, complaints, checkin })
  ctxRef.current = { context, program, complaints, checkin }
  const voiceRef = useRef({ on: settings.voiceReply, voiceURI: settings.voiceURI, rate: settings.voiceRate, pitch: settings.voicePitch, gender: settings.voiceGender })
  voiceRef.current = { on: settings.voiceReply, voiceURI: settings.voiceURI, rate: settings.voiceRate, pitch: settings.voicePitch, gender: settings.voiceGender }
  const langRef = useRef(lang)
  langRef.current = lang

  const stt = useSpeechToText(setInput, lang)
  const genderVoice = pickVoice(lang, settings.voiceGender, settings.voiceURI)
  const greetingKey = context.page === 2 ? 'coach' : context.page === 1 ? 'psych' : 'general'

  /** Konuşmayı kaydeder (geçmişte görünür) */
  const persist = useCallback(
    (list: Message[], usedMode: AssistantMode) => {
      if (!astronaut || !canEdit) return
      const real = list.filter((m) => !m.greeting && !m.streaming && m.text)
      if (!real.length) return
      const first = real.find((m) => m.role === 'user')?.text ?? ''
      void mutate('saveChat', astronaut, { id: chatId, title: first.slice(0, 60), mode: usedMode, private: usedMode === 'psych', messages: real.map((m) => ({ role: m.role, text: m.text, ts: m.ts })) } as Omit<ChatDoc, 'astronaut' | 'ts'>)
    },
    [astronaut, canEdit, mutate, chatId],
  )

  /**
   * Cevabın kaynağı (hepsi çevrimdışı, dil modeli yok):
   * 1. Kriz belirtileri, hologramdan gelen sorular ve serbest anlatılan rahatsızlıklar ("dizim ağrıyor") mevcut kurallarla
   * 2. Site içi yönlendirme ve veri soruları (lib/assistantRouter: "şikayet oluşturmak istiyorum", "12 Kasım'daki kan tahlilim")
   * 3. Koç, dinleyen, ilk yardım ve sohbet kuralları (lib/assistantModes)
   * 4. Hiçbiri bulamazsa uydurmak yerine ne sorulabileceğini gösteren cevap
   */
  const answerFor = async (q: string, structure?: StructureQuestion): Promise<AssistantReply> => {
    const c = ctxRef.current
    const rich = { ...c.context, structure, program: c.program, complaints: c.complaints ?? [], checkin: c.checkin, forcedMode: 'auto' as const }
    const lower = q.toLocaleLowerCase(lang === 'en' ? 'en-US' : 'tr-TR')
    const crisis = /(kendime zarar|intihar|ölmek istiyorum|dayanamıyorum|yaşamak istemiyorum|hurt myself|suicide|want to die|can't go on|cannot go on)/.test(lower)
    if (crisis || structure || (parseComplaint(q, lang) && !/(şikayet|rahatsızlık|complaint)/.test(lower))) return planAnswer(q, rich, canEdit)
    const call = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn()
      } catch {
        return null
      }
    }
    const routed = await call(() =>
      routeQuestion(q, {
        lang,
        t,
        locale,
        snapshot: c.context.snapshot,
        astronaut,
        canEdit,
        sex: astronaut ? CREW[astronaut].sex : 'f',
        complaints: c.complaints ?? [],
        program: c.program,
        data: {
          labs: () => (backend && astronaut ? call(() => backend.call('labs', astronaut)) : Promise.resolve(null)),
          series: (id, from, to) => (backend && astronaut ? call(() => backend.call('series', astronaut, id, from, to)) : Promise.resolve(null)),
          checkinDay: () => (backend && astronaut ? call(() => backend.call('checkinDay', astronaut)) : Promise.resolve(null)),
        },
      }),
    )
    if (routed) return routed
    const planned = planAnswer(q, rich, canEdit)
    const unsure = planned.text.startsWith('Bu konuda sana güvenilir bir cevap veremem.') || planned.text.startsWith('I cannot give you a reliable answer on this.')
    return unsure ? fallbackReply(lang) : planned
  }

  const send = useCallback(
    async (text: string, structure?: StructureQuestion) => {
      const q = text.trim()
      if (!q) return
      setInput('')
      setBusy(true)
      const aid = nextId++
      setMessages((m) => [...m, { id: nextId++, role: 'user', text: q, ts: Date.now() }, { id: aid, role: 'assistant', text: '', streaming: true, ts: Date.now() }])
      const [reply] = await Promise.all([answerFor(q, structure), wait(380)])
      const tokens = reply.text.match(/\S+\s*/g) ?? [reply.text]
      let full = ''
      for (const tk of tokens) {
        full += tk
        setMessages((m) => m.map((msg) => (msg.id === aid ? { ...msg, text: full } : msg)))
        await wait(14 + Math.random() * 30)
      }
      setMessages((m) => {
        const next = m.map((msg) => (msg.id === aid ? { ...msg, streaming: false, actions: reply.actions, sources: reply.sources } : msg))
        persist(next, reply.mode)
        return next
      })
      setBusy(false)
      if (voiceRef.current.on) {
        setSpeaking(aid)
        speak(full, voiceRef.current, langRef.current, () => setSpeaking(null))
      }
    },
    // answerFor her çizimde yenilenir; bağlı olduğu değerler burada
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, persist, backend, astronaut, lang, locale, t],
  )

  useEffect(() => {
    if (pending && open) void send(pending.text, pending.structure)
    // yalnızca yeni bir soru geldiğinde çalışır
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.nonce])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250)
    else {
      stopSpeaking()
      setSpeaking(null)
    }
  }, [open])

  useEffect(() => {
    if (!settings.voiceReply) {
      stopSpeaking()
      setSpeaking(null)
    }
  }, [settings.voiceReply])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!busy) void send(input)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!busy) void send(input)
    }
  }

  const readAloud = (m: Message) => {
    if (speaking === m.id) {
      stopSpeaking()
      setSpeaking(null)
      return
    }
    setSpeaking(m.id)
    speak(m.greeting ? t.assistant.greetings[greetingKey] : m.text, voiceRef.current, lang, () => setSpeaking(null))
  }

  /** Mesajın altındaki eylem düğmeleri */
  const runAction = async (msgId: number, a: AssistantAction) => {
    if (!astronaut && a.kind !== 'run' && a.kind !== 'ask') return
    if (a.kind === 'saveComplaint' && a.complaint && astronaut) {
      // Ayrı onay bildirimi yok: şikayetin uyarı kutusu tek açıklama olarak gelir
      await mutate('addComplaint', astronaut, { ...a.complaint, muscles: [], origin: 'assistant' })
    } else if (a.kind === 'checkin' && a.complaintId && a.answer && astronaut) {
      await mutate('answerCheckin', astronaut, a.complaintId, a.answer)
      toast(t.assistant.checkinSaved, { duration: 3000 })
    } else if (a.kind === 'addWater' && astronaut) {
      await mutate('addWater', astronaut, 250)
      toast(t.assistant.waterSaved, { duration: 2500 })
    } else if (a.kind === 'goPage' && a.page !== undefined) {
      onGoPage?.(a.page)
      return
    } else if (a.kind === 'ask' && a.question) {
      void send(a.question)
    } else if (a.kind === 'run' && a.command) {
      // Düğme sitede ilgili şeyi açar; pencere kapanır ki açılan görünsün. Düğme kalır (yeniden açılabilir).
      const cmd = a.command
      onClose()
      setTimeout(() => runCommand(cmd), 60)
      return
    }
    // Uygulanan eylem düğmeleri kalkar (iki kez kaydedilmesin); odak pencereden düşmesin diye yazı alanına döner
    setMessages((list) => list.map((m) => (m.id === msgId ? { ...m, actions: m.actions?.filter((x) => x !== a && x.kind !== 'checkin') } : m)))
    inputRef.current?.focus()
  }

  const newChat = () => {
    setChatId(newId('chat'))
    setMessages([{ id: nextId++, role: 'assistant', text: '', greeting: true, ts: Date.now() }])
    setHistoryOpen(false)
  }
  const openChat = (c: ChatDoc) => {
    setChatId(c.id)
    setMessages(c.messages.map((m) => ({ id: nextId++, role: m.role, text: m.text, ts: m.ts })))
    setHistoryOpen(false)
  }

  const showQuick = messages.filter((m) => m.role === 'user').length < 2

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          role="dialog"
          aria-label={t.chat.label}
          id="assistant-panel"
          // Esc pencerenin her yerinde çalışır: önce açık ses ayarı ya da geçmiş kapanır, sonra pencere
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.stopPropagation()
            if (voiceOpen) setVoiceOpen(false)
            else if (historyOpen) setHistoryOpen(false)
            else onClose()
          }}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.18 } }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-40 flex flex-col overflow-hidden border-line-strong bg-raised/95 backdrop-blur-xl sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(720px,calc(100dvh-2.5rem))] sm:w-[440px] sm:rounded-3xl sm:border sm:shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]"
        >
          {/* Başlık */}
          <div className="flex items-center gap-2 border-b border-line px-4 py-3.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-holo/10 text-holo ring-1 ring-holo/25">
              <Sparkles size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-display text-[17px] font-semibold">{t.chat.title}</p>
            </div>
            {canEdit && (
              <button type="button" onClick={() => setHistoryOpen((o) => !o)} aria-expanded={historyOpen} aria-label={t.assistant.history} title={t.assistant.history} className={`flex size-10 items-center justify-center rounded-xl border transition-colors hover:text-ink ${historyOpen ? 'border-holo/40 text-holo' : 'border-line text-ink-muted'}`}>
                <History size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoiceOpen((o) => !o)}
              aria-expanded={voiceOpen}
              aria-label={t.chat.voiceSettings}
              title={t.chat.voiceSettings}
              className={`flex size-10 items-center justify-center rounded-xl border transition-colors hover:text-ink ${settings.voiceReply ? 'border-holo/40 text-holo' : 'border-line text-ink-muted'}`}
            >
              {settings.voiceReply ? <Speaker size={17} /> : <VolumeOff size={17} />}
            </button>
            <button type="button" onClick={onClose} aria-label={t.chat.close} className="flex size-10 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:text-ink">
              <X size={17} />
            </button>
          </div>

          {/* Ses ayarları */}
          <AnimatePresence initial={false}>
            {voiceOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-b border-line bg-base/50">
                <div className="space-y-3.5 px-5 py-4">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-medium">{t.chat.voiceReply}</span>
                    <button type="button" role="switch" aria-checked={settings.voiceReply} onClick={() => toggle('voiceReply')} className={`relative h-6 w-11 rounded-full transition-colors ${settings.voiceReply ? 'bg-holo' : 'bg-white/15'}`}>
                      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${settings.voiceReply ? 'left-[22px]' : 'left-0.5'}`} />
                      <span className="sr-only">{t.chat.voiceReply}</span>
                    </button>
                  </label>

                  <div>
                    <p className="text-[14.5px] text-ink-dim">{t.assistant.gender}</p>
                    <div role="radiogroup" aria-label={t.assistant.gender} className="mt-1 flex rounded-xl border border-line p-1">
                      {(['female', 'male'] as const).map((g) => (
                        <button key={g} type="button" role="radio" aria-checked={settings.voiceGender === g} onClick={() => update({ voiceGender: g, voiceURI: null })} className="min-h-9 flex-1 rounded-lg text-[14.5px] text-ink-muted aria-checked:bg-holo/12 aria-checked:text-holo">
                          {t.assistant[g]}
                        </button>
                      ))}
                    </div>
                    {voices.length > 0 && !genderVoice.matched && <p className="mt-1.5 text-[13.5px] leading-snug text-warn">{t.assistant.noGenderVoice(t.assistant[settings.voiceGender])}</p>}
                    {genderVoice.voice && <p className="mt-1 text-[13.5px] text-ink-dim">{genderVoice.voice.name.replace(/\s*-\s*(Turkish|English).*$/i, '')}</p>}
                    {voices.length === 0 && <p className="mt-1 text-[14.5px] leading-snug text-ink-muted">{t.chat.noVoices}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <label className="block">
                      <span className="flex justify-between text-[14.5px] text-ink-dim">
                        {t.chat.rate} <span className="tabular font-mono text-ink-muted">{settings.voiceRate.toFixed(2)}</span>
                      </span>
                      <input type="range" min={0.7} max={1.3} step={0.05} value={settings.voiceRate} onChange={(e) => update({ voiceRate: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-holo)]" />
                    </label>
                    <label className="block">
                      <span className="flex justify-between text-[14.5px] text-ink-dim">
                        {t.chat.pitch} <span className="tabular font-mono text-ink-muted">{settings.voicePitch.toFixed(2)}</span>
                      </span>
                      <input type="range" min={0.7} max={1.3} step={0.05} value={settings.voicePitch} onChange={(e) => update({ voicePitch: Number(e.target.value) })} className="mt-1 w-full accent-[var(--color-holo)]" />
                    </label>
                  </div>

                  <button type="button" disabled={voices.length === 0} onClick={() => speak(t.chat.sample, voiceRef.current, lang)} className="flex min-h-9 items-center gap-2 rounded-lg border border-line px-3 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-40">
                    <Play size={14} aria-hidden />
                    {t.chat.tryVoice}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 border-b border-line bg-warn/[0.05] px-5 py-2 text-[14px] text-ink-muted">
            <ShieldAlert size={14} className="shrink-0 text-warn" aria-hidden />
            {t.chat.disclaimer}
          </div>

          {historyOpen ? (
            /* Konuşma geçmişi */
            <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-3 flex gap-2">
                <button type="button" onClick={() => setHistoryOpen(false)} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14px] text-ink-muted hover:text-ink">
                  <ArrowLeft size={13} aria-hidden />
                  {t.assistant.back}
                </button>
                <button type="button" onClick={newChat} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-holo/12 px-2.5 text-[14px] font-semibold text-holo ring-1 ring-holo/35">
                  <Plus size={13} aria-hidden />
                  {t.assistant.newChat}
                </button>
              </div>
              <p className="mb-2 text-[13px] text-ink-dim">{t.assistant.privateNote}</p>
              {chats && chats.length === 0 && <p className="py-6 text-center text-[14.5px] text-ink-dim">{t.assistant.noHistory}</p>}
              <ul className="space-y-1.5">
                {chats?.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <button type="button" onClick={() => openChat(c)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px] text-ink">{c.title || '—'}</span>
                      <span className="block text-[13px] text-ink-dim">
                        {t.assistant.modes[c.mode]} · {new Date(c.ts).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {c.messages.length}
                      </span>
                    </button>
                    <button type="button" onClick={() => astronaut && void mutate('removeChat', astronaut, c.id)} aria-label={t.assistant.remove} className="flex size-8 items-center justify-center rounded-lg text-ink-dim hover:text-crit">
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {/* Mesajlar */}
              <div ref={listRef} className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div data-role={m.role} className={`relative max-w-[88%] rounded-2xl px-4 py-2.5 text-[16px] leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'rounded-br-md bg-holo/15 text-ink ring-1 ring-holo/20' : 'rounded-bl-md bg-white/[0.04] pb-8 text-ink ring-1 ring-line'}`}>
                      {m.greeting ? t.assistant.greetings[greetingKey] : m.text || <TypingDots label={t.chat.typing} />}
                      {m.streaming && m.text && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-holo motion-safe:animate-pulse" aria-hidden />}
                      {m.role === 'assistant' && !m.streaming && m.actions && m.actions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 whitespace-normal">
                          {m.actions.map((a) => (
                            <button key={`${a.kind}-${a.label}`} type="button" data-action={a.kind} onClick={() => void runAction(m.id, a)} className="min-h-8 rounded-lg border border-holo/40 bg-holo/10 px-2.5 text-[14px] font-medium text-holo transition-colors hover:bg-holo/20">
                              {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* P-04: bilginin dayandığı kaynaklar */}
                      {m.role === 'assistant' && !m.streaming && m.sources && m.sources.length > 0 && (
                        <p data-sources className="mt-2 pr-6 text-[13px] leading-snug whitespace-normal text-ink-dim">
                          {t.assistant.sources}:{' '}
                          {m.sources.map((sr, i) => (
                            <span key={sr.url}>
                              {i > 0 && ' · '}
                              <a href={sr.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-holo">
                                {sr.label}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}
                      {/* Sağ altta hoparlör: mesajı seçilen sesle okur */}
                      {m.role === 'assistant' && !m.streaming && (m.text || m.greeting) && (
                        <button type="button" data-speak onClick={() => readAloud(m)} aria-label={speaking === m.id ? t.assistant.stop : t.assistant.speak} title={speaking === m.id ? t.assistant.stop : t.assistant.speak} className={`absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center rounded-lg transition-colors ${speaking === m.id ? 'bg-holo/20 text-holo' : 'text-ink-dim hover:bg-white/[0.06] hover:text-holo'}`}>
                          {speaking === m.id ? <Square size={12} aria-hidden /> : <Volume2 size={14} aria-hidden />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Hazır sorular */}
              {showQuick && (
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {quickQuestions.map((q) => (
                    <button key={q} type="button" disabled={busy} onClick={() => void send(q)} className="min-h-9 rounded-full border border-line px-3 text-[14.5px] text-ink-muted transition-colors hover:border-holo/40 hover:text-ink disabled:opacity-45">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Yazma alanı */}
              <form onSubmit={onSubmit} className="border-t border-line p-3">
                {(stt.listening || stt.error) && (
                  <p className={`px-2 pb-2 text-[14px] ${stt.error ? 'text-warn' : 'text-holo'}`} role="status">
                    {stt.error ? t.chat.speechErrors[stt.error] : t.chat.listening}
                  </p>
                )}
                <div className="flex items-end gap-2 rounded-2xl border border-line bg-base/70 p-1.5 focus-within:border-holo/45">
                  <label htmlFor="chat-input" className="sr-only">
                    {t.chat.inputLabel}
                  </label>
                  <textarea id="chat-input" ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder={t.chat.placeholder} className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16.5px] text-ink outline-none placeholder:text-ink-dim" />
                  {stt.supported && (
                    <button type="button" onClick={stt.listening ? stt.stop : stt.start} aria-label={stt.listening ? t.chat.stopListening : t.chat.startListening} aria-pressed={stt.listening} className={`relative flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${stt.listening ? 'bg-crit/15 text-crit' : 'text-ink-muted hover:bg-white/[0.05] hover:text-ink'}`}>
                      {stt.listening && <span className="absolute inset-0 rounded-xl ring-2 ring-crit/50 motion-safe:animate-ping" aria-hidden />}
                      {stt.listening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                  )}
                  <button type="submit" disabled={busy || !input.trim()} aria-label={t.chat.send} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-holo text-void transition-opacity disabled:opacity-35">
                    <SendHorizontal size={18} />
                  </button>
                </div>
              </form>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function TypingDots({ label }: { label: string }) {
  return (
    <span className="flex h-6 items-center gap-1" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-ink-dim motion-safe:animate-bounce" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  )
}

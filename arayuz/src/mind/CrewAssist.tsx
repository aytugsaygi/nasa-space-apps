import { ArrowRight, ShieldCheck, Siren } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ToastClose } from '../components/ToastClose'
import { CREW, type CrewId } from '../core/crew'
import type { AssistRequestDoc } from '../core/crewAssist'
import { useHealth, useQuery } from '../data/health'
import { useI18n } from '../i18n'
import { playAlert } from '../lib/audio'
import { openCrewAssist } from '../lib/emergencyFlow'
import { dismissEmergencyNotice, useEmergencyNotices } from '../lib/emergencyNotices'
import { useInteraction } from '../lib/interaction'
import { usePrefersReducedMotion, useSettings } from '../lib/settings'
import { missionTime } from './checkinFormat'

/*
 * Acil durum bildirimleri (docs/wellbeing EM-03, EM-04). Hepsi sağ altta, mesaj bildirimleriyle aynı yerde, sağdan kayarak
 * çıkar; bir olay = tek bildirim.
 * - Bildiren kişinin kendi ekranında: "X acil durum bildirdi · Mürettebat ve sağlık ekibi" ve kapatınca "X acil durumu kapattı"
 *   (lib/emergencyNotices).
 * - Diğer mürettebatın ekranında (AssistInbox): bildirim, söylediklerinin son cümlesi ve "Yardıma gidiyorum" düğmesi.
 *   Bildirim ekrana çizilince uygulama "alındı" onayını gönderir (sunucunun kaydı teslim sayılmaz). Kapatılınca ayrıca
 *   "kapattı" bildirimi gelir.
 * - Uçuş hekimi görünümünde (sağlık ekibi): bütün mürettebatın acil durumları, aynı bildirimle (yanıt düğmesi yok).
 * Tarayıcı modunda (sunucu yok) onaylar "yerel demo" olarak işaretlenir.
 */

/** Sağ alttaki bildirim bölgesinde acil durum bildirimleri (MessageNotifier'ın içinde, mesajlardan önce) */
export function EmergencyDock() {
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      <OwnNotices />
      <AssistInbox />
    </div>
  )
}

function Slide({ children, id }: { children: ReactNode; id: string }) {
  const reduced = usePrefersReducedMotion()
  return (
    <motion.div
      key={id}
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { x: '115%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { x: '115%', opacity: 0, transition: { duration: 0.22 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="pointer-events-auto relative"
    >
      {children}
    </motion.div>
  )
}

/** Bildirim kutusu: kırmızı (acil durum) ya da sakin (kapatıldı) */
function Card({
  kind,
  eyebrow,
  toLine,
  title,
  titleId,
  children,
  onDismiss,
  dismissLabel,
  data,
}: {
  kind: 'start' | 'end'
  eyebrow: string
  toLine: string
  title: string
  titleId: string
  children?: ReactNode
  onDismiss: () => void
  dismissLabel: string
  data?: Record<string, string>
}) {
  const start = kind === 'start'
  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      {...data}
      className={`relative w-full rounded-2xl border bg-raised/95 p-4 pr-11 text-left shadow-2xl backdrop-blur-md ${start ? 'border-crit/50 shadow-[0_24px_60px_-24px_var(--color-crit)]' : 'border-holo/35'}`}
    >
      <span className="flex items-center gap-3">
        <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ${start ? 'bg-crit/12 text-crit ring-crit/40' : 'bg-holo/12 text-holo ring-holo/30'}`}>
          {start && <span aria-hidden className="absolute inset-0 animate-ping rounded-full ring-1 ring-crit/40 motion-reduce:hidden" />}
          {start ? <Siren size={18} aria-hidden /> : <ShieldCheck size={18} aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className={`block truncate font-mono text-[12.5px] font-semibold tracking-[0.07em] uppercase ${start ? 'text-crit' : 'text-holo'}`}>{eyebrow}</span>
          <span className="block truncate text-[14px] text-ink-muted">{toLine}</span>
        </span>
      </span>
      <p id={titleId} className="mt-2.5 text-[15.5px] leading-snug font-semibold text-ink">
        {title}
      </p>
      {children}
      <ToastClose label={dismissLabel} onClose={onDismiss} />
    </div>
  )
}

/** Bildiren kişinin kendi ekranındaki tek bildirim */
function OwnNotices() {
  const { t, locale } = useI18n()
  const s = t.mindPage.sos
  const { profile } = useHealth()
  // Bildirenin kendi ekranında (aynı tarayıcıda başka bir mürettebata geçilince onunki gösterilmez)
  const notices = useEmergencyNotices().filter((n) => profile.role === 'astronaut' && n.sender === profile.self)
  return (
    <AnimatePresence initial={false}>
      {notices.map((n) => (
        <Slide key={n.id} id={n.id}>
          <Card
            kind={n.kind}
            eyebrow={n.kind === 'start' ? s.noticeEyebrow : s.noticeEndedEyebrow}
            toLine={s.noticeTo}
            title={n.kind === 'start' ? s.noticeStart(n.name) : s.noticeEnd(n.name)}
            titleId={`sos-notice-${n.id.replace(':', '-')}`}
            onDismiss={() => dismissEmergencyNotice(n.id)}
            dismissLabel={s.dismiss}
            data={{ 'data-sos-notice': n.kind }}
          >
            <p className="mt-0.5 text-[14px] text-ink-muted">{missionTime(n.at, locale)}</p>
            {n.kind === 'start' && (
              <button type="button" onClick={openCrewAssist} className="group mt-2.5 flex items-center gap-1 text-[13.5px] font-medium text-crit">
                {s.noticeOpen}
                <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            )}
          </Card>
        </Slide>
      ))}
    </AnimatePresence>
  )
}

type InboxCard = { key: string; kind: 'start' | 'end'; request: AssistRequestDoc }

/** Ortadaki kutuda "Tamam" denmiş acil durumlar (tarayıcıda saklanır; yeniden yüklemede aynı kutu tekrar açılmaz) */
const MODAL_SEEN_KEY = 'vitalis.assistSeen'
function loadModalSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MODAL_SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function saveModalSeen(key: string) {
  try {
    const seen = loadModalSeen()
    seen.add(key)
    localStorage.setItem(MODAL_SEEN_KEY, JSON.stringify([...seen].slice(-200)))
  } catch {
    /* yoksay */
  }
}

/**
 * Gelen acil durumlar: mürettebat kendine gelenleri, uçuş hekimi bütün mürettebatınkini görür. Aynı olay tekrar gelirse
 * (yinelenen olay) bildirim kimliği sayesinde ikinci kez açılmaz.
 * - Mürettebat: süren bir acil durum ekranın ortasında bir kutuyla gelir ("X acil durum başlattı"; Tamam ya da Yardıma
 *   gidiyorum). Aynı tarayıcıda o mürettebatın hesabına geçilince de hemen açılır. Kapanış sağ altta bildirim olarak gelir.
 * - Uçuş hekimi: sağ altta bildirim; ayrıca zil listesinde "Acil durumlar" bölümü (TopBar).
 */
export function AssistInbox() {
  const { astronaut, canEdit, profile } = useHealth()
  const { settings } = useSettings()
  const surgeon = profile.role === 'surgeon'
  const crewList = useQuery('incomingAssists', !surgeon && astronaut && canEdit ? [astronaut] : null)
  const surgeonList = useQuery('activeEmergencies', surgeon ? [] : null)
  const incoming = surgeon ? surgeonList : crewList
  const viewer: CrewId | 'surgeon' | null = surgeon ? 'surgeon' : canEdit ? astronaut : null
  const shown = useRef(new Set<string>())
  const [cards, setCards] = useState<InboxCard[]>([])
  /** Mürettebatın ortadaki kutuları (sırayla, biri kapanınca sonraki) */
  const [modals, setModals] = useState<InboxCard[]>([])

  useEffect(() => {
    if (!incoming || !viewer) return
    const add: InboxCard[] = []
    for (const req of incoming) {
      const kind = req.endedAt !== undefined ? 'end' : 'start'
      const key = `${viewer}|${req.requestId}|${kind}`
      if (shown.current.has(key)) continue
      const startKey = `${viewer}|${req.requestId}|start`
      // Açılışı bu ekranda gösterildi mi (bu oturumda ya da daha önce)
      const sawStart = shown.current.has(startKey) || loadModalSeen().has(startKey)
      shown.current.add(key)
      // Kapatılmış bir isteğin açılış bildirimi artık gösterilmez
      if (kind === 'end') shown.current.add(startKey)
      // Gösterilmiş bildirim ve "Tamam" denmiş kutu yeniden yüklemede tekrar çıkmaz (bir olay = tek bildirim)
      if (loadModalSeen().has(key)) continue
      // Açılışını hiç görmediği, çoktan bitmiş acil durumun "kapattı" bildirimi gösterilmez (eski olaylar yığılmaz)
      if (kind === 'end' && !sawStart) {
        saveModalSeen(key)
        continue
      }
      // Ortadaki kutu Tamam denince, sağ alttaki bildirim gösterildiği an görülmüş sayılır
      if (kind === 'end' || viewer === 'surgeon') saveModalSeen(key)
      add.push({ key, kind, request: req })
    }
    if (!add.length) return
    if (settings.sound) playAlert(add.some((c) => c.kind === 'start') ? 'kritik' : 'bilgi')
    const ids = new Set(add.map((c) => c.request.requestId))
    const central = viewer !== 'surgeon'
    // Bir olay = tek kutu: kapanış gelince aynı isteğin açılış kutusu (ortadaki de) kalkar
    /* eslint-disable react-hooks/set-state-in-effect */
    setCards((list) => [...list.filter((c) => !ids.has(c.request.requestId)), ...add.filter((c) => !central || c.kind === 'end')].slice(-3))
    setModals((list) => [...list.filter((c) => !ids.has(c.request.requestId)), ...(central ? add.filter((c) => c.kind === 'start') : [])])
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [incoming, viewer, settings.sound])

  const dismiss = (key: string) => setCards((list) => list.filter((c) => c.key !== key))
  const closeModal = (key: string) => {
    saveModalSeen(key)
    setModals((list) => list.filter((c) => c.key !== key))
  }
  if (!viewer) return null
  const modal = viewer !== 'surgeon' ? modals[0] : undefined
  return (
    <>
      <AssistAlertModal
        card={modal ? { ...modal, request: incoming?.find((r) => r.requestId === modal.request.requestId) ?? modal.request } : null}
        recipient={viewer === 'surgeon' ? null : viewer}
        onClose={closeModal}
      />
      <AnimatePresence initial={false}>
        {cards.map((c) => {
          const latest = incoming?.find((r) => r.requestId === c.request.requestId) ?? c.request
          return (
            <Slide key={c.key} id={c.key}>
              {c.kind === 'start' ? <StartCard request={latest} recipient={viewer === 'surgeon' ? null : viewer} onDismiss={() => dismiss(c.key)} /> : <EndCard request={latest} onDismiss={() => dismiss(c.key)} />}
            </Slide>
          )
        })}
      </AnimatePresence>
    </>
  )
}

/**
 * Mürettebatın ekranının ortasındaki acil durum kutusu: kim başlattı, ne zaman, son söylediği; "Tamam" kutuyu kapatır,
 * "Yardıma gidiyorum" yanıtı bildirene iletir. Kutu ekrana gelince "alındı" onayı gider. Esc "Tamam" gibidir.
 */
function AssistAlertModal({ card, recipient, onClose }: { card: InboxCard | null; recipient: CrewId | null; onClose: (key: string) => void }) {
  const reduced = usePrefersReducedMotion()
  return createPortal(
    <AnimatePresence>
      {card && recipient && (
        <motion.div
          key={card.key}
          // Bildirim kütüphanesinin katmanından da üstte: acil durum kutusu hiçbir bildirimin altında kalmaz
          style={{ zIndex: 2147483000 }}
          className="fixed inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[8px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.22 } }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96, filter: 'blur(8px)' }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.2 } }}
            transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            className="w-[min(520px,100%)]"
          >
            <AlertBody card={card} recipient={recipient} onClose={() => onClose(card.key)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function AlertBody({ card, recipient, onClose }: { card: InboxCard; recipient: CrewId; onClose: () => void }) {
  const { t, locale } = useI18n()
  const { mutate } = useHealth()
  const a = t.mindPage.assist
  const s = t.mindPage.sos
  const request = card.request
  const reduced = usePrefersReducedMotion()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  const okRef = useRef<HTMLButtonElement>(null)
  useInteraction('emergency', true)
  const note = request.notes?.at(-1)?.text
  const titleId = `assist-modal-${request.requestId}`

  // Kutu ekrana geldi: alındı onayı (tekrarı motorda yok sayılır)
  useEffect(() => {
    void mutate('confirmAssistDelivery', recipient, request.requestId).catch(() => {})
  }, [mutate, recipient, request.requestId])
  // Odak Tamam'da; Esc Tamam gibidir; Tab iki düğme arasında döner
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const timer = setTimeout(() => okRef.current?.focus(), 30)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
  }, [])

  const ack = async () => {
    setState('sending')
    try {
      const r = await mutate('ackAssist', recipient, request.requestId)
      if (!r?.ok) throw new Error('ack')
      setState('done')
      setTimeout(() => closeRef.current(), 1600)
    } catch {
      setState('failed')
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-lead`}
      data-assist-modal={recipient}
      data-assist-request={request.requestId}
      className="rounded-[2.25rem] bg-white/[0.035] p-1.5 shadow-[0_60px_140px_-40px_rgb(255_90_90/0.5)] ring-1 ring-crit/30"
    >
      <div className="relative overflow-hidden rounded-[calc(2.25rem-0.375rem)] bg-[#0a0d12] px-7 pt-9 pb-7 text-center shadow-[inset_0_1px_1px_rgb(255_255_255/0.07)] sm:px-9">
        <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-crit/[0.14] blur-[100px]" />
        {/* Yayılan halkalarla kırmızı işaret */}
        <div aria-hidden className="relative mx-auto flex size-28 items-center justify-center">
          {!reduced &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-3 rounded-full ring-1 ring-crit/50"
                initial={{ scale: 0.75, opacity: 0.8 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
              />
            ))}
          <span className="relative flex size-[4.5rem] items-center justify-center rounded-full bg-gradient-to-b from-crit/40 to-crit/10 text-crit shadow-[0_0_60px_-10px_var(--color-crit),inset_0_1px_1px_rgb(255_255_255/0.2)] ring-1 ring-crit/55">
            <Siren size={30} strokeWidth={1.6} />
          </span>
        </div>
        <p className="relative mt-4 font-mono text-[12.5px] font-semibold tracking-[0.14em] text-crit uppercase">{s.noticeEyebrow}</p>
        <h2 id={titleId} className="relative mt-2 font-display text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-ink sm:text-[32px]">
          {a.inboxTitle(CREW[request.sender].name)}
        </h2>
        <p className="tabular relative mt-2.5 font-mono text-[13.5px] tracking-[0.04em] text-ink-dim">
          {s.modalSince(missionTime(request.ts, locale))}
          {request.transport === 'local' && <span className="block pt-1 font-sans tracking-normal">{a.inboxDemo}</span>}
        </p>
        {note && <blockquote className="relative mt-5 rounded-[1.4rem] bg-crit/[0.08] px-5 py-3.5 text-left text-[15.5px] leading-snug text-ink ring-1 ring-crit/20">{a.inboxNote(note)}</blockquote>}
        <p id={`${titleId}-lead`} className="relative mx-auto mt-5 max-w-sm text-[15.5px] leading-relaxed text-ink-muted">
          {s.modalLead}
        </p>

        {state === 'done' ? (
          <p role="status" className="relative mt-6 flex items-center justify-center gap-2 text-[16px] font-medium text-holo">
            <ShieldCheck size={18} aria-hidden />
            {a.acked}
          </p>
        ) : (
          <div className="relative mt-6 flex flex-col gap-2.5 sm:flex-row-reverse">
            <button
              ref={okRef}
              type="button"
              onClick={onClose}
              className="flex min-h-13 flex-1 items-center justify-center rounded-full bg-white px-6 text-[16px] font-semibold text-void shadow-[0_14px_44px_-16px_rgb(255_255_255/0.5)] transition-transform duration-300 active:scale-[0.98]"
            >
              {s.modalOk}
            </button>
            <button
              type="button"
              onClick={() => void ack()}
              disabled={state === 'sending'}
              className="flex min-h-13 flex-1 items-center justify-center rounded-full bg-crit/12 px-6 text-[16px] font-semibold text-crit ring-1 ring-crit/45 transition-[background-color,transform] duration-300 hover:bg-crit/20 active:scale-[0.98] disabled:opacity-60"
            >
              {state === 'sending' ? a.acking : a.ack}
            </button>
          </div>
        )}
        {state === 'failed' && (
          <p role="alert" className="relative mt-3 text-[14px] text-ink">
            {a.ackFailed}
          </p>
        )}
      </div>
    </div>
  )
}

function StartCard({ request, recipient, onDismiss }: { request: AssistRequestDoc; recipient: CrewId | null; onDismiss: () => void }) {
  const { t, locale } = useI18n()
  const { mutate } = useHealth()
  const a = t.mindPage.assist
  const s = t.mindPage.sos
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')
  useInteraction('emergency', recipient !== null && state !== 'done')
  const note = request.notes?.at(-1)?.text

  // Bildirim ekrana çizildi: alındı onayı (tekrarı motorda yok sayılır)
  useEffect(() => {
    if (recipient) void mutate('confirmAssistDelivery', recipient, request.requestId).catch(() => {})
  }, [mutate, recipient, request.requestId])

  const ack = async () => {
    if (!recipient) return
    setState('sending')
    try {
      const r = await mutate('ackAssist', recipient, request.requestId)
      if (r?.ok) {
        setState('done')
        setTimeout(onDismiss, 3000)
      } else setState('failed')
    } catch {
      setState('failed')
    }
  }

  return (
    <Card
      kind="start"
      eyebrow={s.noticeEyebrow}
      toLine={s.noticeTo}
      title={a.inboxTitle(CREW[request.sender].name)}
      titleId={`assist-${request.requestId}`}
      onDismiss={onDismiss}
      dismissLabel={a.dismiss}
      data={{ 'data-assist-request': request.requestId }}
    >
      <p className="mt-0.5 text-[14px] text-ink-muted">{a.inboxTime(missionTime(request.ts, locale))}</p>
      {note && <p className="mt-1.5 line-clamp-3 text-[14.5px] leading-snug text-ink italic">{a.inboxNote(note)}</p>}
      {request.transport === 'local' && <p className="mt-1 text-[13.5px] text-ink-dim">{a.inboxDemo}</p>}
      {recipient &&
        (state === 'done' ? (
          <p role="status" className="mt-3 text-[15px] text-ink">
            {a.acked}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void ack()}
              disabled={state === 'sending'}
              className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full bg-crit px-4 text-[14.5px] font-semibold text-void transition-[transform,opacity] active:scale-[0.98] disabled:opacity-60"
            >
              {state === 'sending' ? a.acking : a.ack}
            </button>
            {state === 'failed' && (
              <p role="alert" className="mt-2 text-[14px] text-ink">
                {a.ackFailed}
              </p>
            )}
          </>
        ))}
    </Card>
  )
}

function EndCard({ request, onDismiss }: { request: AssistRequestDoc; onDismiss: () => void }) {
  const { t, locale } = useI18n()
  const a = t.mindPage.assist
  const s = t.mindPage.sos
  return (
    <Card
      kind="end"
      eyebrow={s.noticeEndedEyebrow}
      toLine={s.noticeTo}
      title={a.inboxEnded(CREW[request.sender].name)}
      titleId={`assist-end-${request.requestId}`}
      onDismiss={onDismiss}
      dismissLabel={a.dismiss}
      data={{ 'data-assist-ended': request.requestId }}
    >
      <p className="mt-0.5 text-[14px] text-ink-muted">{a.inboxEndedAt(missionTime(request.endedAt ?? request.ts, locale))}</p>
    </Card>
  )
}

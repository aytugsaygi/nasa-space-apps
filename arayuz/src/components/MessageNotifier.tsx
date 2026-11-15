import { ArrowRight, FileText, MessageSquareText, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { isCrewId } from '../core/crew'
import { useHealth } from '../data/health'
import { useI18n } from '../i18n'
import { playAlert } from '../lib/audio'
import { describeMessage, registerInboxHandlers, setUnreadMessages, type InboxMessage } from '../lib/inbox'
import { useInteractionActive, type InteractionReason } from '../lib/interaction'
import { focusMessage } from '../lib/messageFocus'
import { useSettings } from '../lib/settings'

type Delivered = InboxMessage

/**
 * Bu işler sürerken mesaj bildirimi kayarak çıkmaz (açık pencere, acil yardım, nefes molası, Cupola): bildirim işin
 * düğmelerinin üstünü örtmesin, kişinin elindeki işi kesmesin. Mesaj kaybolmaz; iş bitince kayarak çıkar, o arada zil
 * listesinde görünür.
 */
const DEFER_DURING: readonly InteractionReason[] = ['dialog', 'emergency', 'breathing', 'library']

/** Bildirimi gösterilmiş mesajlar (tarayıcıda saklanır; aynı mesaj bir kez bildirilir) */
const SEEN_KEY = 'vitalis.inboxSeen'
/** Mesajlar bu aralıkla kontrol edilir; yoldaki bir mesajın ulaşma anında ayrıca kontrol edilir */
const POLL_MS = 3000
/** Aynı anda en fazla bu kadar bildirim görünür (en eskisi çıkar) */
const MAX_SHOWN = 3

function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)))
  } catch {
    /* yoksay */
  }
}

/**
 * Astronot ile uçuş hekimi arasındaki rapor ve mesajların bildirimi: mesaj alıcıya ulaşınca (iletişim gecikmesinden sonra)
 * sağ altta sağdan kayarak çıkar. Bildirime basınca alıcının hesabına geçilir, mesaj Mesajlar sekmesinde açılır ve
 * cevap yazma alanına odaklanılır. Demo tek tarayıcıda iki tarafı da gösterir: hekime giden rapor hekimin, hekimin cevabı
 * astronotun bildirimi olarak görünür.
 *
 * Yalnızca uygulama açıkken ulaşan mesajlar kayarak çıkar. Uygulama kapalıyken ya da açılış ekranı sürerken (paused)
 * ulaşanlar okunmamış listesinde bekler (lib/inbox.ts): zil düğmesinde listelenir, açılışta zilin altında haber verilir.
 */
/** children: acil durum bildirimleri; mesajlardan önce ve bir iş sürerken de görünür (acil durum ertelenmez) */
export function MessageNotifier({ onOpen, reducedMotion, paused, children }: { onOpen: () => void; reducedMotion: boolean; paused: boolean; children?: ReactNode }) {
  const { t, lang } = useI18n()
  const { backend, profile, setRole, setSelf, view, version } = useHealth()
  const { settings } = useSettings()
  const [items, setItems] = useState<Delivered[]>([])
  const seen = useRef<Set<string> | null>(loadSeen())
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Ulaşma anındaki kontrol için en güncel kontrol fonksiyonu */
  const pollRef = useRef<() => void>(() => {})
  /** Bu oturumun başladığı an: daha önce ulaşmış mesajlar kayarak çıkmaz, okunmamış sayılır */
  const sessionStart = useRef(Infinity)
  // Kontrol döngüsünden önce çalışır (efektler sırayla çalışır): ilk kontrolde oturumun başlangıcı bellidir
  useEffect(() => {
    sessionStart.current = Date.now()
  }, [])
  const busy = useInteractionActive(DEFER_DURING)
  const deferred = paused || busy
  const pausedRef = useRef(deferred)
  useEffect(() => {
    pausedRef.current = deferred
    // İş bitince bekleyen bildirimler hemen kontrol edilir
    if (!deferred) pollRef.current()
  }, [deferred])
  const sound = useRef(settings.sound)
  useEffect(() => {
    sound.current = settings.sound
  }, [settings.sound])

  const poll = useCallback(async () => {
    if (!backend) return
    let list: Delivered[]
    try {
      list = await backend.call('messages')
    } catch {
      return
    }
    const human = list.filter((m) => (m.kind === 'message' || m.kind === 'report') && m.from !== 'system')
    // İlk açılışta eski mesajlar bildirilmez
    if (!seen.current) {
      seen.current = new Set(human.filter((m) => m.delivered).map((m) => m.id))
      saveSeen(seen.current)
    }
    const known = seen.current
    const fresh = human.filter((m) => m.delivered && !known.has(m.id)).sort((a, b) => a.deliverAt - b.deliverAt)
    // Oturum sırasında (açılış ekranı bittikten sonra) ulaşanlar kayarak çıkar; öncekiler okunmamış listesinde bekler
    const live = pausedRef.current ? [] : fresh.filter((m) => m.deliverAt >= sessionStart.current)
    if (live.length) {
      for (const m of live) known.add(m.id)
      saveSeen(known)
      setItems((prev) => [...prev, ...live].slice(-MAX_SHOWN))
      if (sound.current) playAlert('bilgi')
    }
    setUnreadMessages(fresh.filter((m) => !known.has(m.id)).reverse())
    // Yoldaki en yakın mesaj ulaşır ulaşmaz kontrol edilir (istasyonda 0,6 sn, Mars'ta dakikalar)
    const next = human.filter((m) => !m.delivered && !m.queued).reduce((min, m) => Math.min(min, m.deliverAt), Infinity)
    if (nextTimer.current) clearTimeout(nextTimer.current)
    nextTimer.current = Number.isFinite(next) ? setTimeout(() => pollRef.current(), Math.max(50, next - Date.now() + 100)) : null
  }, [backend])

  // Düzenli kontrol; bir şey gönderildiğinde (güncelleme sayacı artar) hemen
  useEffect(() => {
    pollRef.current = () => void poll()
    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => clearInterval(timer)
  }, [poll, version])
  useEffect(
    () => () => {
      if (nextTimer.current) clearTimeout(nextTimer.current)
    },
    [],
  )

  const dismiss = (id: string) => setItems((list) => list.filter((m) => m.id !== id))
  /** Okunmamış mesajları okundu sayar (bir daha listelenmez) */
  const markRead = (ids: string[]) => {
    if (!seen.current) seen.current = new Set()
    for (const id of ids) seen.current.add(id)
    saveSeen(seen.current)
    void poll()
  }
  /** Şu an kimin hesabı açık: hekim ya da astronotun kendisi */
  const current = profile.role === 'surgeon' ? 'surgeon' : profile.self

  const open = (m: Delivered) => {
    const astronaut = m.astronaut
    if (!isCrewId(astronaut)) return dismiss(m.id)
    if (m.to === 'surgeon') {
      setRole('surgeon')
      view(astronaut)
    } else {
      setSelf(m.to)
      setRole('astronaut')
    }
    focusMessage({ astronaut, id: m.id, reply: true })
    onOpen()
    dismiss(m.id)
    markRead([m.id])
  }
  // Üst bardaki okunmamış listesi mesajı bu bileşenin işlevleriyle açar
  useEffect(() => registerInboxHandlers({ open, markRead }))

  return (
    <div
      role="region"
      aria-label={t.inbox.label}
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {children}
      <AnimatePresence initial={false}>
        {/* Bir iş sürerken görünen bildirimler de geri çekilir; iş bitince yeniden görünür */}
        {(busy ? [] : items).map((m) => {
          const { to, sender, report } = describeMessage(m, lang)
          const Icon = report ? FileText : MessageSquareText
          const switches = m.to !== current
          return (
            <motion.div
              key={m.id}
              layout={!reducedMotion}
              initial={reducedMotion ? { opacity: 0 } : { x: '115%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { x: '115%', opacity: 0, transition: { duration: 0.22 } }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              className="pointer-events-auto relative"
              data-inbox={m.id}
            >
              <button
                type="button"
                onClick={() => open(m)}
                className="group w-full rounded-2xl border border-holo/35 bg-raised/95 p-4 pr-12 text-left shadow-2xl backdrop-blur-md transition-colors hover:border-holo/60 focus-visible:ring-2 focus-visible:ring-holo/60 focus-visible:outline-none"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-holo/12 text-holo ring-1 ring-holo/30">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-mono font-semibold text-[12.5px] tracking-[0.07em] text-holo uppercase">{report ? t.inbox.reportEyebrow : t.inbox.messageEyebrow}</span>
                    <span className="block truncate text-[14px] text-ink-muted">
                      {to.name} · {to.role}
                    </span>
                  </span>
                </span>
                <span className="mt-2.5 block text-[15.5px] leading-snug font-semibold text-ink">{report ? t.inbox.report(sender) : t.inbox.message(sender)}</span>
                <span className="mt-1 line-clamp-2 block text-[14px] leading-snug whitespace-pre-line text-ink-muted">{m.text.split('\n')[0]}</span>
                <span className="mt-2.5 flex items-center gap-1 text-[13.5px] font-medium text-holo">
                  {switches ? t.inbox.openSwitch(to.name) : t.inbox.open}
                  <ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismiss(m.id)}
                aria-label={t.inbox.dismiss}
                className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <X size={15} aria-hidden />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

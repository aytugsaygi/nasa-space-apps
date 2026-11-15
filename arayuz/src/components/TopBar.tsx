import { Bell, BookOpen, Compass, FileText, Menu, MessageSquareText, ShieldCheck, Siren, Sparkles, Vibrate, VibrateOff, Volume2, VolumeX, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { CREW, MISSION } from '../core/crew'
import type { AssistRequestDoc } from '../core/crewAssist'
import type { Finding } from '../core/model'
import type { ScenarioId } from '../core/scenarios'
import { useHealth, useQuery } from '../data/health'
import { LANGS, resolve, useI18n } from '../i18n'
import { useAppCommand } from '../lib/appCommands'
import { describeMessage, useInbox } from '../lib/inbox'
import { useSettings } from '../lib/settings'
import { ALERT_META } from '../lib/status'
import { useActiveEmergency } from '../mind/activeEmergency'
import { missionTime } from '../mind/checkinFormat'
import { openCrewAssist } from '../lib/emergencyFlow'
import { DemoPanel, type RegionProblem } from './DemoPanel'
import { Popover } from './Popover'
import { ProfileMenu } from './ProfileMenu'
import { Tooltip } from './Tooltip'

/** Geçmişteki bildirim: analizin bulduğu durum ve bildirildiği an */
export type LoggedAlert = Finding & { at: number }

interface Props {
  alerts: LoggedAlert[]
  unread: number
  buzzKey: number
  onOpenAlerts: () => void
  onScenario: (id: ScenarioId) => void
  onResetDemo: () => void
  /** Demo: seçilen bölgede seçilen sorunu oluşturur */
  onRegionProblem: (p: RegionProblem) => void
  onStartTour: () => void
  onOpenSources: () => void
  onOpenAlert: (alert: LoggedAlert) => void
  onOpenAssistant: () => void
  menuOpen: boolean
  onOpenMenu: () => void
  /** Hekim mürettebat listesindeyken bölüm menüsü yoktur */
  showMenu: boolean
  /** Açılış ekranı bitti mi (okunmamış bildirim kutusu bundan sonra çıkar) */
  ready: boolean
  /** Uygulama kapalıyken ya da açılış sürerken oluşmuş, henüz görülmemiş uyarı sayısı */
  awayAlerts: number
}

function useMissionClock(start: number, daySuffix: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const s = Math.floor((now - start) / 1000)
  const d = Math.floor(s / 86400)
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${d}${daySuffix} ${hh}:${mm}:${ss}`
}

const iconBtn =
  'relative flex size-11 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:bg-white/[0.03] hover:text-ink'

/** Hekimin zil listesinde görülmüş acil durum olayları (tarayıcıda saklanır) */
const BELL_SEEN_KEY = 'vitalis.emergencyBellSeen'
const bellKey = (r: AssistRequestDoc) => `${r.requestId}:${r.endedAt !== undefined ? 'end' : 'start'}`
function loadBellSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(BELL_SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function saveBellSeen(keys: string[]): Set<string> {
  const seen = loadBellSeen()
  for (const k of keys) seen.add(k)
  try {
    localStorage.setItem(BELL_SEEN_KEY, JSON.stringify([...seen].slice(-200)))
  } catch {
    /* yoksay */
  }
  return seen
}

export function TopBar({ alerts, unread, buzzKey, onOpenAlerts, onScenario, onResetDemo, onRegionProblem, onStartTour, onOpenSources, onOpenAlert, onOpenAssistant, menuOpen, onOpenMenu, showMenu, ready, awayAlerts }: Props) {
  const { settings, toggle } = useSettings()
  const { lang, setLang, t, locale } = useI18n()
  const { canEdit, profile, view } = useHealth()
  /*
   * Uçuş hekimi (sağlık ekibi) görünümünde zil listesinin başında "Acil durumlar": süresi geçmemiş bütün acil durumlar,
   * sürüyor ya da kapatıldı. Görülmemiş başlangıç ve kapanışlar zildeki sayıya eklenir; zil açılınca görülmüş sayılır.
   * Basınca o mürettebatın görünümüne geçilir.
   */
  const surgeon = profile.role === 'surgeon'
  const emergencies = useQuery('activeEmergencies', surgeon ? [] : null) ?? []
  const [bellSeen, setBellSeen] = useState(loadBellSeen)
  const unseenEmergencies = emergencies.filter((r) => !bellSeen.has(bellKey(r))).length
  const clock = useMissionClock(MISSION.start, t.topbar.daySuffix)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  // Asistandan: acil durum penceresi
  useAppCommand('openEmergency', openCrewAssist)
  /** Sonlandırılmamış acil durum: düğme dolu kırmızı ve nabız gibi atar */
  const emergencyActive = !!useActiveEmergency()
  const inbox = useInbox()
  /** Zilin altındaki "okunmamış bildirimlerin var" kutusu kapatıldı mı (oturumda bir kez gösterilir) */
  const [calloutClosed, setCalloutClosed] = useState(false)
  const badge = unread + inbox.unread.length + unseenEmergencies
  const showCallout = ready && !calloutClosed && !alertsOpen && awayAlerts + inbox.unread.length > 0
  const openAlerts = () => {
    if (emergencies.length) setBellSeen(saveBellSeen(emergencies.map(bellKey)))
    setAlertsOpen((o) => !o)
    setCalloutClosed(true)
    onOpenAlerts()
  }

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {/* Bölüm menüsü ve marka */}
      <div className="flex items-center gap-3">
        {showMenu && (
          <Tooltip label={t.layout.menuTip} align="start">
            <button
              id="tools-menu-button"
              type="button"
              onClick={onOpenMenu}
              className="relative flex size-11 items-center justify-center rounded-xl border border-line-strong text-ink transition-colors hover:border-holo/40 hover:bg-white/[0.03] hover:text-holo"
              aria-label={t.layout.openMenu}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
            >
              <Menu size={20} />
            </button>
          </Tooltip>
        )}
        <div className="relative flex size-10 items-center justify-center rounded-xl border border-holo/30 bg-holo/[0.07]">
          <svg viewBox="0 0 24 24" className="size-5 text-holo" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="8.5" opacity="0.45" />
            <path d="M4.5 12h3.5l1.8-3.6 3.4 7.2 1.8-3.6h4.5" />
          </svg>
        </div>
        <div className="leading-tight">
          <p className="brand-text font-display text-[19px] font-semibold tracking-tight">Health Atlas</p>
          <p className="text-[14.5px] text-ink-dim">{t.topbar.subtitle}</p>
        </div>
      </div>

      {/* Görev bilgisi */}
      <dl className="hidden items-center gap-6 border-l border-line pl-6 xl:flex">
        <div>
          <dt className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.topbar.mission}</dt>
          <dd className="text-sm font-medium">{resolve(MISSION.name, lang)}</dd>
        </div>
        <div>
          <dt className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{t.topbar.missionTime}</dt>
          <dd className="tabular font-mono text-sm text-holo">{clock}</dd>
        </div>
      </dl>

      {/* Kontroller */}
      <div className="ml-auto flex flex-wrap items-center gap-1.5 min-[1680px]:gap-2">
        {/*
         * Acil durum: her sayfada, asistanın solunda, kırmızı. Ortada bir onay penceresi açar; acil durum ancak düğme
         * yarım saniye basılı tutulunca etkinleşir (pencereyi açmak tek başına kimseye bildirim göndermez). Etkinken düğme
         * dolu kırmızıdır ve nabız gibi atar; basınca süren acil durumun ekranı açılır.
         */}
        <Tooltip label={emergencyActive ? t.emergencyButton.active : t.emergencyButton.tip}>
          <button
            id="emergency-button"
            type="button"
            onClick={openCrewAssist}
            aria-haspopup="dialog"
            data-active={emergencyActive || undefined}
            className={`relative flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors ${emergencyActive ? 'bg-crit text-void shadow-[0_0_24px_-4px_var(--color-crit)] ring-crit' : 'bg-crit/12 text-crit ring-crit/45 hover:bg-crit/20'}`}
          >
            {emergencyActive && <span aria-hidden className="absolute inset-0 animate-ping rounded-xl ring-2 ring-crit/60 motion-reduce:hidden" />}
            <Siren size={17} aria-hidden />
            {/* Orta genişlikte (1440 dahil) üst bar tek satıra sığsın diye yalnızca simge; yazı geniş ekranda */}
            <span className="hidden min-[1680px]:inline">{t.emergencyButton.label}</span>
            <span className="sr-only min-[1680px]:hidden">{t.emergencyButton.label}</span>
          </button>
        </Tooltip>
        <Tooltip label={t.topbar.assistant}>
          <button
            id="tour-assistant"
            type="button"
            onClick={onOpenAssistant}
            className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-holo/10 px-3 text-sm font-medium text-holo ring-1 ring-holo/30 transition-colors hover:bg-holo/15 min-[1680px]:px-3.5"
          >
            <Sparkles size={17} aria-hidden />
            {/* Üst bar tek satıra sığsın diye Sağlık Asistanı adı yalnızca geniş ekranda yazılır; diğerlerinde simge ve ipucu */}
            <span className="hidden min-[1680px]:inline">{t.topbar.assistant}</span>
            <span className="sr-only min-[1680px]:hidden">{t.topbar.assistant}</span>
          </button>
        </Tooltip>
        <Popover
          open={demoOpen}
          onClose={() => setDemoOpen(false)}
          label={t.demo.title}
          width="w-80"
          trigger={
            <Tooltip label={t.demo.tooltip}>
              <button id="tour-demo" type="button" onClick={() => setDemoOpen((o) => !o)} className={`${iconBtn} w-auto gap-2 px-3 text-sm`} aria-expanded={demoOpen} aria-label={t.demo.title}>
                <Zap size={16} aria-hidden />
                <span className="hidden min-[1680px]:inline">{t.demo.button}</span>
              </button>
            </Tooltip>
          }
        >
          <DemoPanel
            canEdit={canEdit}
            onScenario={(id) => {
              onScenario(id)
              setDemoOpen(false)
            }}
            onRegionProblem={(p) => {
              onRegionProblem(p)
              setDemoOpen(false)
            }}
            onReset={() => {
              onResetDemo()
              setDemoOpen(false)
            }}
          />
        </Popover>

        <div id="tour-feedback" className="flex items-center gap-2">
          <Tooltip label={settings.sound ? t.topbar.soundOff : t.topbar.soundOn}>
            <button type="button" onClick={() => toggle('sound')} className={iconBtn} aria-pressed={settings.sound} aria-label={t.topbar.soundLabel}>
              {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} className="text-ink-dim" />}
            </button>
          </Tooltip>
          <Tooltip label={settings.vibration ? t.topbar.vibrationOff : t.topbar.vibrationOn}>
            <button type="button" onClick={() => toggle('vibration')} className={iconBtn} aria-pressed={settings.vibration} aria-label={t.topbar.vibrationLabel}>
              {settings.vibration ? <Vibrate size={18} /> : <VibrateOff size={18} className="text-ink-dim" />}
            </button>
          </Tooltip>
        </div>

        {/* Bildirimler: okunmamış varsa açılışta zilin altında küçük bir kutu haber verir */}
        <div className="relative">
        <Popover
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          label={t.topbar.notifications}
          width="w-96"
          trigger={
            <Tooltip label={t.topbar.notifications}>
              <button
                id="tour-alerts"
                key={buzzKey}
                type="button"
                onClick={openAlerts}
                className={`${iconBtn} ${buzzKey > 0 && settings.vibration ? 'buzz' : ''}`}
                aria-label={badge ? t.topbar.notificationsUnread(badge) : t.topbar.notifications}
                aria-expanded={alertsOpen}
              >
                <Bell size={18} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-crit px-1 font-mono text-[12.5px] font-semibold text-void">{badge}</span>
                )}
              </button>
            </Tooltip>
          }
        >
          <p className="px-3 pt-2 pb-1 font-display text-sm font-medium">{t.topbar.notifications}</p>
          {surgeon && emergencies.length > 0 && (
            <div data-emergencies className="mb-1 border-b border-line pb-1">
              <p className="px-3 pt-1 pb-1 font-mono text-[12.5px] font-semibold tracking-[0.07em] text-crit uppercase">{t.mindPage.sos.bellTitle}</p>
              <ul className="scroll-thin max-h-60 overflow-y-auto">
                {emergencies.map((r) => {
                  const ended = r.endedAt !== undefined
                  const note = r.notes?.at(-1)?.text
                  return (
                    <li key={r.requestId} data-emergency={ended ? 'ended' : 'active'}>
                      <button
                        type="button"
                        onClick={() => {
                          view(r.sender)
                          setAlertsOpen(false)
                        }}
                        title={t.mindPage.sos.bellOpen(CREW[r.sender].name)}
                        className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        {ended ? <ShieldCheck size={17} className="mt-0.5 shrink-0 text-holo" aria-hidden /> : <Siren size={17} className="mt-0.5 shrink-0 text-crit" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-ink">{t.mindPage.assist.inboxTitle(CREW[r.sender].name)}</span>
                            <span className="tabular shrink-0 font-mono text-[12.5px] text-ink-dim">{missionTime(r.ts, locale)}</span>
                          </span>
                          <span className={`mt-0.5 block text-[13.5px] ${ended ? 'text-ink-dim' : 'text-crit'}`}>
                            {ended ? t.mindPage.sos.bellEnded(missionTime(r.endedAt!, locale)) : t.mindPage.sos.bellActive(missionTime(r.ts, locale))}
                          </span>
                          {note && <span className="mt-0.5 line-clamp-1 block text-[14px] leading-snug text-ink-muted italic">{t.mindPage.assist.inboxNote(note)}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {/* Uygulama kapalıyken gelen rapor ve mesajlar: basınca alıcının hesabına geçilip mesaj açılır */}
          {inbox.unread.length > 0 && (
            <div data-unread-messages className="mb-1 border-b border-line pb-1">
              <p className="flex items-center justify-between gap-2 px-3 pt-1 pb-1">
                <span className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-holo uppercase">{t.topbar.unreadMessages}</span>
                <button type="button" onClick={() => inbox.markRead(inbox.unread.map((m) => m.id))} className="rounded-md px-1 text-[13.5px] text-ink-dim transition-colors hover:text-ink">
                  {t.topbar.markAllRead}
                </button>
              </p>
              <ul className="scroll-thin max-h-60 overflow-y-auto">
                {inbox.unread.map((m) => {
                  const d = describeMessage(m, lang)
                  const Icon = d.report ? FileText : MessageSquareText
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          inbox.open(m)
                          setAlertsOpen(false)
                        }}
                        className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <Icon size={17} className="mt-0.5 shrink-0 text-holo" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-ink">{d.report ? t.inbox.report(d.sender) : t.inbox.message(d.sender)}</span>
                            <span className="tabular shrink-0 font-mono text-[12.5px] text-ink-dim">{new Date(m.deliverAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                          </span>
                          <span className="mt-0.5 block text-[13.5px] text-ink-dim">
                            {d.to.name} · {d.to.role}
                          </span>
                          <span className="mt-0.5 line-clamp-1 block text-[14.5px] leading-snug text-ink-muted">{m.text.split('\n')[0]}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {alerts.length === 0 && (inbox.unread.length > 0 || (surgeon && emergencies.length > 0)) ? null : alerts.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-dim">{t.topbar.noNotifications}</p>
          ) : (
            <ul className="scroll-thin max-h-96 overflow-y-auto">
              {alerts.map((a) => {
                const m = ALERT_META[a.level]
                const Icon = m.icon
                return (
                  <li key={`${a.key}:${a.at}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAlert(a)
                        setAlertsOpen(false)
                      }}
                      className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                    >
                      <Icon size={17} className={`mt-0.5 shrink-0 ${m.text}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium text-ink">{resolve(a.title, lang)}</span>
                          <span className="tabular shrink-0 font-mono text-[12.5px] text-ink-dim">{new Date(a.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                        <span className="mt-0.5 block text-[14.5px] leading-snug text-ink-muted">{resolve(a.reason, lang)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Popover>
          <AnimatePresence>
            {showCallout && (
              <motion.div
                key="unread-callout"
                role="status"
                data-unread-callout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-full right-0 z-40 mt-3 w-[min(18.5rem,calc(100vw-2rem))] rounded-2xl border border-holo/40 bg-raised/95 p-3.5 pr-10 shadow-2xl backdrop-blur-md"
              >
                {/* Zile bakan küçük ok */}
                <span className="absolute -top-[7px] right-4 size-3 rotate-45 border-t border-l border-holo/40 bg-raised" aria-hidden />
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  <Bell size={15} className="shrink-0 text-holo" aria-hidden />
                  {t.topbar.unreadTitle}
                </p>
                <p className="mt-1 text-[14px] text-ink-muted">{t.topbar.unreadDetail(inbox.unread.length, awayAlerts)}</p>
                <button
                  type="button"
                  onClick={openAlerts}
                  className="mt-2.5 flex min-h-8 items-center rounded-lg bg-holo/12 px-3 text-[14px] font-semibold text-holo ring-1 ring-holo/35 transition-colors hover:bg-holo/20"
                >
                  {t.topbar.unreadShow}
                </button>
                <button
                  type="button"
                  onClick={() => setCalloutClosed(true)}
                  aria-label={t.topbar.unreadDismiss}
                  className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Tooltip label={t.topbar.tour}>
          <button type="button" onClick={onStartTour} className={iconBtn} aria-label={t.topbar.startTour}>
            <Compass size={18} />
          </button>
        </Tooltip>
        <Tooltip label={t.topbar.sources}>
          <button type="button" onClick={onOpenSources} className={iconBtn} aria-label={t.topbar.sources}>
            <BookOpen size={18} />
          </button>
        </Tooltip>

        <ProfileMenu />

        {/* Dil seçimi */}
        <div id="tour-lang" role="group" aria-label={t.lang.label} className="flex rounded-xl border border-line p-1">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              aria-label={t.lang.names[l]}
              title={t.lang.names[l]}
              className="min-h-9 min-w-10 rounded-lg px-2 font-mono text-[14.5px] font-medium text-ink-dim transition-colors hover:text-ink aria-pressed:bg-holo/12 aria-pressed:text-holo"
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}

import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { toast, Toaster } from 'sonner'
import { ActionToast } from './components/ActionToast'
import { AlertToast } from './components/AlertToast'
import { ChatPanel, type PendingQuestion } from './components/ChatPanel'
import { MessageNotifier } from './components/MessageNotifier'
import { ComplaintHistory } from './components/ComplaintHistory'
import { CrewOverview, ViewingBanner } from './components/CrewOverview'
import { Dashboard } from './components/Dashboard'
import { HologramStage, type ComplaintDraft } from './components/HologramStage'
import { IndicatorDrawer } from './components/IndicatorDrawer'
import { HazardsDialog } from './components/HazardsDialog'
import { ImportDialog, type ImportedRange } from './doctor/ImportDialog'
import { Intro } from './components/Intro'
import { MeasureDialog } from './components/MeasureDialog'
import { RegionPanel } from './components/RegionPanel'
import { ResetConfirm } from './components/ResetConfirm'
import { SourcesDialog } from './components/SourcesDialog'
import { TodoCard } from './components/TodoCard'
import { ToolsMenu } from './components/ToolsMenu'
import { TourToast } from './components/TourToast'
import { TopBar, type LoggedAlert } from './components/TopBar'
import { VitalCard, formatValue } from './components/VitalCard'
import { INDICATORS, MAIN_INDICATORS, worse, type IndicatorId, type Status } from './core/catalog'
import { CREW } from './core/crew'
import type { Finding, Side, Symptom } from './core/model'
import type { ScenarioId } from './core/scenarios'
import type { LayerId, StructureRef } from './data/anatomy'
import { tourFor } from './data/content'
import { useHealth, useQuery } from './data/health'
import { REGION_ORDER } from './data/regions'
import type { RegionId, Vital } from './data/types'
import { CoachCard } from './sport/CoachCard'
import { ProgramCard } from './sport/ProgramCard'
import { TrainerStage } from './sport/TrainerStage'
import { CheckinDialog } from './mind/CheckinDialog'
import { CheckinsCard } from './mind/CheckinsCard'
import { DoctorContactSheet } from './mind/DoctorContact'
import { EmergencyDock } from './mind/CrewAssist'
import { EmergencyDialog } from './mind/EmergencyDialog'
import { useEntryCheckin } from './mind/checkinPrompt'
import { MindActionsCard } from './mind/MindActionsCard'
import { SupportLibraryCard } from './mind/SupportLibraryCard'
import { EnvironmentCard } from './doctor/EnvironmentCard'
import { ExplorerCard } from './doctor/ExplorerCard'
import { HistoryCard } from './doctor/HistoryCard'
import { LabsCard } from './doctor/LabsCard'
import { ReportCard } from './doctor/ReportCard'
import { resolve, useI18n } from './i18n'
import type { StructureQuestion } from './lib/assistant'
import { playAlert } from './lib/audio'
import { focusExplorer } from './lib/explorerFocus'
import { runCommand, useAppCommands, type AppCommandType } from './lib/appCommands'
import { openCrewAssist, openDoctorContact } from './lib/emergencyFlow'
import { openHazards } from './lib/hazardsDialog'
import { openImport } from './lib/importDialog'
import { resetTrainer, setTrainer } from './sport/trainerStore'
import { isLiveIndicator } from './lib/indicatorColors'
import { beginInteraction, useInteraction } from './lib/interaction'
import { placeRing, removeRing, spotlightFor } from './lib/tourSpotlight'
import { DOCTOR_PAGE, homePage, isStandardPage, MAIN_PAGE, ToolVisibilityContext, useDashboardLayout, useToolVisibility, visibleAnywhere, type ToolId, type VitalTool } from './lib/layout'
import { usePrefersReducedMotion, useSettings } from './lib/settings'
import { ALERT_META } from './lib/status'

const INTRO_KEY = 'vitalis.introSeen'

/** Uyarıdaki "Bölgeyi aç" yalnızca bilgi kartı arayüzdeyken görünür (kart sonradan gizlenirse de güncellenir) */
function GatedAlertToast(props: ComponentProps<typeof AlertToast>) {
  const visible = useToolVisibility()
  return <AlertToast {...props} onOpen={visible.panel ? props.onOpen : undefined} />
}
type IntroState = 'playing' | 'opening' | 'done'

export default function App() {
  const { settings } = useSettings()
  const { lang, t } = useI18n()
  const reducedMotion = usePrefersReducedMotion()
  const health = useHealth()
  const { snapshot, astronaut, canEdit, profile, mutate } = health

  /* Açılış her sayfa yenilemede değil, oturumda bir kez oynar. ?intro ile zorlanabilir. */
  const [intro, setIntro] = useState<IntroState>(() =>
    new URLSearchParams(location.search).has('intro') || !sessionStorage.getItem(INTRO_KEY) ? 'playing' : 'done',
  )
  const playedIntro = useRef(intro === 'playing')
  /** Açılış animasyonu tamamen bitti mi (açılış atlandıysa baştan biter) */
  const [revealSettled, setRevealSettled] = useState(intro !== 'playing')

  const [selected, setSelected] = useState<RegionId | null>(null)
  const [exploded, setExploded] = useState(false)
  /** Katmanlara ayrılmış görünümde öne getirilen katman; null ise kas ve iskelet yan yana */
  const [focusLayer, setFocusLayer] = useState<LayerId | null>(null)
  const [selectedStructure, setSelectedStructure] = useState<StructureRef | null>(null)
  /** Rahatsızlık bildirme modu: kas ve iskelet sistemi açılır, seçilen kaslar ya da kemikler için asistana sorulur */
  const [complaint, setComplaint] = useState(false)
  const [alerts, setAlerts] = useState<LoggedAlert[]>([])
  const [unread, setUnread] = useState(0)
  /** Uygulama kapalıyken ya da açılış sürerken oluşmuş, henüz görülmemiş uyarılar (zilin altındaki kutu için) */
  const [awayAlerts, setAwayAlerts] = useState(0)
  const [buzzKey, setBuzzKey] = useState(0)
  const [glow, setGlow] = useState<{ key: number; color: string } | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [drawer, setDrawer] = useState<IndicatorId | null>(null)
  const [measureOpen, setMeasureOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  /* Düzenlenebilir arayüz: bölümlerin görünürlüğü, yeri ve sabitlenmesi tarayıcıda saklanır */
  const { layout, active: activeProfile, customized, migrated, setActive: setProfile, reset: resetLayout, showAll, hideAll, restore, setVisible, togglePin, commit } = useDashboardLayout()
  /** Bir bölüm herhangi bir sayfada görünüyor mu (uyarılar ve bildirimler için) */
  const visibleAny = useMemo(() => visibleAnywhere(layout), [layout])
  const [menuOpen, setMenuOpen] = useState(false)
  /** O an görünen sayfa; açılışta ana sayfa */
  const [activePage, setActivePage] = useState(MAIN_PAGE)
  const activePageRef = useRef(activePage)
  useEffect(() => {
    activePageRef.current = activePage
  }, [activePage])
  /** Düzeni sıfırlama onayı (roket efektli pencere) */
  const [confirmReset, setConfirmReset] = useState(false)
  /** Sabitleme düğmesinin yanıp sönme sayaçları; anahtar "sayfa:bölüm" (aynı bölüm birden fazla sayfada olabilir) */
  const [blink, setBlink] = useState<Record<string, number>>({})
  /** Menüden yeni gösterilen bölüm: ekrana kaydırılır ve sabitleme düğmesi dikkat çeker */
  const [revealTool, setRevealTool] = useState<{ id: ToolId; page: number; nonce: number } | null>(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  /** Rehber tur menünün açık olup olmadığını bilmek için (adım geçişlerinde okunur) */
  const menuOpenRef = useRef(menuOpen)
  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])
  const bumpBlink = useCallback((page: number, id: ToolId) => setBlink((b) => ({ ...b, [`${page}:${id}`]: (b[`${page}:${id}`] ?? 0) + 1 })), [])

  /* Kayıtlı düzen eski bir sürümden geldiyse bir kez bildirilir */
  useEffect(() => {
    if (!migrated) return
    const timer = setTimeout(() => toast(t.layout.migrated, { duration: 7000 }), 1500)
    return () => clearTimeout(timer)
    // yalnızca açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrated])

  /* Hologram bölgelerinin durumu: bölgeye bağlı uyarılar ve çözülmemiş şikayetler */
  const statuses = useMemo(() => {
    const out = Object.fromEntries(REGION_ORDER.map((r) => [r, 'normal'])) as Record<RegionId, Status>
    for (const f of snapshot?.findings ?? []) {
      if (!f.region || f.region === 'tum' || f.level === 'bilgi') continue
      out[f.region] = worse(out[f.region], f.level)
    }
    for (const c of snapshot?.activeComplaints ?? []) {
      // Kırık ya da çatlak şüphesi şiddetten bağımsız olarak kritiktir
      const suspect = c.symptom === 'fracture' || c.symptom === 'crack'
      out[c.region] = worse(out[c.region], suspect || c.severity >= 8 ? 'kritik' : c.severity >= 3 ? 'dikkat' : 'normal')
    }
    return out
  }, [snapshot])

  const labelOf = useCallback((id: ToolId) => ((MAIN_INDICATORS as readonly string[]).includes(id) ? resolve(INDICATORS[id as VitalTool].name, lang) : t.tools[id as keyof typeof t.tools]), [t, lang])

  /** Menüdeki göz, o an açık olan sayfada bölümü gösterir ya da gizler */
  const toggleTool = useCallback(
    (id: ToolId) => {
      const show = !layout.pages[activePage].visible[id]
      setVisible(activePage, id, show)
      if (show) setRevealTool({ id, page: activePage, nonce: Date.now() })
    },
    [layout.pages, setVisible, activePage],
  )

  /** Bölümün X düğmesinden kaldırılması (yalnızca o sayfadaki kopya); menüdeki göz de kendiliğinden söner */
  const removeTool = useCallback((page: number, id: ToolId) => setVisible(page, id, false), [setVisible])

  /* Hologram hiçbir sayfada kalmayınca (menüden, profil değişince ya da sıfırlamada) ona bağlı katman görünümü de kapanır */
  const hologramVisible = visibleAny.hologram
  useEffect(() => {
    if (hologramVisible) return
    setExploded(false)
    setFocusLayer(null)
    setSelectedStructure(null)
    setComplaint(false)
  }, [hologramVisible])

  /** Bilgi kartı başka bir sayfadaysa, bölge açılırken o sayfaya geçilir (uyarı ve bildirimlerden) */
  const panelPageRef = useRef<number | null>(null)
  useEffect(() => {
    const pages = layout.pages.map((pl, i) => (pl.visible.panel ? i : -1)).filter((i) => i >= 0)
    panelPageRef.current = pages.includes(activePage) ? activePage : (pages[0] ?? null)
  }, [layout.pages, activePage])
  const showPanelPage = useCallback(() => {
    if (panelPageRef.current !== null) setActivePage(panelPageRef.current)
  }, [])

  /** Mesaj bildiriminden: rapor ve mesaj kartının bulunduğu sayfaya geçilir (kart hiçbir sayfada yoksa sağlık kayıtları sayfasına eklenir) */
  const openMessagesPage = useCallback(() => {
    setChatOpen(false)
    const page = layout.pages.findIndex((p) => p.visible.report)
    if (page >= 0) return setActivePage(page)
    setVisible(DOCTOR_PAGE, 'report', true)
    setActivePage(DOCTOR_PAGE)
  }, [layout.pages, setVisible])

  /**
   * Gösterge kartındaki mini grafikten: gösterge gezgininin bulunduğu sayfaya geçilir ve gezgin o göstergeyi aynı
   * aralıkta (anlıkta gün, günlükte hafta) gösterir. Gezgin hiçbir sayfada yoksa sağlık kayıtları sayfasına eklenir.
   */
  const openExplorer = useCallback(
    (id: IndicatorId) => {
      focusExplorer({ id, period: isLiveIndicator(id) ? 'day' : 'week' })
      const page = layout.pages.findIndex((p) => p.visible.explorer)
      if (page >= 0) return setActivePage(page)
      setVisible(DOCTOR_PAGE, 'explorer', true)
      setActivePage(DOCTOR_PAGE)
    },
    [layout.pages, setVisible],
  )

  /** İçe aktarmadan sonra: gezgin o göstergeye ve verinin kapsadığı günlere geçer */
  const showImported = useCallback(
    (r: ImportedRange) => {
      focusExplorer({ id: r.indicator, period: 'custom', range: [r.from, r.to] })
      const page = layout.pages.findIndex((p) => p.visible.explorer)
      if (page >= 0) return setActivePage(page)
      setVisible(DOCTOR_PAGE, 'explorer', true)
      setActivePage(DOCTOR_PAGE)
    },
    [layout.pages, setVisible],
  )

  /** Etkin profili ilk haline döndürür; bildirimden geri alınabilir */
  const onResetLayout = useCallback(() => {
    const { index, previous } = resetLayout()
    const duration = 6000
    toast.custom(
      (id) => <ActionToast message={t.layout.resetDone(index + 1)} actionLabel={t.layout.undo} durationMs={duration} onAction={() => restore(index, previous)} onDismiss={() => toast.dismiss(id)} />,
      // Kapanmayı bildirimin kendi sayacı yapar; kütüphane üzerine gelince süreyi durdurmasın
      { duration: Infinity },
    )
  }, [resetLayout, restore, t])

  /** O an açık olan sayfaya kendi bölümlerini standart yerleşimle getirir; bildirimden geri alınabilir */
  const onAddAll = useCallback(() => {
    const page = activePage
    const { index, previous } = showAll(page)
    toast.custom(
      (id) => <ActionToast message={t.layout.addAllDone(t.layout.pageNames[page])} actionLabel={t.layout.undo} durationMs={6000} onAction={() => restore(index, previous)} onDismiss={() => toast.dismiss(id)} />,
      { duration: Infinity },
    )
  }, [activePage, showAll, restore, t])

  /** O an açık olan sayfadaki bütün bölümleri kaldırır; bildirimden geri alınabilir */
  const onRemoveAll = useCallback(() => {
    const page = activePage
    const { index, previous } = hideAll(page)
    toast.custom(
      (id) => <ActionToast message={t.layout.removeAllDone(t.layout.pageNames[page])} actionLabel={t.layout.undo} durationMs={6000} onAction={() => restore(index, previous)} onDismiss={() => toast.dismiss(id)} />,
      { duration: Infinity },
    )
  }, [activePage, hideAll, restore, t])

  useEffect(() => {
    if (!revealTool) return
    // Izgara yüksekliği 200 ms'de büyür; kaydırma ondan sonra yapılır ki sayfa yeni bölüme kadar inebilsin
    const timer = setTimeout(() => {
      document.querySelector(`[data-page="${revealTool.page}"] [data-tool="${revealTool.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
      bumpBlink(revealTool.page, revealTool.id)
    }, 260)
    return () => clearTimeout(timer)
  }, [revealTool, reducedMotion, bumpBlink])

  const openRegion = useCallback((id: RegionId | null) => {
    setSelected(id)
    setSelectedStructure(null)
  }, [])
  const openStructure = useCallback((ref: StructureRef) => {
    setSelectedStructure(ref)
    setSelected(null)
  }, [])
  const clearStructure = useCallback(() => setSelectedStructure(null), [])
  const toggleExplode = useCallback(() => {
    setExploded((e) => !e)
    setFocusLayer(null)
    setSelectedStructure(null)
    setComplaint(false)
  }, [])
  const changeFocus = useCallback((layer: LayerId | null) => {
    setFocusLayer(layer)
    // Odak değişince başka katmandaki seçim kapanır (rahatsızlık bildirirken bu, kas ile kemik arasında geçiştir)
    setSelectedStructure((s) => (s && layer && s.layer !== layer ? null : s))
  }, [])
  /**
   * Rahatsızlık bildir: kas ve iskelet sistemi yan yana açılır; kişi birine tıklayarak o türle devam eder.
   * Mod kapanınca (düğmeyle ya da karttaki X ile) seçim temizlenir ve hologram görünümüne dönülür.
   */
  const toggleComplaint = useCallback(() => {
    setSelectedStructure(null)
    setFocusLayer(null)
    if (complaint) {
      setComplaint(false)
      setExploded(false)
      return
    }
    setComplaint(true)
    setExploded(true)
    setSelected(null)
  }, [complaint])

  /**
   * Yeni bir uyarı: bildirim listesine eklenir, sesi ve görsel titreşimi çalar, köşede ayrıntısıyla görünür.
   * Uyarılar analizden gelir (gerçek ölçüm de demo senaryosu da aynı yoldan geçer).
   * quiet: uygulama kapalıyken ya da açılış ekranı sürerken oluşmuş uyarı; bildirim açılmaz, ses çalmaz, yalnızca
   * okunmamış olarak listeye girer (açılış bitince zilin altında haber verilir).
   */
  const announce = useCallback(
    (f: Finding, quiet = false) => {
      setAlerts((list) => [{ ...f, at: Date.now() }, ...list].slice(0, 30))
      if (quiet) {
        // Gün içi bilgi notları (su, egzersiz) okunmamış sayılmaz; yalnızca dikkat ve kritik uyarılar haber verilir
        if (f.level !== 'bilgi') {
          setUnread((u) => u + 1)
          setAwayAlerts((n) => n + 1)
        }
        return
      }
      setUnread((u) => u + 1)
      if (settings.sound) playAlert(f.level)
      // Bilgi seviyesinde titreşim yok: kullanıcı uyarılara alışmasın
      const shake = settings.vibration && f.level !== 'bilgi'
      if (shake) {
        setBuzzKey((k) => k + 1)
        setGlow({ key: Date.now(), color: ALERT_META[f.level].hex })
        // Tarayıcı, kullanıcı sayfaya hiç dokunmadan titreşime izin vermez (açılıştaki uyarılarda konsola hata yazar)
        if (navigator.userActivation?.hasBeenActive ?? true) navigator.vibrate?.(f.level === 'kritik' ? [180, 80, 180, 80, 180] : [160, 90, 160])
      }
      const region = f.region && f.region !== 'tum' ? (f.region as RegionId) : null
      toast.custom(
        (id) => (
          <GatedAlertToast
            finding={f}
            vibrate={shake}
            onOpen={
              region
                ? () => {
                    openRegion(region)
                    showPanelPage()
                    toast.dismiss(id)
                  }
                : undefined
            }
            onGo={
              f.page !== MAIN_PAGE
                ? () => {
                    setActivePage(f.page)
                    toast.dismiss(id)
                  }
                : undefined
            }
            onDismiss={() => toast.dismiss(id)}
          />
        ),
        // Aynı uyarı yeniden gelirse (ör. demo düğmesine tekrar basılınca) eski bildirimin yerine geçer, üst üste yığılmaz
        { id: `alert:${f.key}`, duration: f.level === 'kritik' ? Infinity : f.level === 'dikkat' ? 9000 : 5000 },
      )
    },
    [settings.sound, settings.vibration, openRegion, showPanelPage],
  )

  /* Analizin bulduğu yeni uyarılar (astronot görünümünde) */
  const announceRef = useRef(announce)
  announceRef.current = announce
  /** Açılış animasyonu bitti mi (bitmeden gelen uyarılar sessizce kaydedilir) */
  const settledRef = useRef(revealSettled)
  useEffect(() => {
    settledRef.current = revealSettled
  }, [revealSettled])
  useEffect(
    () =>
      health.onFresh((list, initial) => {
        if (initial || !settledRef.current) list.forEach((f) => announceRef.current(f, true))
        else list.slice(0, 3).forEach((f) => announceRef.current(f))
      }),
    [health],
  )

  const triggerScenario = useCallback(
    (id: ScenarioId) => {
      if (!astronaut || !canEdit) return
      // Ayrı bir "senaryo" bildirimi gösterilmez: oluşan durum, düzeyi ve ne yapılacağıyla uyarı bildiriminde yazar
      void mutate('triggerScenario', astronaut, id)
    },
    [astronaut, canEdit, mutate],
  )
  /** Demoyu başlangıç durumuna döndürür: veriler fabrika ayarına, ekran da hologramın ilk görünümüne döner */
  const resetDemo = useCallback(() => {
    if (!canEdit) return
    void mutate('resetDemo')
    setAlerts([])
    setUnread(0)
    setAwayAlerts(0)
    setSelected(null)
    setSelectedStructure(null)
    setComplaint(false)
    setExploded(false)
    setFocusLayer(null)
    setPendingQuestion(null)
    resetTrainer()
    toast.dismiss()
    toast(t.demo.resetDone, { duration: 3500 })
  }, [canEdit, mutate, t])

  /** Demo: seçilen bölgede seçilen sorunu oluşturur (gerçek bir şikayet kaydı gibi sisteme girer) */
  const triggerRegionProblem = useCallback(
    (p: { region: RegionId; side: Side; symptom: Symptom; severity: number }) => {
      if (!astronaut || !canEdit) return
      // Ayrı onay bildirimi yok: şikayetin uyarı kutusu (kritik, dikkat ya da hafifse bilgi) tek açıklama olarak gelir
      void mutate('addComplaint', astronaut, { ...p, muscles: [], note: '', origin: 'demo' })
    },
    [astronaut, canEdit, mutate],
  )

  /** Rahatsızlık kaydı: şikayet veritabanına yazılır, spor programı buna göre ayarlanır */
  const saveComplaint = useCallback(
    async (d: ComplaintDraft) => {
      if (!astronaut || !canEdit) return
      for (const c of d.items) {
        const names = d.layer === 'bones' ? { muscles: [], bones: c.structures } : { muscles: c.structures }
        await mutate('addComplaint', astronaut, { region: c.region, side: c.side, ...names, symptom: d.symptom, severity: d.severity, note: d.note, origin: 'hologram' })
      }
      // Ayrı "kaydedildi" bildirimi yok: her şikayetin uyarı kutusu (hafifse bilgi düzeyinde) tek açıklama olarak gelir
    },
    [astronaut, canEdit, mutate],
  )

  const startTour = useCallback(() => {
    setChatOpen(false)
    setSourcesOpen(false)
    setMenuOpen(false)
    // Tur ana sayfada başlar; başka bir sayfadaysak önce oraya geçilir ve kayma bitince tur başlar
    if (activePageRef.current !== MAIN_PAGE) {
      setActivePage(MAIN_PAGE)
      /*
       * Kaymanın bitmesi beklenir; sabit bir süre yetmez: yan sayfada ağır bir bölüm (ör. ikinci hologram) yüklenirken
       * kayma gecikir. Ana sayfa ekrana gelmeden adımlar hesaplanırsa o sayfadaki adımlar atlanır.
       * Sayfa etkin ve iki karedir aynı yerdeyse kayma bitmiştir (en fazla 3 saniye beklenir).
       */
      const started = performance.now()
      let last = Number.NaN
      let still = 0
      const waitForPage = () => {
        const main = document.querySelector(`[data-page="${MAIN_PAGE}"]:not([inert])`)
        const left = main ? main.getBoundingClientRect().left : Number.NaN
        still = left >= 0 && Math.abs(left - last) < 0.5 ? still + 1 : 0
        last = left
        if (still >= 2 || performance.now() - started > 3000) startTourRef.current()
        else requestAnimationFrame(waitForPage)
      }
      requestAnimationFrame(waitForPage)
      return
    }
    /*
     * Ekranda görünen öğe: açık sayfada olmalı. Yan sayfalar kırpılarak gizlenir ama kutuları yerinde durur;
     * sağdaki sayfanın ilk kartı ekranın sağ kenarına denk gelip "ekranda" sayılırsa tur alanı ekran dışına taşar
     * ve sayfa yana kayar.
     */
    const onScreen = (el: Element) => {
      if (el.closest('[data-page][inert]')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.right > 0 && r.left < window.innerWidth
    }
    // Birden çok örneği olan adımlar ekranda en üstteki (sonra en soldaki) öğeyi gösterir
    const topmost = (selector: string) => {
      const pos = (el: Element) => el.getBoundingClientRect()
      return [...document.querySelectorAll(selector)].filter(onScreen).sort((a, b) => pos(a).top - pos(b).top || pos(a).left - pos(b).left)[0] ?? null
    }
    /*
     * "Yaşamsal değerler" adımı ekrandaki bütün göstergeleri birlikte vurgular: kartların toplam alanını kaplayan,
     * görünmez bir alan oluşturulur ve tur onu gösterir.
     */
    const vitalsZone = (): Element | null => {
      const cards = [...document.querySelectorAll('[data-vital-card]')].filter(onScreen).map((el) => el.getBoundingClientRect())
      if (!cards.length) return null
      const left = Math.min(...cards.map((r) => r.left))
      const top = Math.min(...cards.map((r) => r.top))
      const right = Math.max(...cards.map((r) => r.right))
      const bottom = Math.max(...cards.map((r) => r.bottom))
      let zone = document.getElementById('tour-vitals-zone')
      if (!zone) {
        zone = document.createElement('div')
        zone.id = 'tour-vitals-zone'
        zone.setAttribute('aria-hidden', 'true')
        document.body.appendChild(zone)
      }
      Object.assign(zone.style, { left: `${left + window.scrollX}px`, top: `${top + window.scrollY}px`, width: `${right - left}px`, height: `${bottom - top}px` })
      return zone
    }
    // İğne ve X adımları düğmenin kendisini gösterir (yuvarlak düğme: spot ışığı da daire olur)
    const MULTI: Record<string, string> = { '#tour-pin': '.tool-pin button', '#tour-remove': '.tool-remove button' }
    const findEl = (selector: string): Element | null => {
      if (selector === '#tour-vitals') return vitalsZone()
      if (MULTI[selector]) return topmost(MULTI[selector])
      // Aynı bölüm birden fazla sayfada olabilir: ekranda görünen kopya seçilir
      return [...document.querySelectorAll(selector)].find(onScreen) ?? null
    }
    /*
     * Arayüzde olmayan bölümlerin adımları atlanır. Öğeler adım anında yeniden bulunur: turun başında yakalanan
     * bir öğe tur sırasında yeniden çizilirse kopuk kalır ve kutu yanlış yerde (sol üstte) açılırdı.
     */
    const plan = tourFor(lang).flatMap((s): { inMenu: boolean; page: number; step: DriveStep }[] => {
      const popover = { title: s.title, description: s.description, side: s.side }
      const page = s.page ?? MAIN_PAGE
      if (s.inMenu) return [{ inMenu: true, page, step: { element: () => document.querySelector(s.element) as Element, popover } }]
      // Yan sayfaların adımları: o sayfada bölüm varsa eklenir; öğe, sayfaya geçildikten sonra bulunur
      if (page !== MAIN_PAGE) {
        const sel = `[data-page="${page}"] ${s.element}`
        return document.querySelector(sel) ? [{ inMenu: false, page, step: { element: () => document.querySelector(sel) as Element, popover } }] : []
      }
      const element = () => findEl(s.element) as Element
      return findEl(s.element) ? [{ inMenu: false, page, step: { element, popover } }] : []
    })
    /** Konumu, olası geç animasyonlardan (menü kayması, sayfa düzeni) sonra yeniden hesaplatır */
    const settle = (d: ReturnType<typeof driver>) => {
      for (const ms of [180, 420])
        setTimeout(() => {
          if (!d.isActive()) return
          d.refresh()
          placeRing(d.getActiveElement())
        }, ms)
    }
    /* Halka sayfa kayması ya da pencere boyutu değişince deliğin kenarında kalır */
    const followRing = () => placeRing(d.getActiveElement())
    window.addEventListener('scroll', followRing, true)
    window.addEventListener('resize', followRing)
    /** Adıma geçmeden önce menüyü gerektiği gibi açar ya da kapatır; menü animasyonu bitince geçer */
    const goTo = (d: ReturnType<typeof driver>, index: number) => {
      const target = plan[index]
      if (!target) return d.destroy()
      // Adım başka bir sayfadaysa önce o sayfaya kayılır, kayma bitince (520 ms) adım gösterilir
      if (target.page !== activePageRef.current) {
        setMenuOpen(target.inMenu)
        setActivePage(target.page)
        activePageRef.current = target.page
        setTimeout(() => {
          d.moveTo(index)
          settle(d)
        }, 650)
        return
      }
      if (target.inMenu === menuOpenRef.current) {
        d.moveTo(index)
        settle(d)
        return
      }
      setMenuOpen(target.inMenu)
      setTimeout(() => {
        d.moveTo(index)
        settle(d)
      }, 380)
    }
    // Tur sürerken otomatik içerik (ör. check-in sorusu) açılmaz
    const endInteraction = beginInteraction('tour')
    const d = driver({
      showProgress: true,
      popoverClass: 'vitalis-tour',
      nextBtnText: t.tour.next,
      prevBtnText: t.tour.prev,
      doneBtnText: t.tour.done,
      progressText: '{{current}} / {{total}}',
      overlayColor: '#02040a',
      overlayOpacity: 0.74,
      popoverOffset: 16,
      smoothScroll: true,
      steps: plan.map((p) => p.step),
      onHighlightStarted: (el, _step, { driver: d }) => {
        const target = el && el.id !== 'driver-dummy-element' ? el : null
        if (target) {
          const { gap, radius } = spotlightFor(target)
          d.setConfig({ ...d.getConfig(), stagePadding: gap, stageRadius: radius })
        }
        placeRing(target)
      },
      onNextClick: (_el, _step, { driver: d }) => (d.isLastStep() ? d.destroy() : goTo(d, (d.getActiveIndex() ?? 0) + 1)),
      onPrevClick: (_el, _step, { driver: d }) => goTo(d, Math.max(0, (d.getActiveIndex() ?? 0) - 1)),
      onDestroyed: () => {
        endInteraction()
        setMenuOpen(false)
        document.getElementById('tour-vitals-zone')?.remove()
        removeRing()
        window.removeEventListener('scroll', followRing, true)
        window.removeEventListener('resize', followRing)
      },
    })
    setTimeout(() => d.drive(), 120)
  }, [lang, t])

  // Öneri bildirimi açıkken dil değişirse tur yeni dilde başlasın
  const startTourRef = useRef(startTour)
  startTourRef.current = startTour

  /*
   * Sağlık Asistanı'nın düğmeleri (lib/appCommands): komutun ait olduğu bölüm hangi sayfadaysa oraya geçilir (bölüm hiçbir
   * sayfada yoksa kendi sayfasına eklenir); uygulama düzeyindeki pencereler burada açılır, bölüm içindekileri bölüm açar.
   */
  useAppCommands((cmd) => {
    const tool = COMMAND_TOOL[cmd.type]
    if (tool) {
      const page = layout.pages.findIndex((p) => p.visible[tool])
      if (page >= 0) setActivePage(page)
      else {
        // Bölüm hiçbir sayfada yoksa kendi sayfasına eklenir; yüklendikten sonra komut yeniden yayınlanır ki bölüm alsın
        setVisible(homePage(tool), tool, true)
        setActivePage(homePage(tool))
        setTimeout(() => runCommand(cmd), 400)
        return
      }
    }
    switch (cmd.type) {
      case 'page':
        return setActivePage(cmd.page)
      case 'startComplaint':
        if (!complaint) toggleComplaint()
        return
      case 'openDoctorContact':
        return openDoctorContact()
      case 'openCrewAssist':
        return openCrewAssist()
      case 'openIndicator':
        return setDrawer(cmd.id)
      case 'openExplorer':
        return openExplorer(cmd.id)
      case 'openMessages':
        return openMessagesPage()
      case 'openImport':
        return openImport()
      case 'openMeasure':
        return setMeasureOpen(true)
      case 'openHistory':
        return setHistoryOpen(true)
      case 'openHazards':
        return openHazards()
      case 'openSources':
        return setSourcesOpen(true)
      case 'startTour':
        return startTour()
      case 'openLayoutMenu':
        return setMenuOpen(true)
      case 'showExercise':
        return setTrainer({ exercise: cmd.exercise, playing: true, index: null })
    }
  })

  const onIntroOpen = useCallback(() => setIntro('opening'), [])
  const onIntroDone = useCallback(() => {
    setIntro('done')
    sessionStorage.setItem(INTRO_KEY, '1')
  }, [])

  /* İlk açılıştan sonra rehber tur önerisi */
  useEffect(() => {
    if (intro !== 'done' || !playedIntro.current) return
    playedIntro.current = false
    const timer = setTimeout(() => {
      toast.custom((id) => <TourToast onStart={() => startTourRef.current()} onDismiss={() => toast.dismiss(id)} />, { duration: 9000 })
    }, 900)
    return () => clearTimeout(timer)
  }, [intro])

  /** Asistanı açıp soruyu gönderir; hologramdan gelen sorularda seçilen yapı da bağlam olarak gider */
  const ask = useCallback((text: string, structure?: StructureQuestion) => {
    setChatOpen(true)
    setPendingQuestion({ text, nonce: Date.now(), structure })
  }, [])

  const replayIntro = () => {
    setSourcesOpen(false)
    playedIntro.current = false
    setRevealSettled(false)
    setIntro('playing')
  }

  /* Asistanın gördüğü yaşamsal değerler */
  const vitals: Vital[] = useMemo(
    () =>
      MAIN_INDICATORS.map((id) => {
        const s = snapshot?.indicators[id]
        return {
          id: id === 'hr' ? 'nabiz' : id === 'sleep' ? 'uyku' : id,
          label: resolve(INDICATORS[id].name, lang),
          value: s ? formatValue(id, s, lang) : '—',
          unit: resolve(INDICATORS[id].unit, lang),
          hint: '',
          status: s?.status ?? 'normal',
        }
      }),
    [snapshot, lang],
  )
  const assistantContext = useMemo(() => ({ selectedRegion: selected, vitals, lang, snapshot, page: activePage, name: astronaut ? CREW[astronaut].name : undefined }), [selected, vitals, lang, snapshot, activePage, astronaut])
  const complaints = useQuery('complaints', astronaut ? [astronaut] : null)

  /* Tüplü TV gibi açılış: arayüz ortadaki ince çizgiden genişleyerek ve beyazdan sönerek belirir */
  const revealAnim = revealSettled
    ? reducedMotion
      ? { opacity: 1 }
      : { clipPath: 'none', filter: 'none' }
    : intro === 'playing'
      ? reducedMotion
        ? { opacity: 0 }
        : { clipPath: 'inset(49.8% 0% 49.8% 0%)', filter: 'brightness(3) saturate(0.4)' }
      : reducedMotion
        ? { opacity: 1 }
        : { clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1) saturate(1)' }

  const crewList = profile.role === 'surgeon' && !profile.viewing

  /* Açılış, menü, onay pencereleri, asistan ve rahatsızlık bildirimi sürerken otomatik içerik (ör. check-in sorusu) beklemeye alınır */
  useInteraction('intro', intro !== 'done')
  useInteraction('menu', menuOpen)
  useInteraction('dialog', confirmReset || sourcesOpen)
  useInteraction('assistant', chatOpen)
  useInteraction('form', complaint)

  /*
   * Check-in formu yalnızca kişi isteyince açılır (check-in kartından). Açılışta kendiliğinden açılmaz: kullanıcı siteye
   * girerken açılan pencere istemiyor (Gökalp'in dalındaki otomatik sunum bu yüzden kapalı).
   */
  const checkin = useEntryCheckin(false)

  return (
    <ToolVisibilityContext.Provider value={visibleAny}>
      {/* Zemin yalnızca uzay fotoğrafıdır (ızgara ve renkli ortam ışığı kaldırıldı) */}
      <div className="app-backdrop relative min-h-dvh">
        <motion.div
          initial={false}
          animate={revealAnim}
          transition={revealSettled ? { duration: 0 } : { clipPath: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }, filter: { duration: 1.1, ease: 'easeOut' }, opacity: { duration: 0.5 } }}
          onAnimationComplete={() => {
            if (intro !== 'playing') setRevealSettled(true)
          }}
          inert={intro === 'playing' || menuOpen}
          // Yanlarda sayfa okları için boşluk: oklar hiçbir bölümün üstüne binmez
          className="relative mx-auto flex min-h-dvh max-w-[1832px] flex-col gap-4 p-4 sm:px-[76px] sm:py-5 lg:gap-5 lg:py-6"
        >
          <TopBar
            alerts={alerts}
            unread={unread}
            buzzKey={buzzKey}
            onOpenAlerts={() => {
              setUnread(0)
              setAwayAlerts(0)
            }}
            ready={revealSettled}
            awayAlerts={awayAlerts}
            onScenario={triggerScenario}
            onResetDemo={resetDemo}
            onRegionProblem={triggerRegionProblem}
            onStartTour={startTour}
            onOpenSources={() => setSourcesOpen(true)}
            onOpenAlert={(a) => {
              if (a.region && a.region !== 'tum') {
                openRegion(a.region as RegionId)
                showPanelPage()
              } else setActivePage(a.page)
            }}
            onOpenAssistant={() => setChatOpen(true)}
            menuOpen={menuOpen}
            onOpenMenu={() => setMenuOpen(true)}
            showMenu={!crewList}
          />
          {crewList ? (
            <CrewOverview />
          ) : (
            <>
              <ViewingBanner />
              <Dashboard
                layout={layout}
                activePage={activePage}
                onPageChange={setActivePage}
                blink={blink}
                labelOf={labelOf}
                onCommit={commit}
                onTogglePin={togglePin}
                onBlink={bumpBlink}
                onRemove={removeTool}
                onOpenMenu={() => setMenuOpen(true)}
                render={(id, page) => {
                  if (id === 'hologram')
                    return (
                      <HologramStage
                        active={page === activePage}
                        selected={selected}
                        statuses={statuses}
                        reducedMotion={reducedMotion}
                        exploded={exploded}
                        focusLayer={focusLayer}
                        selectedStructure={selectedStructure}
                        complaint={complaint}
                        canSave={canEdit}
                        onSelect={openRegion}
                        onToggleExplode={toggleExplode}
                        onToggleComplaint={toggleComplaint}
                        onFocusLayer={changeFocus}
                        onStructureSelect={openStructure}
                        onStructureClear={clearStructure}
                        onAsk={ask}
                        onSaveComplaint={saveComplaint}
                        onOpenHistory={() => setHistoryOpen(true)}
                      />
                    )
                  if (id === 'panel')
                    return (
                      <RegionPanel
                        selected={selected}
                        statuses={statuses}
                        findings={snapshot?.findings ?? []}
                        complaints={complaints ?? []}
                        snapshot={snapshot}
                        onOpenIndicator={setDrawer}
                        buzzKey={buzzKey}
                        vibration={settings.vibration}
                        exploded={exploded}
                        selectedStructure={selectedStructure}
                        onSelect={openRegion}
                        onStructureClose={() => setSelectedStructure(null)}
                        onFocusLayer={changeFocus}
                        onAsk={ask}
                      />
                    )
                  if (id === 'todo') return <TodoCard onGo={setActivePage} onMeasure={() => setMeasureOpen(true)} />
                  if (id === 'checkins') return <CheckinsCard onOpenCheckin={checkin.open} active={page === activePage} />
                  if (id === 'actions') return <MindActionsCard active={page === activePage} />
                  if (id === 'library') return <SupportLibraryCard reducedMotion={reducedMotion} active={page === activePage} />
                  if (id === 'trainer') return <TrainerStage active={page === activePage} reducedMotion={reducedMotion} />
                  if (id === 'program') return <ProgramCard />
                  if (id === 'coach') return <CoachCard onAsk={ask} onOpenChart={openExplorer} />
                  if (id === 'explorer') return <ExplorerCard />
                  if (id === 'labs') return <LabsCard />
                  if (id === 'report') return <ReportCard />
                  if (id === 'environment') return <EnvironmentCard />
                  if (id === 'history')
                    return (
                      <HistoryCard
                        onOpenHistory={() => setHistoryOpen(true)}
                        // Ana sayfaya dönüp hologramda rahatsızlık bildirmeyi açar
                        onReport={() => {
                          setActivePage(MAIN_PAGE)
                          if (!complaint) toggleComplaint()
                        }}
                      />
                    )
                  const vid = id as VitalTool
                  return <VitalCard id={vid} state={snapshot?.indicators[vid]} snapshot={snapshot} onOpen={setDrawer} onChart={openExplorer} />
                }}
              />
            </>
          )}
        </motion.div>

        <ToolsMenu
          open={menuOpen}
          layout={layout}
          activeProfile={activeProfile}
          customized={customized}
          labelOf={labelOf}
          reducedMotion={reducedMotion}
          page={activePage}
          canAddAll={!isStandardPage(layout.pages[activePage], activePage)}
          onAddAll={onAddAll}
          canRemoveAll={Object.values(layout.pages[activePage].visible).some(Boolean)}
          onRemoveAll={onRemoveAll}
          onSelectPage={setActivePage}
          onToggle={toggleTool}
          onSelectProfile={setProfile}
          onReset={() => setConfirmReset(true)}
          onClose={closeMenu}
        />
        <ResetConfirm
          open={confirmReset}
          profile={activeProfile}
          reducedMotion={reducedMotion}
          onConfirm={() => {
            setConfirmReset(false)
            onResetLayout()
          }}
          onCancel={() => setConfirmReset(false)}
        />
        <IndicatorDrawer id={drawer} onClose={() => setDrawer(null)} />
        <HazardsDialog onOpenIndicator={setDrawer} />
        <ImportDialog onDone={showImported} />
        <MeasureDialog open={measureOpen} onClose={() => setMeasureOpen(false)} />
        <ComplaintHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} context={assistantContext} pending={pendingQuestion} onGoPage={(p) => { setActivePage(p); setChatOpen(false) }} />
        <CheckinDialog windowKey={checkin.key} onClose={checkin.close} />
        <DoctorContactSheet onOpenMessages={openMessagesPage} />
        <EmergencyDialog onOpenMessages={openMessagesPage} />
        <SourcesDialog open={sourcesOpen} onClose={() => setSourcesOpen(false)} onReplayIntro={replayIntro} />

        {/* Ekran kenarında yanıp sönen uyarı ışığı (ekranın kendisi sallanmaz) */}
        {glow && (
          <div key={glow.key} className="edge-glow pointer-events-none fixed inset-0 z-[45]" style={{ boxShadow: `inset 0 0 0 2px ${glow.color}aa, inset 0 0 90px 10px ${glow.color}40` }} aria-hidden />
        )}

        {/* Hekim ile astronot arasındaki rapor ve mesajlar: sağ altta, sağdan kayarak */}
        <MessageNotifier onOpen={openMessagesPage} reducedMotion={reducedMotion} paused={!revealSettled}>
          <EmergencyDock />
        </MessageNotifier>

        <Toaster
          position="top-right"
          offset={{ top: 84, right: 20 }}
          mobileOffset={{ top: 76, right: 16, left: 16 }}
          toastOptions={{
            classNames: {
              toast: '!bg-raised !border !border-line-strong !text-ink !rounded-2xl !font-sans !shadow-2xl',
              description: '!text-ink-muted',
              actionButton: '!bg-holo !text-void !font-semibold !rounded-lg',
              cancelButton: '!bg-transparent !text-ink-muted !border !border-line !rounded-lg',
            },
          }}
        />

        {intro !== 'done' && <Intro reducedMotion={reducedMotion} onOpen={onIntroOpen} onDone={onIntroDone} />}
      </div>
    </ToolVisibilityContext.Provider>
  )
}

/** Asistan komutunun ait olduğu bölüm: App önce o bölümün bulunduğu sayfaya geçer */
const COMMAND_TOOL: Partial<Record<AppCommandType, ToolId>> = {
  startComplaint: 'hologram',
  openCheckin: 'checkins',
  openRecords: 'checkins',
  openJournal: 'library',
  openLibrary: 'library',
  openMindGames: 'actions',
  openReaction: 'actions',
  openLabs: 'labs',
  openReport: 'report',
  openSchedule: 'todo',
  openHazards: 'environment',
  showExercise: 'trainer',
}

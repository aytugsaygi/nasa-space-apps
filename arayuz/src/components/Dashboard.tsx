import { ChevronLeft, ChevronRight, LayoutGrid, Move, Pin, PinOff, X } from 'lucide-react'
import { cloneElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react'
import { getCompactor, ReactGridLayout, useContainerWidth } from 'react-grid-layout'
import { useI18n } from '../i18n'
import { setToolDragging } from '../lib/dragState'
import {
  breakpointFor,
  COLS,
  LG_MIN_ROW,
  LG_ROWS,
  MAIN_PAGE,
  MARGIN,
  PAGE_COUNT,
  SMALL_ROW,
  TOOL_IDS,
  VITAL_TOOLS,
  type Bp,
  type DashboardLayout,
  type LayoutItem,
  type PageLayout,
  type ToolId,
} from '../lib/layout'
import { ToolInfoButton } from './ToolInfoButton'
import { VitalInfo } from './VitalCard'
import { Tooltip } from './Tooltip'

/**
 * Bölümler serbestçe yerleşir ve yalnızca boş alana bırakılabilir.
 * Böylece sürüklenen bölüm hiçbir zaman başka bir bölümü, özellikle sabitlenmiş olanı, yerinden oynatmaz.
 */
const COMPACTOR = getCompactor(null, false, true)
/** bounded: sürüklenen bölüm matrisin (ızgara kabının) dışına çıkamaz */
const DRAG = { enabled: true, bounded: true, cancel: '.tool-pin, .tool-remove', threshold: 4 }
const NO_RESIZE = { enabled: false }
/** Sayfanın alt kenar boşluğu (App'teki lg:p-6) */
const PAGE_BOTTOM = 24
/** Bırakılan bölüm yerine oturana kadar (CSS geçişi 220 ms) 3D sahne duraklatılmış kalır */
const RESUME_AFTER_DROP = 240
/** Sürüklerken imleç ekranın üst/alt kenarına bu kadar yaklaşınca sayfa kayar (dar ekranlarda); kenara yaklaştıkça hızlanır */
const EDGE_ZONE = 70
const EDGE_MAX_STEP = 18
/** Kaldırılan bölümün solarak kaybolma süresi (CSS ile aynı) */
const LEAVE_MS = 320
/** X'in basılı tutulma süresi (halka animasyonuyla aynı) */
const HOLD_MS = 1000

interface Props {
  layout: DashboardLayout
  /** O an görünen sayfa (0: sol, 1: ana, 2: sağ) */
  activePage: number
  onPageChange: (page: number) => void
  /** Sabitleme düğmesinin yanıp sönme sayaçları ("sayfa:bölüm" anahtarıyla): sayaç artınca düğme dikkat çeker */
  blink: Record<string, number>
  labelOf: (id: ToolId) => string
  /** Bölümün içeriği; aynı bölüm birden fazla sayfada bulunabilir */
  render: (id: ToolId, page: number) => ReactNode
  onCommit: (page: number, bp: Bp, items: readonly LayoutItem[]) => void
  onTogglePin: (page: number, id: ToolId) => void
  onBlink: (page: number, id: ToolId) => void
  onRemove: (page: number, id: ToolId) => void
  onOpenMenu: () => void
}

/**
 * Düzenlenebilir arayüz: yan yana üç sayfa. Ekranın orta solundaki ve sağındaki oklarla sayfa değişir;
 * her sayfanın kendi ızgarası ve bölümleri vardır. Sayfa dikey olarak kaymaz, matris ekrana sığar.
 */
export function Dashboard({ layout, activePage, onPageChange, blink, labelOf, render, onCommit, onTogglePin, onBlink, onRemove, onOpenMenu }: Props) {
  const { t } = useI18n()
  const { width, containerRef, mounted } = useContainerWidth()
  const viewport = useViewport()
  const bp = breakpointFor(viewport.w)
  /** Izgaranın ekranda kullanabileceği yükseklik: üst bardan sayfanın alt kenar boşluğuna kadar */
  const [availH, setAvailH] = useState(() => window.innerHeight - 160)
  const rowHeight = bp === 'lg' ? Math.max(LG_MIN_ROW, Math.floor(((availH - (LG_ROWS - 1) * MARGIN.lg[1]) / LG_ROWS) * 100) / 100) : SMALL_ROW

  /* Kullanılabilir yükseklik ölçülür; geniş ekranda varsayılan düzen bu yüksekliği tam doldurur */
  useLayoutEffect(() => {
    const measure = () => {
      const el = containerRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      setAvailH(Math.max(200, window.innerHeight - top - PAGE_BOTTOM))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [bp, width, containerRef])

  const idsByPage = useMemo(() => layout.pages.map((pl) => TOOL_IDS.filter((id) => pl.visible[id])), [layout.pages])
  const totalVisible = idsByPage.reduce((n, ids) => n + ids.length, 0)

  const pageNames = t.layout.pageNames

  return (
    <main ref={containerRef} className="page-viewport relative flex min-w-0 flex-1 flex-col">
      {mounted && (
        <div className="page-track flex flex-1 items-stretch" style={{ transform: `translateX(calc(${-activePage} * (100% + var(--page-gap))))` }}>
          {idsByPage.map((ids, p) => (
            <section
              key={p}
              data-page={p}
              // Açık olmayan sayfa bir ekran yüksekliğine kırpılır: sayfalar yan yana durduğu için en uzun sayfa (dar ekranda
              // sağlık kayıtları) kısa sayfanın altında boş kaydırma alanı bırakmasın
              className={`page flex w-full shrink-0 flex-col ${p === activePage ? '' : 'overflow-hidden'}`}
              style={{ minHeight: availH, maxHeight: p === activePage ? undefined : availH }}
              aria-label={pageNames[p]}
              aria-hidden={p !== activePage || undefined}
              inert={p !== activePage}
            >
              <PageGrid
                page={p}
                ids={ids}
                pageLayout={layout.pages[p]}
                bp={bp}
                width={width}
                rowHeight={rowHeight}
                availH={availH}
                viewportH={viewport.h}
                blink={blink}
                labelOf={labelOf}
                render={render}
                onCommit={onCommit}
                onTogglePin={onTogglePin}
                onBlink={onBlink}
                onRemove={onRemove}
                onOpenMenu={onOpenMenu}
                emptyTitle={p === MAIN_PAGE && totalVisible === 0 ? t.layout.empty : t.layout.pageEmpty(pageNames[p])}
                emptyHint={p === MAIN_PAGE && totalVisible === 0 ? t.layout.emptyHint : t.layout.pageEmptyHint}
              />
            </section>
          ))}
        </div>
      )}

      {/* Sayfa okları: ekranın orta solunda ve sağında, belirgin */}
      {mounted && (
        <>
          {activePage > 0 && <PageArrow dir="prev" target={activePage - 1} active={activePage} names={pageNames} label={t.layout.goToPage(pageNames[activePage - 1])} onGo={onPageChange} />}
          {activePage < PAGE_COUNT - 1 && (
            <PageArrow dir="next" target={activePage + 1} active={activePage} names={pageNames} label={t.layout.goToPage(pageNames[activePage + 1])} onGo={onPageChange} />
          )}
        </>
      )}
    </main>
  )
}

/** Sayfa oku ve altında hangi sayfada olunduğunu gösteren noktalar */
function PageArrow({
  dir,
  target,
  active,
  names,
  label,
  onGo,
}: {
  dir: 'prev' | 'next'
  target: number
  active: number
  names: string[]
  label: string
  onGo: (page: number) => void
}) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <div className={`page-arrow-wrap ${dir === 'prev' ? 'page-arrow-prev' : 'page-arrow-next'}`}>
      <Tooltip label={names[target]} side="bottom">
        <button id={dir === 'next' ? 'page-next' : 'page-prev'} type="button" onClick={() => onGo(target)} aria-label={label} className="page-arrow">
          <Icon size={30} strokeWidth={2.4} aria-hidden />
        </button>
      </Tooltip>
      <span className="page-dots" aria-hidden>
        {names.map((n, i) => (
          <span key={n} data-active={i === active || undefined} />
        ))}
      </span>
    </div>
  )
}

/** Bir sayfanın ızgarası: bölümler, sürükleme matrisi ve sayfa boşsa bilgi kartı */
function PageGrid({
  page,
  ids,
  pageLayout,
  bp,
  width,
  rowHeight,
  availH,
  viewportH,
  blink,
  labelOf,
  render,
  onCommit,
  onTogglePin,
  onBlink,
  onRemove,
  onOpenMenu,
  emptyTitle,
  emptyHint,
}: {
  page: number
  ids: ToolId[]
  pageLayout: PageLayout
  bp: Bp
  width: number
  rowHeight: number
  availH: number
  viewportH: number
  blink: Record<string, number>
  labelOf: (id: ToolId) => string
  render: (id: ToolId, page: number) => ReactNode
  onCommit: (page: number, bp: Bp, items: readonly LayoutItem[]) => void
  onTogglePin: (page: number, id: ToolId) => void
  onBlink: (page: number, id: ToolId) => void
  onRemove: (page: number, id: ToolId) => void
  onOpenMenu: () => void
  emptyTitle: string
  emptyHint: string
}) {
  const { t } = useI18n()

  /* Sürükleme sırasında 3D sahne duraklar; ekran kartı yalnızca hareketi çizer */
  const resumeTimer = useRef(0)
  /** Sürükleme boyunca ızgara genişliği sabit tutulur: bu sırada kaydırma çubuğu belirse bile bölümler yeniden dizilmez */
  const [frozenWidth, setFrozenWidth] = useState<number | null>(null)
  const gridWidth = frozenWidth ?? width
  const dragging = frozenWidth !== null
  /** Bölümün başka bir bölümün üstüne getirildiğini gösteren kırmızı alan; React çizimi olmadan, doğrudan güncellenir */
  const blockedRef = useRef<HTMLDivElement>(null)
  useEffect(
    () => () => {
      clearTimeout(resumeTimer.current)
      setToolDragging(false)
    },
    [],
  )

  const gridLayout = useMemo(
    () => ids.map((id) => ({ i: id, ...pageLayout.positions[bp][id], static: pageLayout.pinned[id] })),
    [ids, pageLayout.positions, pageLayout.pinned, bp],
  )
  /*
   * Matris: sürüklerken arkada görünen nokta düzeni. Ekrana sığdığı kadar satırdır (sayfa dikey kaymaz);
   * düzen ekrandan uzunsa (dar ekranlar) düzen kadar uzar. Bölümler yalnızca bu sınırlar içine bırakılabilir.
   */
  const cols = COLS[bp]
  const [mx, my] = MARGIN[bp]
  const colW = (gridWidth - mx * (cols - 1)) / cols
  const unitX = colW + mx
  const unitY = rowHeight + my
  const contentRows = gridLayout.reduce((m, it) => Math.max(m, it.y + it.h), 0)
  const fitRows = Math.max(1, Math.floor((availH + my) / unitY))
  const matrixRows = Math.max(contentRows, fitRows)
  const matrixHeight = matrixRows * rowHeight + (matrixRows - 1) * my

  const gridConfig = useMemo(
    () => ({ cols, rowHeight, margin: MARGIN[bp], containerPadding: [0, 0] as [number, number], maxRows: matrixRows }),
    [cols, bp, rowHeight, matrixRows],
  )

  /*
   * Akıcı sürükleme: kütüphane sürüklenen kartı yalnızca hücre konumu değişince yeniden çiziyor
   * (kart hücreden hücreye zıplıyor, dolu alanın üstünde donuyordu). Her harekette yalnızca sürüklenen
   * kartın öğesi yenilenir; diğer bölümler ve kartın içeriği yeniden çizilmez.
   */
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragTick, setDragTick] = useState(0)

  /*
   * Kenar kaydırması (düzen ekrandan uzunsa): imleç ekranın üst ya da alt kenarına yaklaşınca sayfa kayar.
   * Kaydırma sonrası aynı konumda bir fare hareketi bildirilir ki kart imlecin altında kalsın.
   */
  const stopAutoScroll = useRef<(() => void) | null>(null)
  const startAutoScroll = (e: unknown) => {
    stopAutoScroll.current?.()
    const ev = e as { clientX?: number; clientY?: number; touches?: ArrayLike<{ clientX: number; clientY: number }> } | null
    const point = ev?.touches?.[0] ?? ev
    const st = { x: point?.clientX ?? window.innerWidth / 2, y: point?.clientY ?? viewportH / 2, mouse: !ev?.touches, raf: 0 }
    const onMove = (m: globalThis.PointerEvent) => {
      st.x = m.clientX
      st.y = m.clientY
      st.mouse = m.pointerType === 'mouse'
    }
    const tick = () => {
      const h = window.innerHeight
      let dy = 0
      if (st.y > h - EDGE_ZONE) dy = Math.ceil(((st.y - (h - EDGE_ZONE)) / EDGE_ZONE) * EDGE_MAX_STEP)
      else if (st.y < EDGE_ZONE) dy = -Math.ceil(((EDGE_ZONE - st.y) / EDGE_ZONE) * EDGE_MAX_STEP)
      if (dy) {
        const before = window.scrollY
        window.scrollBy(0, Math.max(-EDGE_MAX_STEP, Math.min(EDGE_MAX_STEP, dy)))
        if (st.mouse && window.scrollY !== before) {
          document.dispatchEvent(new MouseEvent('mousemove', { clientX: st.x, clientY: st.y, bubbles: true }))
        }
      }
      st.raf = requestAnimationFrame(tick)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    st.raf = requestAnimationFrame(tick)
    stopAutoScroll.current = () => {
      cancelAnimationFrame(st.raf)
      window.removeEventListener('pointermove', onMove)
      stopAutoScroll.current = null
    }
  }
  useEffect(() => () => stopAutoScroll.current?.(), [])

  const onDragStart = (_layout: unknown, _old: unknown, item: { i: string } | null | undefined, _ph: unknown, e: unknown) => {
    clearTimeout(resumeTimer.current)
    setFrozenWidth(width)
    setDragId(item?.i ?? null)
    setToolDragging(true)
    startAutoScroll(e)
  }
  /* Bölümün şu an üzerinde durduğu hücreler başka bir bölümle çakışıyorsa kırmızı alan ve uyarı gösterilir */
  const onDrag = (_layout: unknown, _old: unknown, item: { i: string; w: number; h: number } | null | undefined, _ph: unknown, _e: unknown, node: HTMLElement | null | undefined) => {
    setDragTick((n) => n + 1)
    const el = blockedRef.current
    if (!el || !item || !node) return
    const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(node.style.transform)
    if (!m) return
    const x = Math.min(Math.max(0, Math.round(Number(m[1]) / unitX)), cols - item.w)
    const y = Math.min(Math.max(0, Math.round(Number(m[2]) / unitY)), matrixRows - item.h)
    const target = { x, y, w: item.w, h: item.h }
    const blocked = gridLayout.some((o) => o.i !== item.i && overlaps(target, o))
    node.toggleAttribute('data-blocked', blocked)
    el.toggleAttribute('data-show', blocked)
    if (!blocked) return
    el.style.transform = `translate(${x * unitX}px, ${y * unitY}px)`
    el.style.width = `${item.w * colW + (item.w - 1) * mx}px`
    el.style.height = `${item.h * rowHeight + (item.h - 1) * my}px`
  }
  const onDragStop = (_layout: unknown, _old: unknown, _item: unknown, _ph: unknown, _e: unknown, node: HTMLElement | null | undefined) => {
    node?.removeAttribute('data-blocked')
    blockedRef.current?.removeAttribute('data-show')
    setFrozenWidth(null)
    setDragId(null)
    stopAutoScroll.current?.()
    clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setToolDragging(false), RESUME_AFTER_DROP)
  }

  /* Bölüm öğeleri yalnızca içerikleri değişince yeniden oluşturulur (sürüklerken her harekette değil) */
  const items = useMemo(
    () =>
      ids.map((id, i) => (
        <div
          key={id}
          className="tool-item group/tool"
          data-tool={id}
          data-pinned={pageLayout.pinned[id] || undefined}
          // Her bölüm salınımın farklı bir anından başlar (hepsi birlikte inip kalkmasın)
          style={{ '--float-delay': `${-((i * 1.7) % 8).toFixed(2)}s` } as CSSProperties}
        >
          <ToolFrame
            id={id}
            label={labelOf(id)}
            info={
              // Gösterge kartlarında açıklama göstergenin kendisinden (aralık, uzaydaki anlamı, kaynak); diğerlerinde toolInfo
              (VITAL_TOOLS as readonly string[]).includes(id)
                ? { what: <VitalInfo id={id as (typeof VITAL_TOOLS)[number]} />, how: t.vital.infoHow }
                : (t.toolInfo as Partial<Record<string, ToolInfo>>)[id]
            }
            pinned={pageLayout.pinned[id]}
            blink={blink[`${page}:${id}`] ?? 0}
            onTogglePin={() => onTogglePin(page, id)}
            onBlink={() => onBlink(page, id)}
            onRemove={() => onRemove(page, id)}
          >
            {render(id, page)}
          </ToolFrame>
        </div>
      )),
    [ids, page, pageLayout.pinned, blink, labelOf, render, onTogglePin, onBlink, onRemove, t],
  )

  /* Sayfa boşsa: sayfanın ortasında, yavaşça beliren bilgi kartı */
  if (ids.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <div className="empty-in panel relative flex w-full max-w-[640px] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <LayoutGrid size={28} className="text-holo" aria-hidden />
          <p className="font-display text-xl font-medium">{emptyTitle}</p>
          <p className="max-w-sm text-[16.5px] text-ink-muted">{emptyHint}</p>
          <button
            type="button"
            onClick={onOpenMenu}
            className="mt-2 flex min-h-11 items-center gap-2 rounded-xl bg-holo/10 px-4 text-sm font-medium text-holo ring-1 ring-holo/30 transition-colors hover:bg-holo/15"
          >
            {t.layout.openMenuCta}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {/*
        Matris: yalnızca sürüklerken görünür, bölümlerin arkasında kalır. Her hücre bir çerçevedir ve bölümler tam bu
        çerçevelere oturur; köşe noktaları hücreler arasındaki boşlukların kesişimidir. Katman ızgaradan yarım boşluk
        taşar ki dış sınır da boşluk ortasından geçsin.
      */}
      <svg
        className="drag-matrix pointer-events-none absolute overflow-visible"
        style={{ left: -mx / 2, top: -my / 2 }}
        width={cols * unitX}
        height={matrixRows * unitY}
        data-active={dragging || undefined}
        aria-hidden
      >
        <defs>
          {/* Hücre çerçeveleri */}
          <pattern id={`drag-matrix-cells-${page}`} width={unitX} height={unitY} patternUnits="userSpaceOnUse">
            <rect className="matrix-cell" x={mx / 2 + 0.5} y={my / 2 + 0.5} width={Math.max(0, colW - 1)} height={Math.max(0, rowHeight - 1)} rx="6" />
          </pattern>
          {/* Hücre köşeleri */}
          <pattern id={`drag-matrix-corners-${page}`} x={-unitX / 2} y={-unitY / 2} width={unitX} height={unitY} patternUnits="userSpaceOnUse">
            <circle className="matrix-dot-major" cx={unitX / 2} cy={unitY / 2} r="1.8" />
          </pattern>
        </defs>
        <rect width={cols * unitX} height={matrixRows * unitY} fill={`url(#drag-matrix-cells-${page})`} />
        <rect x="-3" y="-3" width={cols * unitX + 6} height={matrixRows * unitY + 6} fill={`url(#drag-matrix-corners-${page})`} />
        <rect className="matrix-bounds" x="1" y="1" width={cols * unitX - 2} height={matrixRows * unitY - 2} rx="24" />
      </svg>
      <div ref={blockedRef} className="drag-blocked" aria-hidden>
        <span>{t.layout.cannotDrop}</span>
      </div>
      <ReactGridLayout
        // Ekran sınıfı değişince ızgara o sınıfın kayıtlı düzeniyle baştan kurulur
        key={bp}
        width={gridWidth}
        style={{ height: matrixHeight }}
        layout={gridLayout}
        gridConfig={gridConfig}
        dragConfig={DRAG}
        resizeConfig={NO_RESIZE}
        compactor={COMPACTOR}
        onLayoutChange={(next) => onCommit(page, bp, next)}
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragStop={onDragStop}
      >
        {items.map((el: ReactElement<Record<string, unknown>>) => (el.key === dragId ? cloneElement(el, { 'data-drag-tick': dragTick }) : el))}
      </ReactGridLayout>
    </div>
  )
}

/** Pencere ölçüsü; genişlik kaydırma çubuğu dahil, CSS medya sorgularıyla aynı ölçü */
function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Bölüm açıklaması: ne olduğu ve nasıl kullanıldığı (ⓘ düğmesinde) */
type ToolInfo = { what: ReactNode; how?: readonly string[] }

function ToolFrame({
  label,
  info,
  pinned,
  blink,
  onTogglePin,
  onBlink,
  onRemove,
  children,
}: {
  id: ToolId
  label: string
  /** Bölümün ne işe yaradığını anlatan kısa not (üst kenardaki ⓘ düğmesiyle açılır) */
  info?: ToolInfo
  pinned: boolean
  blink: number
  onTogglePin: () => void
  onBlink: () => void
  onRemove: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const down = useRef<{ x: number; y: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  /** X düğmesi basılı tutulurken içerik soluklaşır; süre dolunca bölüm solarak kaybolur */
  const [holding, setHolding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const removeRef = useRef(onRemove)
  useEffect(() => {
    removeRef.current = onRemove
  })

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => removeRef.current(), LEAVE_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  /* Sabitlenmemiş bölüme tıklanırsa (sürüklemeden) sabitleme düğmesi yanıp söner */
  const onPointerDown = (e: PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const d = down.current
    down.current = null
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) onBlink()
  }

  return (
    <div
      ref={frame}
      className="tool-frame relative size-full"
      data-holding={holding || undefined}
      data-leaving={leaving || undefined}
    >
      {/* İçerik yalnızca sabitlenince kullanılabilir; öncesinde tıklama ve klavye odağı kapalıdır */}
      <div className="tool-body size-full" inert={!pinned}>
        {children}
      </div>

      {!pinned && (
        <div
          className="tool-move absolute inset-0 z-10 flex cursor-grab items-center justify-center rounded-[18px] active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (down.current = null)}
          aria-hidden
        >
          <span className="tool-move-hint pointer-events-none flex max-w-[90%] items-center gap-2 rounded-full border border-holo/30 bg-void/85 px-3 py-1.5 text-[13.5px] text-ink-muted shadow-xl">
            <Move size={14} className="shrink-0 text-holo" />
            <span className="truncate">{t.layout.dragHint}</span>
          </span>
        </div>
      )}

      {/* Bölüm düğmeleri: üst kenarın ortasında yan yana (açıklama, sabitle, kaldır); üzerine gelince görünür */}
      <div className="tool-controls absolute top-0 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
        {info && <ToolInfoButton title={label} what={info.what} how={info.how} howLabel={t.layout.infoHow} label={t.layout.infoLabel(label)} />}
        <div className="tool-pin">
          <Tooltip label={pinned ? t.layout.unpinTip : t.layout.pinTip}>
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinned}
              aria-label={pinned ? t.layout.unpinLabel(label) : t.layout.pinLabel(label)}
              className={`relative flex size-8 items-center justify-center rounded-full border shadow-lg transition-[background-color,border-color,color,opacity] duration-150 ${
                pinned
                  ? 'border-holo/45 bg-raised text-holo hover:bg-holo/15'
                  : 'border-line-strong bg-raised text-ink-muted hover:border-holo/50 hover:text-holo'
              }`}
            >
              {blink > 0 && <span key={blink} className="pin-glow pointer-events-none absolute inset-0 rounded-full" aria-hidden />}
              {pinned ? <Pin size={15} className="fill-current" aria-hidden /> : <PinOff size={15} aria-hidden />}
            </button>
          </Tooltip>
        </div>

        {/* Kaldırma düğmesi: 1 saniye basılı tutulunca bölüm arayüzden kalkar */}
        <RemoveButton label={label} onHoldChange={setHolding} onDone={() => setLeaving(true)} />
      </div>
    </div>
  )
}

/** Basılı tutunca dolan halka; süre dolmadan bırakılırsa iptal olur, kısa basışta "basılı tut" ipucu çıkar */
function RemoveButton({ label, onHoldChange, onDone }: { label: string; onHoldChange: (holding: boolean) => void; onDone: () => void }) {
  const { t } = useI18n()
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(0)
  const active = useRef(false)
  const startedAt = useRef(0)
  /*
   * Süreyi bir zamanlayıcı tutar; halka yalnızca görsel göstergedir. (Halkanın CSS animasyonunun bitişine
   * güvenilmez: cam düğmenin bulanıklık ve büyüme efektiyle birlikte bazı tarayıcılarda bitiş olayı gelmiyor.)
   */
  const timer = useRef(0)
  const doneLatest = useRef(onDone)
  useEffect(() => {
    doneLatest.current = onDone
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  /* Halka her karede zamanlayıcıyla aynı oranda dolar (CSS animasyonuna bağlı değildir) */
  const ringRef = useRef<SVGCircleElement>(null)
  useEffect(() => {
    if (!holding) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / HOLD_MS)
      ringRef.current?.setAttribute('stroke-dashoffset', String(1 - progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [holding])

  const finish = () => {
    if (!active.current) return
    active.current = false
    setHolding(false)
    doneLatest.current()
  }
  const start = () => {
    if (active.current) return
    active.current = true
    startedAt.current = performance.now()
    setHolding(true)
    onHoldChange(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(finish, HOLD_MS)
  }
  const stop = () => {
    if (!active.current) return
    active.current = false
    clearTimeout(timer.current)
    setHolding(false)
    onHoldChange(false)
    if (performance.now() - startedAt.current < 400) setHint((n) => n + 1)
  }
  const isKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' '

  return (
    <div className="tool-remove relative" data-holding={holding || undefined}>
      <Tooltip label={t.layout.removeTip}>
        <button
          type="button"
          aria-label={t.layout.removeLabel(label)}
          data-holding={holding || undefined}
          className="relative flex size-8 touch-none items-center justify-center rounded-full border border-line-strong bg-raised text-ink-muted shadow-lg transition-colors duration-150 select-none hover:border-crit/50 hover:text-crit data-[holding]:border-crit/60 data-[holding]:text-crit"
          onPointerDown={(e) => e.button === 0 && start()}
          onPointerUp={stop}
          onPointerLeave={stop}
          onPointerCancel={stop}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (!isKey(e)) return
            e.preventDefault()
            if (!e.repeat) start()
          }}
          onKeyUp={(e) => {
            if (isKey(e)) stop()
          }}
          onBlur={stop}
        >
          <X size={15} aria-hidden />
          {/* İlerleme halkası: süreyi zamanlayıcı tutar, halka onunla aynı hızda dolar */}
          <svg className="pointer-events-none absolute -inset-[3px] size-[38px] -rotate-90" viewBox="0 0 38 38" aria-hidden>
            {holding && (
              <circle
                ref={ringRef}
                className="hold-ring"
                cx="19"
                cy="19"
                r="17.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset="1"
              />
            )}
          </svg>
        </button>
      </Tooltip>
      {hint > 0 && (
        <span
          key={hint}
          className="remove-hint pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-lg border border-crit/40 bg-raised px-2.5 py-1.5 text-[13.5px] whitespace-nowrap text-ink shadow-xl"
          aria-hidden
        >
          {t.layout.removeHint}
        </span>
      )}
    </div>
  )
}

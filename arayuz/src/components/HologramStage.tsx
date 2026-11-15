import { BicepsFlexed, Bone, ChevronLeft, History, Layers, MessageCircleHeart, MessageSquareWarning, Minus, MoveHorizontal, PersonStanding, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { LAYER_ORDER, structureInfo, useAnatomyNames, useLayers, type LayerId, type StructureInfo, type StructureLayer, type StructureRef } from '../data/anatomy'
import { REGION_FACING, REGION_ORDER, useRegions } from '../data/regions'
import type { RegionId, Status } from '../data/types'
import { cameraModeFor, DEFAULT_VIEW, LAYER_X, panBy, projectToScreen, ZOOM_MAX, zoomAt, type ViewTarget } from '../hologram/layout'
import { useI18n } from '../i18n'
import { SYMPTOMS_BY_LAYER, type StructureQuestion, type Symptom } from '../lib/assistant'
import { STATUS_META } from '../lib/status'
import type { Side } from '../core/model'
import type { Tx } from '../core/tx'
import { Tooltip } from './Tooltip'

/* 3D sahne ayrı yüklenir; arayüzün geri kalanı onu beklemez. */
const HologramScene = lazy(() => import('../hologram/HologramScene'))

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

interface Props {
  selected: RegionId | null
  statuses: Record<RegionId, Status>
  reducedMotion: boolean
  exploded: boolean
  focusLayer: LayerId | null
  selectedStructure: StructureRef | null
  /**
   * Rahatsızlık bildirme modu: kas ve iskelet sistemi yan yana açılır; kişi birine tıklayınca (odak katmanı) o türden
   * kas ya da kemik seçer, ne hissettiğini söyler ve asistana sorar.
   */
  complaint: boolean
  onSelect: (id: RegionId) => void
  onToggleExplode: () => void
  /** Rahatsızlık bildirmeyi açar ya da kapatır (kapanınca hologram görünümüne dönülür) */
  onToggleComplaint: () => void
  onFocusLayer: (layer: LayerId | null) => void
  onStructureSelect: (ref: StructureRef) => void
  /** Seçili yapıyı kaldırır (rahatsızlık bildirirken son seçili yapı da seçimden çıkınca) */
  onStructureClear: () => void
  onAsk: (question: string, structure: StructureQuestion) => void
  /** Rahatsızlık kaydedilebilir mi (hekim görünümünde salt okunur) */
  canSave?: boolean
  /** Rahatsızlığı kaydeder (şikayet geçmişine ve spor koçuna gider) */
  onSaveComplaint?: (draft: ComplaintDraft) => void
  /** Şikayet geçmişini açar */
  onOpenHistory?: () => void
  /** Hologramın bulunduğu sayfa ekranda mı; değilse 3D çizim durur (aynı hologram birden fazla sayfada olabilir) */
  active?: boolean
}

/** Kaydedilecek rahatsızlık: sistem (kas ya da kemik), belirti, şiddet, not ve bölgelere göre gruplanmış yapılar */
export interface ComplaintDraft {
  layer: StructureLayer
  symptom: Symptom
  severity: number
  note: string
  items: { region: RegionId; side: Side; structures: Tx[] }[]
}

/** Yapı adındaki taraf etiketinden taraf (kaynak dosyada "(sağ)" / "(sol)"; Türkçe adlarda "Sağ"/"Sol" başta) */
function sideOf(names: string[]): Side {
  const right = names.some((n) => /\((sağ|right)\)|^Sağ /i.test(n))
  const left = names.some((n) => /\((sol|left)\)|^Sol /i.test(n))
  return right && !left ? 'right' : left && !right ? 'left' : 'both'
}

/** Sürüklemede piksel başına dönüş (radyan) */
const DRAG_SPEED = 0.009
/** Düğme ve klavyeyle bir adımlık yakınlaştırma */
const ZOOM_STEP = 1.25
/** Rahatsızlık kartının sağ kenar boşluğu (px; sınıflarla aynı) */
const CARD_MARGIN = 20
/**
 * Rahatsızlık kartının genişliği alanın genişliğine göre: geniş alanda 320, orta alanda (ana sayfadaki hologram) 248 px.
 * İkisinde de figür kartın solundaki boşluğa kayar. Çok dar alanda (telefon) kart alanı kaplar, figür kaydırılmaz.
 */
const cardWidthFor = (areaWidth: number) => (areaWidth >= 640 ? 320 : areaWidth >= 440 ? 248 : 0)

/** Rahatsızlık bildirirken birlikte seçilebilecek en fazla yapı */
const MAX_PICK = 10

/** Rahatsızlık bildirirken seçilen bir yapı: yapı numarası ve arayüz dilindeki bilgisi */
type PickedStructure = StructureInfo & { id: number }

/** Katman simgeleri (rahatsızlık bildirirken sistem seçiminde) */
const LAYER_ICON = { muscles: BicepsFlexed, bones: Bone }

/** Tekerlek hareketini yakınlaştırma katsayısına çevirir (dokunmatik yüzeyde iki parmak hareketi ctrl ile gelir) */
function wheelFactor(e: WheelEvent, height: number) {
  let dy = e.deltaY
  if (e.deltaMode === 1) dy *= 16
  else if (e.deltaMode === 2) dy *= height
  return Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018))
}

export function HologramStage({
  selected,
  statuses,
  reducedMotion,
  exploded,
  focusLayer,
  selectedStructure,
  complaint,
  onSelect,
  onToggleExplode,
  onToggleComplaint,
  onFocusLayer,
  onStructureSelect,
  onStructureClear,
  onAsk,
  canSave = false,
  onSaveComplaint,
  onOpenHistory,
  active = true,
}: Props) {
  const { lang, t, locale } = useI18n()
  const regions = useRegions()
  const layers = useLayers()
  const [hovered, setHovered] = useState<RegionId | null>(null)
  const [hoveredStructure, setHoveredStructure] = useState<StructureRef | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const rotation = useRef({ target: 0 })
  const angleRef = useRef<HTMLSpanElement>(null)
  const webgl = useMemo(hasWebGL, [])
  const names = useAnatomyNames()

  // Katman etiketlerinin yeri ve yakınlaştırma hesabı için 3D alanın en-boy oranı
  const area = useRef<HTMLDivElement>(null)
  const [aspect, setAspect] = useState(1.5)
  const [areaWidth, setAreaWidth] = useState(0)
  const aspectRef = useRef(aspect)
  useEffect(() => {
    const el = area.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const a = e.contentRect.width / Math.max(e.contentRect.height, 1)
      aspectRef.current = a
      setAspect(a)
      setAreaWidth(e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ---------- Yakınlaştırma ve kaydırma ---------- */

  const mode = cameraModeFor(exploded, focusLayer)
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  /** Kameranın hedefi; sahne her karede okur, değişiklik arayüzü yeniden çizdirmez */
  const view = useRef<ViewTarget>({ ...DEFAULT_VIEW })
  /** Alan genişliğinin figürlere kalan oranı (kart açıkken kartın solu) */
  const fitRef = useRef(1)
  /** Ekranda yazan yakınlaştırma oranı */
  const [zoom, setZoom] = useState(1)
  const syncZoom = useCallback(() => setZoom(Math.round(view.current.zoom * 100) / 100), [])
  const zoomBy = useCallback(
    (factor: number, nx = 0, ny = 0) => {
      zoomAt(view.current, factor, nx, ny, modeRef.current, aspectRef.current, fitRef.current)
      syncZoom()
    },
    [syncZoom],
  )
  const resetZoom = useCallback(() => {
    view.current = { ...DEFAULT_VIEW }
    syncZoom()
  }, [syncZoom])
  /*
   * İki katman yan yana görünüm ile tek figür arasında geçilince ya da hologram ile katmanlar arasında geçilince
   * yakınlaştırma sıfırlanır (rahatsızlık bildirmeden çıkınca hologram yakınlaştırılmış kalmaz)
   */
  useEffect(() => resetZoom(), [mode, exploded, resetZoom])
  /* Rahatsızlık kartı açıkken figür, kartın solunda kalan boşluğun ortasına kayar (kart figürü örtmesin) */
  const frameShift = useRef(0)
  const cardWidth = cardWidthFor(areaWidth)
  const shift = complaint && cardWidth && areaWidth ? (cardWidth + CARD_MARGIN) / 2 / areaWidth : 0
  useEffect(() => {
    frameShift.current = shift
    fitRef.current = 1 - 2 * shift
  }, [shift])

  /*
   * İmleç 3D alanın içindeyken fare tekerleği sayfayı kaydırmaz, imlecin gösterdiği noktaya yakınlaştırır.
   * Alanın üstündeki kaydırılabilir katmanlar (data-wheel-scroll, ör. rahatsızlık kartı) hariç: orada tekerlek o katmanı kaydırır.
   */
  useEffect(() => {
    const el = area.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-wheel-scroll]')) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomBy(wheelFactor(e, r.height), ((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  // Görünüm değişince eski üzerine gelme bilgisi temizlenir
  useEffect(() => {
    setHoveredStructure(null)
  }, [exploded, focusLayer])

  /** En yakın ön ya da arka açıya döner */
  const face = (side: 'on' | 'arka') => {
    const base = side === 'on' ? 0 : Math.PI
    const target = rotation.current.target
    rotation.current.target = base + Math.PI * 2 * Math.round((target - base) / (Math.PI * 2))
  }

  const selectFromList = (id: RegionId) => {
    onSelect(id)
    face(REGION_FACING[id])
  }

  /* ---------- Fare ve dokunma ---------- */
  /*
   * Sol tık (ya da tek parmak) yatay sürüklemede döndürür; yakınlaştırılmışken dikey sürükleme görüntüyü kaydırır.
   * Sağ ya da orta tuşla sürükleme her yöne kaydırır. İki parmakla sıkıştırma yakınlaştırır.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null)
  const drag = useRef<{ x: number; y: number; id: number; pan: boolean } | null>(null)

  const pinchState = () => {
    const [a, b] = [...pointers.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button > 2) return
    if (e.button === 1) e.preventDefault()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      drag.current = null
      pinch.current = pinchState()
      return
    }
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, pan: e.button !== 0 }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pinch.current && pointers.current.size >= 2) {
      const next = pinchState()
      const prev = pinch.current
      zoomBy(next.dist / Math.max(prev.dist, 1), ((next.mx - rect.left) / rect.width) * 2 - 1, 1 - ((next.my - rect.top) / rect.height) * 2)
      panBy(view.current, next.mx - prev.mx, next.my - prev.my, rect.height, modeRef.current, aspectRef.current, fitRef.current)
      pinch.current = next
      return
    }

    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!dragging && Math.hypot(dx, dy) > 3) {
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (d.pan) panBy(view.current, dx, dy, rect.height, modeRef.current, aspectRef.current, fitRef.current)
    else {
      rotation.current.target += dx * DRAG_SPEED
      if (view.current.zoom > 1.001) panBy(view.current, 0, dy, rect.height, modeRef.current, aspectRef.current, fitRef.current)
    }
    d.x = e.clientX
    d.y = e.clientY
  }
  const endPointer = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (drag.current?.id === e.pointerId) drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (dragging && !drag.current) setDragging(false)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const h = area.current?.clientHeight ?? 600
    if (e.key === 'ArrowLeft') rotation.current.target -= 0.3
    else if (e.key === 'ArrowRight') rotation.current.target += 0.3
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') panBy(view.current, 0, e.key === 'ArrowUp' ? 48 : -48, h, modeRef.current, aspectRef.current, fitRef.current)
    else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP)
    else if (e.key === '-' || e.key === '_') zoomBy(1 / ZOOM_STEP)
    else if (e.key === '0') resetZoom()
    else return
    e.preventDefault()
  }

  /* ---------- Rahatsızlık bildirme ---------- */

  /*
   * Rahatsızlık bildirirken önce sistem seçilir (kas ya da iskelet; odak katmanı). Sonra o sistemden birden çok yapı
   * seçilebilir: tıklanan yapı seçime eklenir, seçili yapıya yeniden tıklamak onu çıkarır. Bilgi kartı (uygulamanın
   * seçili yapısı) son eklenen yapıyı gösterir. Mod kapanınca ya da sistem değişince seçim temizlenir.
   */
  const complaintLayer: StructureLayer | null = complaint ? focusLayer : null
  const [picked, setPicked] = useState<number[]>([])
  const pickKey = `${complaint}:${complaintLayer}`
  const [pickKeyWas, setPickKeyWas] = useState(pickKey)
  if (pickKeyWas !== pickKey) {
    setPickKeyWas(pickKey)
    setPicked([])
  }
  const removeStructure = (id: number) => {
    if (!complaintLayer) return
    const next = picked.filter((p) => p !== id)
    setPicked(next)
    if (selectedStructure?.layer === complaintLayer && selectedStructure.id === id) {
      if (next.length) onStructureSelect({ layer: complaintLayer, id: next[next.length - 1] })
      else onStructureClear()
    }
  }
  const clearPicked = () => {
    setPicked([])
    onStructureClear()
  }
  const selectStructure = (ref: StructureRef) => {
    if (!complaint) return onStructureSelect(ref)
    // Sistem seçilmeden önce figüre tıklamak o sistemi seçer (yapı seçilmez; yan yana figürler küçüktür)
    if (!complaintLayer) return onFocusLayer(ref.layer)
    if (ref.layer !== complaintLayer) return
    if (picked.includes(ref.id)) return removeStructure(ref.id)
    if (picked.length >= MAX_PICK) return
    setPicked([...picked, ref.id])
    onStructureSelect(ref)
  }
  const pickedItems = useMemo(
    () =>
      complaintLayer
        ? picked.flatMap((id): PickedStructure[] => {
            const info = structureInfo(names, { layer: complaintLayer, id }, lang)
            return info ? [{ ...info, id }] : []
          })
        : [],
    [picked, names, lang, complaintLayer],
  )
  /** Seçilen yapıların bölgeleri, baştan ayağa */
  const pickedRegions = REGION_ORDER.filter((r) => pickedItems.some((m) => m.region === r))

  /** Rahatsızlığı kaydeder: yapılar bölgelere ve taraflara göre gruplanır, adlar iki dilde saklanır */
  const saveComplaint = (symptom: Symptom, severity: number, note: string) => {
    if (!onSaveComplaint || !complaintLayer || !pickedItems.length) return
    const items = pickedRegions.map((region) => {
      const inRegion = pickedItems.filter((m) => m.region === region)
      const both = inRegion.map((m) => ({
        tr: structureInfo(names, { layer: complaintLayer, id: m.id }, 'tr')?.name ?? m.name,
        en: structureInfo(names, { layer: complaintLayer, id: m.id }, 'en')?.name ?? m.name,
      }))
      return { region, side: sideOf(both.flatMap((b) => [b.tr, b.en])), structures: both }
    })
    onSaveComplaint({ layer: complaintLayer, symptom, severity, note, items })
  }

  const askComplaint = (symptom: Symptom, note: string) => {
    if (!complaintLayer || !pickedItems.length) return
    const bones = complaintLayer === 'bones'
    const phrase = t.hologram.symptomPhrase[symptom]
    const extra = bones && note ? { note } : {}
    if (pickedItems.length > 1) {
      // Soru bölgelere göre kurulur: aynı bölgedeyse "Bacaklar bölgesinde 3 kasta…", değilse "Bacaklar ve üst kollar bölgelerinde…"
      const inSentence = (name: string) => (lang === 'tr' ? name : name.toLocaleLowerCase(locale))
      const joined = new Intl.ListFormat(locale, { type: 'conjunction' }).format(pickedRegions.map((r) => regions[r].name.toLocaleLowerCase(locale)))
      const regionsText = lang === 'tr' ? joined.charAt(0).toLocaleUpperCase(locale) + joined.slice(1) : joined
      const question =
        pickedRegions.length === 1
          ? (bones ? t.hologram.boneGroupQuestion : t.hologram.complaintGroupQuestion)(inSentence(regions[pickedRegions[0]].name), pickedItems.length, phrase)
          : (bones ? t.hologram.boneRegionsQuestion : t.hologram.complaintRegionsQuestion)(regionsText, phrase)
      const list = pickedItems.map((m) => ({ name: m.name, region: m.region }))
      onAsk(question, {
        name: pickedItems.map((m) => m.name).join('; '),
        layer: complaintLayer,
        region: pickedRegions[0],
        symptom,
        ...(bones ? { bones: list } : { muscles: list }),
        ...extra,
      })
      return
    }
    const item = pickedItems[0]
    const question = bones ? t.hologram.boneQuestion(item.name, phrase) : t.hologram.complaintQuestion(item.name, phrase)
    onAsk(question, { name: item.name, layer: complaintLayer, region: item.region, symptom, ...extra })
  }

  const hoverStruct = structureInfo(names, hoveredStructure, lang)
  /** Rahatsızlık bildirirken sistem seçimi: figürün üstüne gelince yapı yerine sistemin adı görünür */
  const choosing = complaint && !complaintLayer
  const showTip = !dragging && (hoverStruct || hovered)
  const title = !exploded ? t.hologram.bodyMap : focusLayer ? layers[focusLayer].name : t.hologram.layersTitle
  const modeLabel = !exploded ? t.hologram.modeCombined : focusLayer ? `${t.hologram.modeFocus} · ${layers[focusLayer].short.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US')}` : t.hologram.modeLayers
  const zoomed = zoom > 1.001
  const zoomText = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { style: 'percent' }).format(zoom)
  /** Üstteki katmanlara (düğmeler, kart) basınca sahne sürüklenmesin */
  const keepOut = (e: PointerEvent) => e.stopPropagation()

  return (
    <section id="tour-hologram" aria-label={t.hologram.section} className="panel panel-solid relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Üst bilgi satırı */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4 sm:p-5">
        <div>
          <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] text-ink-dim uppercase">{t.hologram.live}</p>
          <p className="mt-1 font-display text-lg font-medium text-ink">{title}</p>
        </div>
        <div className="text-right font-mono text-[13.5px] leading-5 text-ink-dim">
          <p>
            {t.hologram.angle} <span ref={angleRef} className="tabular text-holo">000°</span>
          </p>
          <p>{modeLabel}</p>
        </div>
      </div>

      {/* 3D alan: sürükleyerek döndürülür, tekerlekle yakınlaştırılır */}
      <div
        ref={area}
        role="application"
        aria-label={t.hologram.appLabel}
        tabIndex={0}
        className={`relative min-h-0 flex-1 touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-holo/60 focus-visible:ring-inset ${
          dragging ? 'cursor-grabbing' : hovered || hoveredStructure ? 'cursor-pointer' : 'cursor-grab'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => {
          setHovered(null)
          setHoveredStructure(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        {webgl ? (
          <Suspense fallback={<StageLoading label={t.hologram.loading} />}>
            <HologramScene
              suspended={!active}
              selected={selected}
              hovered={hovered}
              statuses={statuses}
              exploded={exploded}
              focusLayer={focusLayer}
              rotation={rotation}
              view={view}
              frameShift={frameShift}
              cameraMode={mode}
              reducedMotion={reducedMotion}
              angleRef={angleRef}
              hoveredStructure={hoveredStructure}
              selectedStructure={selectedStructure}
              onSelect={onSelect}
              onHover={setHovered}
              onStructureHover={setHoveredStructure}
              onStructureSelect={selectStructure}
              picked={complaintLayer ? { layer: complaintLayer, ids: picked } : null}
              canvasLabel={t.hologram.canvasLabel}
              realistic={exploded}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-ink-muted">{t.hologram.noWebgl}</div>
        )}

        {/* Üzerine gelince ad */}
        {showTip && (
          <div
            className="pointer-events-none absolute z-20 max-w-72 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-line-strong bg-raised/95 px-3 py-1.5 text-sm shadow-xl backdrop-blur"
            style={{ left: pointer.x, top: pointer.y }}
          >
            {hoverStruct && hoveredStructure ? (
              choosing ? (
                <span className="block font-medium whitespace-nowrap text-ink">{layers[hoveredStructure.layer].name}</span>
              ) : (
                <>
                  <span className="block font-medium text-ink">{hoverStruct.name}</span>
                  <span className="block text-[13.5px] text-ink-dim">
                    {layers[hoveredStructure.layer].name} · {regions[hoverStruct.region].name}
                  </span>
                </>
              )
            ) : hovered ? (
              <span className="whitespace-nowrap">
                <span className="font-medium text-ink">{regions[hovered].name}</span>
                <span className={`ml-2 ${STATUS_META[statuses[hovered]].text}`}>· {t.status[statuses[hovered]]}</span>
              </span>
            ) : null}
          </div>
        )}

        {/* İki katman yan yana görünümde katman adları (her figürün altında; kart açıkken figürlerle birlikte kayar, yakınlaştırınca gizlenir) */}
        {LAYER_ORDER.map((l) => {
          const pos = projectToScreen(LAYER_X[l], -0.1, 'wide', aspect, 1 - 2 * shift)
          return (
            <span
              key={l}
              aria-hidden
              className={`pointer-events-none absolute -translate-x-1/2 font-mono font-semibold text-[12.5px] tracking-[0.07em] whitespace-nowrap text-holo uppercase transition-[opacity,left] duration-500 ${
                exploded && !focusLayer && !zoomed ? 'opacity-100 delay-300' : 'opacity-0'
              }`}
              style={{ left: `${(pos.left - shift) * 100}%`, top: `${pos.top * 100}%` }}
            >
              {layers[l].short}
            </span>
          )
        })}

        {/* Rahatsızlık bildirme kartı: önce sistem, sonra kaslar ya da kemikler, sonra ne hissedildiği; ardından asistana sorulur */}
        <AnimatePresence>
          {complaint && (
            <motion.div
              key="complaint"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 14, transition: { duration: 0.16 } }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onPointerDown={keepOut}
              data-wheel-scroll
              // Üstte başlık satırı (72 px); altta yakınlaştırma kapsülü yok (kart açıkken gizlenir; tekerlekle yakınlaştırma sürer)
              style={{ width: cardWidth ? cardWidth : 'calc(100% - 2rem)' }}
              className="absolute top-[72px] right-4 z-10 flex max-h-[calc(100%-84px)] cursor-default flex-col sm:right-5"
            >
              <ComplaintCard
                // Sistem değişince belirti ve yazılan not sıfırlanır
                key={complaintLayer ?? 'choose'}
                layer={complaintLayer}
                items={pickedItems}
                regionNames={pickedRegions.map((r) => ({ id: r, name: regions[r].name }))}
                full={picked.length >= MAX_PICK}
                onChooseLayer={onFocusLayer}
                onRemove={removeStructure}
                onClearAll={clearPicked}
                onAsk={askComplaint}
                canSave={canSave && !!onSaveComplaint}
                onSave={saveComplaint}
                onClose={onToggleComplaint}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rahatsızlık bildirirken ipucu ve yakınlaştırma kapsülü gizlenir: figürler yere basar, alttaki etiketler açıkta kalır */}
        <p hidden={complaint} className="pointer-events-none absolute bottom-4 left-3 flex max-w-[calc(100%-11rem)] items-center gap-1.5 truncate rounded-full bg-black/40 px-3 py-1 text-[13.5px] whitespace-nowrap text-ink-dim backdrop-blur sm:left-4">
          <MoveHorizontal size={13} aria-hidden />
          {t.hologram.dragHint}
        </p>

        {/* Yakınlaştırma: uzaklaştır, oran (tıklayınca sıfırlanır), yakınlaştır */}
        <div
          hidden={complaint}
          role="group"
          aria-label={t.hologram.zoomGroup}
          onPointerDown={keepOut}
          className="absolute right-3 bottom-3 z-10 flex cursor-default items-center gap-0.5 rounded-full border border-line bg-black/45 p-1 backdrop-blur sm:right-4"
        >
          <Tooltip label={t.hologram.zoomOut} side="top">
            <button
              type="button"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={!zoomed}
              aria-label={t.hologram.zoomOut}
              className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.07] hover:text-ink disabled:pointer-events-none disabled:opacity-35"
            >
              <Minus size={15} aria-hidden />
            </button>
          </Tooltip>
          <Tooltip label={t.hologram.zoomReset} side="top">
            <button
              type="button"
              onClick={resetZoom}
              disabled={!zoomed}
              aria-label={`${t.hologram.zoomReset} (${zoomText})`}
              className="tabular h-8 min-w-12 rounded-full px-1.5 font-mono text-[13.5px] text-ink transition-colors hover:bg-white/[0.07] disabled:pointer-events-none disabled:text-ink-dim"
            >
              {zoomText}
            </button>
          </Tooltip>
          <Tooltip label={t.hologram.zoomIn} side="top" align="end">
            <button
              type="button"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= ZOOM_MAX - 0.001}
              aria-label={t.hologram.zoomIn}
              className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/[0.07] hover:text-ink disabled:pointer-events-none disabled:opacity-35"
            >
              <Plus size={15} aria-hidden />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Alt kontroller: yalnızca düğmeler */}
      <div className="relative z-10 border-t border-line bg-base/60 p-3 sm:p-4">
        <div id="tour-view" className="mb-3 flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t.hologram.view} className="flex rounded-xl border border-line p-1">
            <button type="button" onClick={() => face('on')} className="min-h-9 rounded-lg px-3.5 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink">
              {t.hologram.front}
            </button>
            <button type="button" onClick={() => face('arka')} className="min-h-9 rounded-lg px-3.5 text-sm text-ink-muted transition-colors hover:bg-white/[0.04] hover:text-ink">
              {t.hologram.back}
            </button>
          </div>
          <Tooltip label={exploded ? t.hologram.mergeTip : t.hologram.explodeTip}>
            <button
              id="tour-explode"
              type="button"
              onClick={onToggleExplode}
              aria-pressed={exploded}
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors ${
                exploded ? 'border-holo/50 bg-holo/10 text-holo' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {exploded ? <PersonStanding size={17} aria-hidden /> : <Layers size={17} aria-hidden />}
              {exploded ? t.hologram.merge : t.hologram.explode}
            </button>
          </Tooltip>
          {/* Rahatsızlık bildir ve şikayet geçmişi yan yana */}
          <div id="tour-complaint" className="flex items-center gap-2">
            <Tooltip label={complaint ? t.hologram.complaintOffTip : t.hologram.complaintTip}>
              <button
                type="button"
                onClick={onToggleComplaint}
                aria-pressed={complaint}
                className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors ${
                  complaint ? 'border-holo/50 bg-holo/10 text-holo' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <MessageSquareWarning size={17} aria-hidden />
                {t.hologram.complaint}
              </button>
            </Tooltip>
            {onOpenHistory && (
              <Tooltip label={t.complaintSave.history}>
                <button
                  type="button"
                  id="complaint-history-button"
                  onClick={onOpenHistory}
                  aria-label={t.complaintSave.history}
                  className="flex size-11 items-center justify-center rounded-xl border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  <History size={17} aria-hidden />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {exploded ? (
          <div role="group" aria-label={t.hologram.layersList} className="flex flex-wrap gap-1.5">
            <Tooltip label={t.hologram.allTip} side="top" align="start">
              <button
                type="button"
                onClick={() => onFocusLayer(null)}
                aria-pressed={focusLayer === null}
                className="flex min-h-9 items-center rounded-lg border border-line px-3 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink aria-pressed:border-holo/50 aria-pressed:bg-holo/10 aria-pressed:text-ink"
              >
                {t.hologram.all}
              </button>
            </Tooltip>
            {LAYER_ORDER.map((l) => (
              <Tooltip key={l} label={t.hologram.focusTip(layers[l].short)} side="top">
                <button
                  type="button"
                  onClick={() => onFocusLayer(l)}
                  aria-pressed={focusLayer === l}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink aria-pressed:border-holo/50 aria-pressed:bg-holo/10 aria-pressed:text-ink"
                >
                  <span className="size-1.5 rounded-full bg-holo" aria-hidden />
                  {layers[l].name}
                  {names && <span className="font-mono text-[12.5px] text-ink-dim">{names[l].length}</span>}
                </button>
              </Tooltip>
            ))}
          </div>
        ) : (
          <ul aria-label={t.hologram.regionsList} className="flex flex-wrap gap-1.5">
            {REGION_ORDER.map((id) => {
              const st = STATUS_META[statuses[id]]
              const Icon = st.icon
              const on = selected === id
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => selectFromList(id)}
                    onMouseEnter={() => setHovered(id)}
                    onMouseLeave={() => setHovered(null)}
                    aria-pressed={on}
                    className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[14.5px] transition-colors ${
                      on ? 'border-holo/50 bg-holo/10 text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {/* Durum simgesi: normal yeşil tik, dikkat sarı üçgen, kritik kırmızı uyarı */}
                    <Icon size={14} className={`shrink-0 ${st.text}`} aria-hidden />
                    {regions[id].name}
                    <span className="sr-only">
                      , {t.hologram.statusPrefix} {t.status[statuses[id]]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * Rahatsızlık bildirme kartı.
 * - Sistem seçilmeden önce: kas mı kemik mi (figüre tıklamak da seçer).
 * - Sonra yönerge; tek yapı seçilince adı ve bölgesi; birden çok yapı seçilince bölgelere göre gruplanmış çipler
 *   (her biri çıkarılabilir). Aynı bölgedeki yapılar tek bölge olarak, farklı bölgelerdekiler ayrı ayrı raporlanır.
 * - Kemiklerde belirtiler kırık/çatlak şüphesi, darbe vb.; durum kişinin kendi sözleriyle de yazılabilir ("Diğer"de zorunlu).
 */
function ComplaintCard({
  layer,
  items,
  regionNames,
  full,
  onChooseLayer,
  onRemove,
  onClearAll,
  onAsk,
  canSave,
  onSave,
  onClose,
}: {
  /** Seçilen sistem; null ise henüz seçilmedi */
  layer: StructureLayer | null
  items: PickedStructure[]
  /** Seçilen yapıların bölgeleri, baştan ayağa */
  regionNames: { id: RegionId; name: string }[]
  /** En fazla yapı sayısına ulaşıldı */
  full: boolean
  onChooseLayer: (layer: StructureLayer | null) => void
  onRemove: (id: number) => void
  onClearAll: () => void
  onAsk: (symptom: Symptom, note: string) => void
  canSave: boolean
  onSave: (symptom: Symptom, severity: number, note: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const layers = useLayers()
  const [symptom, setSymptom] = useState<Symptom | null>(null)
  const [severity, setSeverity] = useState(5)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const single = items.length === 1 ? items[0] : null
  const bones = layer === 'bones'
  /** "Diğer" seçilince durumun yazılması gerekir */
  const needsNote = symptom === 'other' && !note.trim()
  /* Belirti seçilince şiddet ve not açılır; kısa alanda kart kayarsa kaydet düğmesi görünür kalsın */
  const submitRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (symptom) submitRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [symptom])

  /* Seçim listesi kaydırılabiliyorsa kaydırılabilen kenarı solar; içerik başlığın altında sert kesilmez */
  const listRef = useRef<HTMLDivElement>(null)
  const listInner = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const measureEdges = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const top = el.scrollTop > 1
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }))
  }, [])
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    // Gözlem başlayınca bir kez, sonra liste ya da içeriği boyut değiştirdikçe ölçülür
    const ro = new ResizeObserver(measureEdges)
    ro.observe(el)
    if (listInner.current) ro.observe(listInner.current)
    return () => ro.disconnect()
  }, [measureEdges, items.length])
  const FADE = 16

  const feelLabel = bones ? t.hologram.complaintBoneFeel : t.hologram.complaintFeel

  return (
    <div
      role="region"
      aria-label={t.hologram.complaint}
      aria-live="polite"
      className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-line-strong bg-raised/85 shadow-2xl backdrop-blur-md"
    >
      {/* Başlık kaymaz: X ile her an rahatsızlık bildirmeden çıkılabilir */}
      <div className="@container flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-1">
        {layer ? (
          // Sistem seçildiyse başlığın yerinde seçilen sistem durur; basınca sistem seçimine dönülür
          <Tooltip label={t.hologram.complaintSwitch} side="bottom" align="start">
            <button
              type="button"
              onClick={() => onChooseLayer(null)}
              aria-label={`${t.hologram.complaintSwitch}: ${layers[layer].name}`}
              className="-my-1 -ml-1.5 flex h-8 min-w-0 items-center gap-1 rounded-lg pr-2 pl-1 font-mono font-semibold text-[12.5px] tracking-[0.08em] whitespace-nowrap text-holo uppercase transition-colors hover:bg-white/[0.06]"
            >
              <ChevronLeft size={15} className="shrink-0" aria-hidden />
              <span className="truncate">{layers[layer].name}</span>
            </button>
          </Tooltip>
        ) : (
          // Dar kartta (ana sayfa) simge gizlenir, başlık tek satırda kalır
          <p className="flex min-w-0 items-center gap-2 font-mono font-semibold text-[12.5px] tracking-[0.08em] whitespace-nowrap text-holo uppercase">
            <MessageSquareWarning size={14} className="hidden shrink-0 @min-[17rem]:block" aria-hidden />
            <span className="truncate">{t.hologram.complaint}</span>
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.hologram.complaintClose}
          className="-my-1 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      {/* Gövde: kartın yüksekliği yetmezse yalnızca burası kayar; başlık ve X hep görünür */}
      <div className="scroll-thin flex min-h-0 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
        {!layer ? (
          /* Sistem seçimi: kas mı kemik mi */
          <>
            <p className="mt-2 font-display text-[17px] leading-snug font-semibold text-ink">{t.hologram.complaintChooseSystem}</p>
            <p className="mt-1 text-[14.5px] leading-snug text-ink-muted">{t.hologram.complaintChooseSystemHint}</p>
            <div role="group" aria-label={t.hologram.complaintSystemGroup} className="mt-3 grid gap-2">
              {LAYER_ORDER.map((l) => {
                const Icon = LAYER_ICON[l]
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => onChooseLayer(l)}
                    className="flex min-h-11 items-center gap-2.5 rounded-xl border border-line px-3 text-left text-sm text-ink transition-colors hover:border-holo/50 hover:bg-holo/10"
                  >
                    <Icon size={17} className="shrink-0 text-holo" aria-hidden />
                    {layers[l].name}
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {items.length > 0 && (
              // Seçilen yapılar: kartın yüksekliği yetmezse yalnızca bu kısım kayar (belirti ve Asistana sor hep görünür)
              <div
                ref={listRef}
                data-testid="complaint-muscles"
                onScroll={measureEdges}
                className="scroll-thin -mr-2 min-h-8 overflow-y-auto overscroll-contain pr-2"
                style={{
                  maskImage: `linear-gradient(to bottom, ${edges.top ? 'transparent' : 'black'}, black ${FADE}px, black calc(100% - ${FADE}px), ${edges.bottom ? 'transparent' : 'black'})`,
                }}
              >
                <div ref={listInner}>
                  {single && (
                    <>
                      <p className="mt-1 font-display text-[18px] leading-snug font-semibold text-balance text-ink">{single.name}</p>
                      <p className="mt-0.5 text-[14px] leading-snug text-ink-dim">
                        {regionNames[0]?.name}
                        {single.latin && (
                          <>
                            {' · '}
                            <span lang="la" className="italic">
                              {single.latin}
                            </span>
                          </>
                        )}
                      </p>
                    </>
                  )}

                  {items.length > 1 && (
                    <>
                      <div className="mt-1 flex items-baseline justify-between gap-3">
                        <p className="font-display text-[18px] leading-snug font-semibold text-ink">{t.hologram.complaintCount[layer](items.length)}</p>
                        <button type="button" onClick={onClearAll} className="shrink-0 rounded-md px-1 text-[13.5px] text-ink-dim transition-colors hover:text-ink">
                          {t.hologram.complaintClearAll}
                        </button>
                      </div>
                      <p className="mt-0.5 text-[14px] leading-snug text-ink-dim">
                        {regionNames.length > 1 ? t.hologram.complaintRegions(regionNames.length) : `${regionNames[0]?.name} · ${t.hologram.complaintOneRegion}`}
                      </p>
                      <div className="mt-3 space-y-2.5">
                        {regionNames.map((r) => (
                          <div key={r.id} role="group" aria-label={r.name}>
                            <p className="font-mono font-semibold text-[12.5px] tracking-[0.07em] text-ink-dim uppercase">{r.name}</p>
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                              {items
                                .filter((m) => m.region === r.id)
                                .map((m) => (
                                  <li key={m.id} className="flex max-w-full items-center gap-0.5 rounded-lg border border-holo/40 bg-holo/10 py-0.5 pr-0.5 pl-2.5 text-[14px] leading-snug text-ink">
                                    <span className="min-w-0">{m.name}</span>
                                    <button
                                      type="button"
                                      onClick={() => onRemove(m.id)}
                                      aria-label={t.hologram.complaintRemove(m.name)}
                                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-dim transition-colors hover:bg-white/[0.08] hover:text-ink"
                                    >
                                      <X size={13} aria-hidden />
                                    </button>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {full && <p className="mt-2 text-[13.5px] leading-snug text-ink-dim">{t.hologram.complaintFull[layer](items.length)}</p>}
                </div>
              </div>
            )}

            {items.length > 0 ? (
              <div className="shrink-0">
                <p className="mt-3.5 text-[14.5px] text-ink-muted">{feelLabel}</p>
                <div role="group" aria-label={feelLabel} className="mt-1.5 flex flex-wrap gap-1.5">
                  {SYMPTOMS_BY_LAYER[layer].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSymptom(s)}
                      aria-pressed={symptom === s}
                      className="min-h-8 rounded-lg border border-line px-2.5 text-[14.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink aria-pressed:border-holo/60 aria-pressed:bg-holo/15 aria-pressed:text-ink"
                    >
                      {t.hologram.symptoms[s]}
                    </button>
                  ))}
                </div>
                {bones && (symptom === 'fracture' || symptom === 'crack') && (
                  <p className="mt-2 text-[13.5px] leading-snug text-warn">{t.hologram.complaintSuspect}</p>
                )}
                {canSave && symptom && (
                  // Şiddet tek satırda: ad, kaydırıcı ve değer yan yana (kart kısa alanda da sığar)
                  <label className="mt-3 flex items-center gap-3 text-[14.5px] text-ink-muted">
                    <span className="shrink-0">{t.complaintSave.severity}</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={severity}
                      onChange={(e) => setSeverity(Number(e.target.value))}
                      aria-valuetext={t.complaintSave.severityValue(severity)}
                      className="min-w-0 flex-1 accent-[var(--color-holo)]"
                    />
                    <span className="tabular w-10 shrink-0 text-right font-mono text-ink">{t.complaintSave.severityValue(severity)}</span>
                  </label>
                )}
                {bones ? (
                  // Kemiklerde durum kişinin kendi sözleriyle yazılabilir; "Diğer" seçildiyse zorunludur
                  <label className="mt-3 block">
                    <span className="text-[14.5px] text-ink-muted">{symptom === 'other' ? t.hologram.complaintDescribe : t.hologram.complaintDescribeOptional}</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      maxLength={500}
                      required={symptom === 'other'}
                      placeholder={t.hologram.complaintDescribePlaceholder}
                      className="mt-1 w-full resize-none rounded-lg border border-line bg-base/70 px-2.5 py-1.5 text-[14.5px] text-ink outline-none placeholder:text-ink-dim focus:border-holo/45"
                    />
                  </label>
                ) : (
                  canSave &&
                  symptom &&
                  (noteOpen ? (
                    <label className="mt-2 block">
                      <span className="text-[14.5px] text-ink-muted">{t.complaintSave.note}</span>
                      <textarea
                        autoFocus
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder={t.complaintSave.notePlaceholder}
                        className="mt-1 w-full resize-none rounded-lg border border-line bg-base/70 px-2.5 py-1.5 text-[14.5px] text-ink outline-none placeholder:text-ink-dim focus:border-holo/45"
                      />
                    </label>
                  ) : (
                    <button type="button" onClick={() => setNoteOpen(true)} className="mt-1.5 flex min-h-8 items-center gap-1 rounded-md text-[14.5px] text-ink-muted transition-colors hover:text-holo">
                      <Plus size={14} aria-hidden />
                      {t.complaintSave.addNote}
                    </button>
                  ))
                )}
                <button
                  ref={submitRef}
                  type="button"
                  onClick={() => {
                    if (!symptom || needsNote) return
                    const text = note.trim()
                    if (canSave) onSave(symptom, severity, text)
                    onAsk(symptom, text)
                    setNote('')
                    setNoteOpen(false)
                  }}
                  disabled={!symptom || needsNote}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-holo/15 px-4 text-sm font-medium text-holo ring-1 ring-holo/30 transition-colors hover:bg-holo/20 disabled:cursor-not-allowed disabled:bg-white/[0.03] disabled:text-ink-dim disabled:ring-line"
                >
                  <MessageCircleHeart size={16} aria-hidden />
                  {canSave ? t.complaintSave.saveAsk : t.hologram.complaintAsk}
                </button>
                {/* Kemik formu daha uzun olduğu için belirti seçildikten sonra yönerge satırı yalnızca gerektiğinde ("Diğer"de not) görünür */}
                {(!bones || !symptom || needsNote) && (
                  <p className="mt-2 text-[13.5px] leading-snug text-ink-dim">
                    {!symptom ? t.hologram.complaintChoose : needsNote ? t.hologram.complaintDescribeRequired : t.hologram.complaintChange[layer]}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="mt-1 font-display text-[17px] leading-snug font-semibold text-ink">{t.hologram.complaintPick[layer]}</p>
                <p className="mt-1 text-[14.5px] leading-snug text-ink-muted">{t.hologram.complaintPickHint[layer]}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StageLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-dim" role="status">
      <div className="size-16 rounded-full border border-holo/30 border-t-holo motion-safe:animate-spin" />
      <p className="font-mono font-semibold text-[13.5px] tracking-[0.07em] uppercase">{label}</p>
    </div>
  )
}

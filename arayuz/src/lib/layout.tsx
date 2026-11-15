import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { MAIN_INDICATORS } from '../core/catalog'

/**
 * Düzenlenebilir arayüz: hangi bölümün görüneceği, nerede durduğu ve sabitlenip sabitlenmediği.
 * Üst bar bu düzenin parçası değildir, her zaman yerinde kalır.
 *
 * Dört sayfa, her biri bir amaca hizmet eder:
 * 1. Ana sayfa: genel durum (yaşamsal değerler, ruh hali, hologram, bilgi kartı, yapılacaklar)
 * 2. Zihinsel sağlık: check-in'ler, günlük ve testler, destek kütüphanesi (Cupola, nefes egzersizi, Dünya galerisi, zihin
 *    egzersizleri); acil destek üst çubuktaki Acil durum düğmesinde
 * 3. Spor: hologram antrenör, günün programı, koç
 * 4. Sağlık kayıtları: göstergeler ve grafikler, kan tahlilleri, rapor ve hekimle iletişim, ortam, geçmiş
 */

export type VitalTool = (typeof MAIN_INDICATORS)[number]
export type ToolId =
  | VitalTool
  | 'hologram'
  | 'panel'
  | 'todo'
  | 'checkins'
  | 'actions'
  | 'library'
  | 'trainer'
  | 'program'
  | 'coach'
  | 'explorer'
  | 'labs'
  | 'report'
  | 'environment'
  | 'history'

export const VITAL_TOOLS: VitalTool[] = [...MAIN_INDICATORS]

/** Her sayfanın standart bölümleri ("Tüm bölümleri ekle" bunları getirir) */
export const PAGE_TOOLS: ToolId[][] = [
  [...MAIN_INDICATORS, 'hologram', 'panel', 'todo'],
  ['checkins', 'actions', 'library'],
  ['trainer', 'program', 'coach'],
  ['explorer', 'report', 'labs', 'environment', 'history'],
]
export const TOOL_IDS: ToolId[] = PAGE_TOOLS.flat()

/** Bölümün asıl sayfası */
export const homePage = (id: ToolId) => PAGE_TOOLS.findIndex((ids) => ids.includes(id))

/** Ekran genişliği sınıfları: her biri kendi yerleşimini ayrı saklar */
export type Bp = 'lg' | 'md' | 'xs'
export const COLS: Record<Bp, number> = { lg: 20, md: 6, xs: 2 }
// Geniş ekranda satırlar arası 12 px: 26 satır, büyütülen yazılarla uzayan üst barın altına 1440×900 ekranda da sığar
export const MARGIN: Record<Bp, [number, number]> = { lg: [14, 12], md: [12, 12], xs: [12, 12] }

/** Ekran genişliğine göre sınıf; sayfanın geri kalanındaki lg (1024) ve sm (640) eşikleriyle aynı */
export function breakpointFor(viewportWidth: number): Bp {
  if (viewportWidth >= 1024) return 'lg'
  if (viewportWidth >= 640) return 'md'
  return 'xs'
}

/** Geniş ekranda varsayılan düzen bu kadar satırdır; satır yüksekliği bu satırlar ekrana sığacak şekilde hesaplanır */
export const LG_ROWS = 26
/** Yaşamsal değer kartının içeriği 3 satıra sığsın diye alt sınır */
export const LG_MIN_ROW = 18
/** Dar ekranlarda sayfa kaydığı için satır yüksekliği sabittir */
export const SMALL_ROW = 20

export interface Pos {
  x: number
  y: number
  w: number
  h: number
}
type Positions = Record<ToolId, Pos>

const p = (x: number, y: number, w: number, h: number): Pos => ({ x, y, w, h })

/** Varsayılan yerleşim: her bölüm kendi sayfasındaki yerinde */
const DEFAULT_POSITIONS: Record<Bp, Positions> = {
  lg: {
    hr: p(0, 0, 5, 3),
    bp: p(5, 0, 5, 3),
    spo2: p(10, 0, 5, 3),
    temp: p(15, 0, 5, 3),
    glucose: p(0, 3, 5, 3),
    sleep: p(5, 3, 5, 3),
    radiation: p(10, 3, 5, 3),
    mood: p(15, 3, 5, 3),
    hologram: p(0, 6, 8, 20),
    panel: p(8, 6, 7, 20),
    todo: p(15, 6, 5, 20),
    checkins: p(0, 0, 11, 15),
    actions: p(11, 0, 9, 15),
    library: p(0, 15, 20, 11),
    trainer: p(0, 0, 10, 26),
    program: p(10, 0, 10, 12),
    coach: p(10, 12, 10, 14),
    explorer: p(0, 0, 12, 13),
    report: p(12, 0, 8, 13),
    labs: p(0, 13, 7, 13),
    environment: p(7, 13, 5, 13),
    history: p(12, 13, 8, 13),
  },
  md: {
    hr: p(0, 0, 2, 3),
    bp: p(2, 0, 2, 3),
    spo2: p(4, 0, 2, 3),
    temp: p(0, 3, 2, 3),
    glucose: p(2, 3, 2, 3),
    sleep: p(4, 3, 2, 3),
    radiation: p(0, 6, 2, 3),
    mood: p(2, 6, 4, 3),
    hologram: p(0, 9, 6, 17),
    todo: p(0, 26, 6, 13),
    panel: p(0, 39, 6, 20),
    checkins: p(0, 0, 6, 15),
    actions: p(0, 15, 6, 10),
    library: p(0, 25, 6, 16),
    trainer: p(0, 0, 6, 15),
    program: p(0, 15, 6, 17),
    coach: p(0, 32, 6, 16),
    explorer: p(0, 0, 6, 15),
    report: p(0, 15, 6, 14),
    labs: p(0, 29, 6, 15),
    environment: p(0, 44, 6, 13),
    history: p(0, 57, 6, 14),
  },
  // Telefonda gösterge kartları 4 satır: referans aralığı iki satıra sığar
  xs: {
    hr: p(0, 0, 1, 4),
    bp: p(1, 0, 1, 4),
    spo2: p(0, 4, 1, 4),
    temp: p(1, 4, 1, 4),
    glucose: p(0, 8, 1, 4),
    sleep: p(1, 8, 1, 4),
    radiation: p(0, 12, 1, 4),
    mood: p(1, 12, 1, 4),
    hologram: p(0, 16, 2, 17),
    todo: p(0, 33, 2, 14),
    panel: p(0, 47, 2, 20),
    checkins: p(0, 0, 2, 26),
    actions: p(0, 26, 2, 12),
    library: p(0, 38, 2, 34),
    trainer: p(0, 0, 2, 15),
    program: p(0, 15, 2, 20),
    coach: p(0, 35, 2, 19),
    explorer: p(0, 0, 2, 16),
    report: p(0, 16, 2, 16),
    labs: p(0, 32, 2, 17),
    environment: p(0, 49, 2, 15),
    history: p(0, 64, 2, 16),
  },
}

/** Yan yana sayfalar (soldan sağa); arayüz ana sayfada açılır */
export const PAGE_COUNT = 4
export const MAIN_PAGE = 0
export const MIND_PAGE = 1
export const SPORT_PAGE = 2
export const DOCTOR_PAGE = 3

/** Bir sayfanın düzeni: hangi bölüm görünür, sabit mi, nerede */
export interface PageLayout {
  visible: Record<ToolId, boolean>
  pinned: Record<ToolId, boolean>
  positions: Record<Bp, Positions>
}

/** Bir profilin düzeni: her sayfanın kendi düzeni vardır; aynı bölüm birden fazla sayfada bulunabilir */
export interface DashboardLayout {
  pages: PageLayout[]
}

const BPS: Bp[] = ['lg', 'md', 'xs']
const KEY = 'vitalis.layout'
/**
 * 5: dört amaçlı sayfa, yeni bölümler (yaşamsal değerler katalog kimlikleriyle). Önceki sürümlerin bölüm kimlikleri ve
 * sayfa yapısı farklı olduğu için eski kayıtlar bir kez yeni varsayılan düzene döner ve kullanıcıya bildirilir.
 * 6: zihinsel sağlık sayfası yenilendi (cupola, breathing, moodCheck, journal yerine checkins, emergency, library).
 * 8: zihinsel sağlık sayfasında acil destek bölümü yerine günlük ve testler (actions) geldi; kutular videolu.
 * 9: aynı sayfada üst sıra bir satır uzadı (check-in kutusunda ayrıntılar açılınca başlık filigrana binmesin).
 * 10: sağ üst "Kendini tanı" oldu (zihin egzersizleri ve testler, videolu); üst sıra bir satır daha uzadı.
 */
const VERSION = 11

const toolMap = (fn: (id: ToolId) => boolean) => Object.fromEntries(TOOL_IDS.map((id) => [id, fn(id)])) as Record<ToolId, boolean>

/** Standart yerleşim: sayfanın kendi bölümleri görünür, sabit ve varsayılan yerinde */
export function standardPage(page: number): PageLayout {
  const own = PAGE_TOOLS[page] ?? []
  return { visible: toolMap((id) => own.includes(id)), pinned: toolMap((id) => own.includes(id)), positions: structuredClone(DEFAULT_POSITIONS) }
}

function defaults(): DashboardLayout {
  return { pages: Array.from({ length: PAGE_COUNT }, (_, i) => standardPage(i)) }
}

/* Izgara geometrisi */

const overlaps = (a: Pos, b: Pos) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function fits(pos: Pos, cols: number, others: Pos[]) {
  return pos.x >= 0 && pos.y >= 0 && pos.x + pos.w <= cols && others.every((o) => !overlaps(pos, o))
}

/** Yukarıdan aşağı, soldan sağa ilk boş yer. En kötü durumda en alttaki boş satırı bulur. */
function firstFree(w: number, h: number, cols: number, others: Pos[]): Pos {
  const limit = others.reduce((m, o) => Math.max(m, o.y + o.h), 0)
  for (let y = 0; y <= limit; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const pos = { x, y, w, h }
      if (fits(pos, cols, others)) return pos
    }
  }
  return { x: 0, y: limit, w, h }
}

/** Tercih edilen yere koyar; orası doluysa ya da ızgara dışındaysa ilk boş yere */
function place(pref: Pos, size: Pos, cols: number, others: Pos[]): Pos {
  const w = Math.min(size.w, cols)
  const h = size.h
  const x = Math.min(Math.max(0, Math.round(pref.x)), cols - w)
  const y = Math.max(0, Math.round(pref.y))
  const pos = { x, y, w, h }
  return fits(pos, cols, others) ? pos : firstFree(w, h, cols, others)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Bir sayfanın kayıtlı düzenini doğrular. Bozuk, eksik ya da çakışan kayıtlar varsayılana ya da ilk boş yere düzeltilir.
 * Boyutlar her zaman varsayılandan gelir; böylece bölüm boyutu değişse bile eski kayıt bozulmaz.
 */
function sanitizePage(raw: unknown, fallback: PageLayout): PageLayout {
  const base = structuredClone(fallback)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<Record<keyof PageLayout, unknown>>
  const visible = (r.visible ?? {}) as Record<string, unknown>
  const pinned = (r.pinned ?? {}) as Record<string, unknown>
  const positions = (r.positions ?? {}) as Record<string, Record<string, Partial<Pos>> | undefined>

  for (const id of TOOL_IDS) {
    if (typeof visible[id] === 'boolean') base.visible[id] = visible[id] as boolean
    if (typeof pinned[id] === 'boolean') base.pinned[id] = pinned[id] as boolean
  }

  for (const bp of BPS) {
    const cols = COLS[bp]
    const saved = positions[bp] ?? {}
    const pref = (id: ToolId): Pos => {
      const s = saved[id]
      const d = DEFAULT_POSITIONS[bp][id]
      return s && isNum(s.x) && isNum(s.y) ? { x: s.x, y: s.y, w: d.w, h: d.h } : d
    }
    // Önce sabit bölümler yerleşir ki yerleri korunsun, sonra diğerleri yukarıdan aşağı
    const order = TOOL_IDS.filter((id) => base.visible[id]).sort((a, b) => {
      if (base.pinned[a] !== base.pinned[b]) return base.pinned[a] ? -1 : 1
      const pa = pref(a)
      const pb = pref(b)
      return pa.y - pb.y || pa.x - pb.x
    })
    const placed: Pos[] = []
    for (const id of order) {
      const pos = place(pref(id), DEFAULT_POSITIONS[bp][id], cols, placed)
      base.positions[bp][id] = pos
      placed.push(pos)
    }
    // Gizli bölümlerin son yeri hatırlanır; gösterilince oraya (boşsa) döner
    for (const id of TOOL_IDS.filter((t) => !base.visible[t])) {
      const d = DEFAULT_POSITIONS[bp][id]
      const pos = pref(id)
      base.positions[bp][id] = { x: Math.min(Math.max(0, Math.round(pos.x)), cols - d.w), y: Math.max(0, Math.round(pos.y)), w: d.w, h: d.h }
    }
  }
  return base
}

function sanitizeLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== 'object') return defaults()
  const r = raw as { pages?: unknown }
  if (!Array.isArray(r.pages)) return defaults()
  const list = r.pages as unknown[]
  return { pages: Array.from({ length: PAGE_COUNT }, (_, i) => sanitizePage(list[i], standardPage(i))) }
}

const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Sayfa standart yerleşimde mi: kendi bölümleri görünür, sabit ve varsayılan yerinde; başka bölüm yok */
export function isStandardPage(pl: PageLayout, page: number) {
  const own = PAGE_TOOLS[page] ?? []
  return TOOL_IDS.every((id) =>
    own.includes(id) ? pl.visible[id] && pl.pinned[id] && BPS.every((bp) => samePos(pl.positions[bp][id], DEFAULT_POSITIONS[bp][id])) : !pl.visible[id],
  )
}

/** Düzen ilk halinde mi: her sayfa standart */
export function isDefaultLayout(l: DashboardLayout) {
  return l.pages.every((pl, i) => isStandardPage(pl, i))
}

/* Profiller: her biri kendi düzenini saklar, biri etkindir */

export const PROFILE_COUNT = 3

interface Store {
  active: number
  profiles: DashboardLayout[]
}

const freshStore = (): Store => ({ active: 0, profiles: Array.from({ length: PROFILE_COUNT }, defaults) })

/** Kayıt yüklenir; eski sürümden geldiyse yeni varsayılana dönüldüğü bildirilir */
function load(): { store: Store; migrated: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { store: freshStore(), migrated: false }
    const data = JSON.parse(raw) as { version?: unknown; active?: unknown; profiles?: unknown }
    if (data?.version === VERSION && Array.isArray(data.profiles)) {
      const list = data.profiles as unknown[]
      const a = data.active
      const active = typeof a === 'number' && Number.isInteger(a) && a >= 0 && a < PROFILE_COUNT ? a : 0
      return { store: { active, profiles: Array.from({ length: PROFILE_COUNT }, (_, i) => sanitizeLayout(list[i])) }, migrated: false }
    }
    // Eski sürüm (1-5): bölüm kimlikleri ve sayfalar değişti
    return { store: freshStore(), migrated: true }
  } catch {
    /* Bozuk kayıt: varsayılana dönülür */
  }
  return { store: freshStore(), migrated: false }
}

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

export function useDashboardLayout() {
  const [initial] = useState(load)
  const [store, setStore] = useState<Store>(initial.store)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...store }))
    } catch {
      /* Depolama kapalıysa düzen yalnızca bu oturumda geçerli olur */
    }
  }, [store])

  /** Etkin profilin bir sayfasını değiştirir; değişiklik yoksa durumu aynen bırakır */
  const updatePage = useCallback((page: number, fn: (pl: PageLayout) => PageLayout) => {
    setStore((s) => {
      const layout = s.profiles[s.active]
      const cur = layout.pages[page]
      if (!cur) return s
      const next = fn(cur)
      if (next === cur) return s
      const pages = layout.pages.slice()
      pages[page] = next
      const profiles = s.profiles.slice()
      profiles[s.active] = { pages }
      return { ...s, profiles }
    })
  }, [])

  /** Bölümü bir sayfada gösterir ya da gizler. Gösterilen bölüm sabitlenmemiş gelir ki kullanıcı onu yerleştirebilsin. */
  const setVisible = useCallback(
    (page: number, id: ToolId, value: boolean) => {
      updatePage(page, (pl) => {
        if (pl.visible[id] === value) return pl
        if (!value) return { ...pl, visible: { ...pl.visible, [id]: false } }
        const positions = { ...pl.positions }
        for (const bp of BPS) {
          const others = TOOL_IDS.filter((t) => t !== id && pl.visible[t]).map((t) => pl.positions[bp][t])
          positions[bp] = { ...positions[bp], [id]: place(pl.positions[bp][id], DEFAULT_POSITIONS[bp][id], COLS[bp], others) }
        }
        return { visible: { ...pl.visible, [id]: true }, pinned: { ...pl.pinned, [id]: false }, positions }
      })
    },
    [updatePage],
  )

  const togglePin = useCallback(
    (page: number, id: ToolId) => updatePage(page, (pl) => ({ ...pl, pinned: { ...pl.pinned, [id]: !pl.pinned[id] } })),
    [updatePage],
  )

  /** Sürükle-bırak sonrası ızgaradan gelen konumları kaydeder */
  const commit = useCallback(
    (page: number, bp: Bp, items: readonly LayoutItem[]) => {
      updatePage(page, (pl) => {
        let next: Positions | null = null
        for (const it of items) {
          const id = it.i as ToolId
          if (!TOOL_IDS.includes(id) || !pl.visible[id]) continue
          const cur = pl.positions[bp][id]
          if (cur.x === it.x && cur.y === it.y) continue
          next ??= { ...pl.positions[bp] }
          next[id] = { ...cur, x: it.x, y: it.y }
        }
        return next ? { ...pl, positions: { ...pl.positions, [bp]: next } } : pl
      })
    },
    [updatePage],
  )

  const setActive = useCallback((index: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= PROFILE_COUNT) return
    setStore((s) => (s.active === index ? s : { ...s, active: index }))
  }, [])

  /** Belirli bir profilin düzenini yerine koyar (sıfırlama ve geri alma için) */
  const replaceProfile = useCallback((index: number, layout: DashboardLayout) => {
    setStore((s) => {
      const profiles = s.profiles.slice()
      profiles[index] = layout
      return { ...s, profiles }
    })
  }, [])

  const layout = store.profiles[store.active]
  const customized = useMemo(() => store.profiles.map((pr) => !isDefaultLayout(pr)), [store.profiles])

  /** Etkin profili ilk haline döndürür; geri alınabilmesi için önceki düzeni verir */
  const reset = useCallback(() => {
    const index = store.active
    const previous = store.profiles[index]
    replaceProfile(index, defaults())
    return { index, previous }
  }, [store, replaceProfile])

  /** Bir sayfaya kendi bölümlerini standart yerleşimle getirir; geri alınabilmesi için önceki düzeni verir */
  const showAll = useCallback(
    (page: number) => {
      const index = store.active
      const previous = store.profiles[index]
      updatePage(page, () => standardPage(page))
      return { index, previous }
    },
    [store, updatePage],
  )

  /** Bir sayfadaki bütün bölümleri kaldırır; geri alınabilmesi için önceki düzeni verir */
  const hideAll = useCallback(
    (page: number) => {
      const index = store.active
      const previous = store.profiles[index]
      updatePage(page, (pl) => (TOOL_IDS.some((id) => pl.visible[id]) ? { ...pl, visible: toolMap(() => false) } : pl))
      return { index, previous }
    },
    [store, updatePage],
  )

  return {
    layout,
    active: store.active,
    customized,
    isDefault: !customized[store.active],
    /** Kayıt eski bir sürümden yeni varsayılana döndüyse true (bir kez bildirilir) */
    migrated: initial.migrated,
    setActive,
    reset,
    showAll,
    hideAll,
    restore: replaceProfile,
    setVisible,
    togglePin,
    commit,
  }
}

/** Bir bölüm herhangi bir sayfada görünüyor mu */
export function visibleAnywhere(l: DashboardLayout): Record<ToolId, boolean> {
  return Object.fromEntries(TOOL_IDS.map((id) => [id, l.pages.some((pl) => pl.visible[id])])) as Record<ToolId, boolean>
}

/** Uygulamanın herhangi bir yerinden "bu bölüm (herhangi bir sayfada) görünüyor mu?" sorusu için */
export const ToolVisibilityContext = createContext<Record<ToolId, boolean>>(toolMap(() => true))
export const useToolVisibility = () => useContext(ToolVisibilityContext)

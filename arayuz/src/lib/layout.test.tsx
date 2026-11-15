import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  COLS,
  DOCTOR_PAGE,
  homePage,
  isDefaultLayout,
  isStandardPage,
  MAIN_PAGE,
  MIND_PAGE,
  PAGE_COUNT,
  PAGE_TOOLS,
  PROFILE_COUNT,
  SPORT_PAGE,
  TOOL_IDS,
  useDashboardLayout,
  visibleAnywhere,
  type Pos,
} from './layout'

const KEY = 'vitalis.layout'
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')
const overlaps = (a: Pos, b: Pos) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('useDashboardLayout', () => {
  it('ilk açılışta dört sayfanın her biri kendi standart bölümleriyle gelir', () => {
    const { result } = renderHook(() => useDashboardLayout())
    const { layout } = result.current
    expect(layout.pages).toHaveLength(PAGE_COUNT)
    for (let p = 0; p < PAGE_COUNT; p++) {
      expect(isStandardPage(layout.pages[p], p)).toBe(true)
      for (const id of TOOL_IDS) expect(layout.pages[p].visible[id]).toBe(PAGE_TOOLS[p].includes(id))
    }
    expect(result.current.active).toBe(0)
    expect(result.current.isDefault).toBe(true)
    expect(result.current.migrated).toBe(false)
    expect(result.current.customized).toEqual(Array(PROFILE_COUNT).fill(false))
  })

  it('sayfaların bölümleri doğru yerde: ana sayfa, zihinsel sağlık, spor, sağlık kayıtları', () => {
    expect(homePage('todo')).toBe(MAIN_PAGE)
    expect(homePage('hr')).toBe(MAIN_PAGE)
    expect(homePage('checkins')).toBe(MIND_PAGE)
    expect(homePage('actions')).toBe(MIND_PAGE)
    expect(homePage('library')).toBe(MIND_PAGE)
    expect(homePage('trainer')).toBe(SPORT_PAGE)
    expect(homePage('labs')).toBe(DOCTOR_PAGE)
    // Bir bölüm yalnızca bir sayfanın standardıdır
    expect(new Set(TOOL_IDS).size).toBe(TOOL_IDS.length)
  })

  it('standart yerleşimde her sayfanın bölümleri ızgaraya sığar ve çakışmaz', () => {
    const { result } = renderHook(() => useDashboardLayout())
    for (let p = 0; p < PAGE_COUNT; p++) {
      const page = result.current.layout.pages[p]
      for (const bp of ['lg', 'md', 'xs'] as const) {
        const shown = PAGE_TOOLS[p].map((id) => page.positions[bp][id])
        for (const pos of shown) expect(pos.x + pos.w).toBeLessThanOrEqual(COLS[bp])
        for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(overlaps(shown[i], shown[j])).toBe(false)
      }
    }
  })

  it('düzen sürüm 10 olarak kaydedilir', () => {
    renderHook(() => useDashboardLayout())
    const data = saved()
    expect(data.version).toBe(11)
    expect(data.profiles).toHaveLength(PROFILE_COUNT)
  })

  it('bozuk kayıtta varsayılana döner', () => {
    localStorage.setItem(KEY, '{bozuk')
    const { result } = renderHook(() => useDashboardLayout())
    expect(isDefaultLayout(result.current.layout)).toBe(true)
  })

  it.each([4, 5, 6, 7, 8, 9])('eski sürüm (%i) kaydı bir kez yeni varsayılana döner ve bildirilir', (version) => {
    // Sürüm 5: zihinsel sağlık sayfasının eski bölümleri (cupola, breathing, moodCheck, journal)
    localStorage.setItem(KEY, JSON.stringify({ version, active: 2, profiles: [] }))
    const { result } = renderHook(() => useDashboardLayout())
    expect(result.current.migrated).toBe(true)
    expect(result.current.active).toBe(0)
    expect(isDefaultLayout(result.current.layout)).toBe(true)
    expect(result.current.layout.pages[MIND_PAGE].visible.checkins).toBe(true)
    expect(saved().version).toBe(11)
    // İkinci açılışta yeniden bildirilmez
    expect(renderHook(() => useDashboardLayout()).result.current.migrated).toBe(false)
  })

  it('başka sayfada gösterilen bölüm sabitlenmemiş gelir ve diğerleriyle çakışmaz', () => {
    const { result } = renderHook(() => useDashboardLayout())
    act(() => {
      result.current.setVisible(MIND_PAGE, 'hr', true)
      result.current.setVisible(MIND_PAGE, 'spo2', true)
    })
    const page = result.current.layout.pages[MIND_PAGE]
    expect(page.visible.hr && page.visible.spo2).toBe(true)
    expect(page.pinned.hr).toBe(false)
    for (const bp of ['lg', 'md', 'xs'] as const) {
      const ids = [...PAGE_TOOLS[MIND_PAGE], 'hr', 'spo2'] as const
      const shown = ids.map((id) => page.positions[bp][id])
      for (const p of shown) expect(p.x + p.w).toBeLessThanOrEqual(COLS[bp])
      for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(overlaps(shown[i], shown[j])).toBe(false)
    }
    expect(visibleAnywhere(result.current.layout).hr).toBe(true)
    expect(result.current.isDefault).toBe(false)
  })

  it('sabitleme ve sürükleme sonucu kaydedilir, yenilemede korunur', () => {
    const { result, unmount } = renderHook(() => useDashboardLayout())
    act(() => result.current.togglePin(MAIN_PAGE, 'panel'))
    expect(result.current.layout.pages[MAIN_PAGE].pinned.panel).toBe(false)
    const panel = result.current.layout.pages[MAIN_PAGE].positions.lg.panel
    act(() => result.current.commit(MAIN_PAGE, 'lg', [{ i: 'panel', x: panel.x, y: panel.y + 3, w: panel.w, h: panel.h }]))
    expect(result.current.layout.pages[MAIN_PAGE].positions.lg.panel.y).toBe(panel.y + 3)
    unmount()

    const again = renderHook(() => useDashboardLayout())
    const page = again.result.current.layout.pages[MAIN_PAGE]
    expect(page.pinned.panel).toBe(false)
    expect(page.positions.lg.panel.y).toBe(panel.y + 3)
  })

  it('her profil kendi düzenini tutar', () => {
    const { result } = renderHook(() => useDashboardLayout())
    act(() => result.current.setVisible(MAIN_PAGE, 'sleep', false))
    expect(result.current.customized).toEqual([true, false, false])
    act(() => result.current.setActive(1))
    expect(result.current.active).toBe(1)
    expect(result.current.layout.pages[MAIN_PAGE].visible.sleep).toBe(true)
    act(() => result.current.setActive(7))
    expect(result.current.active).toBe(1)
  })

  it('sıfırlama ilk hale döner ve önceki düzenle geri alınabilir', () => {
    const { result } = renderHook(() => useDashboardLayout())
    act(() => result.current.setVisible(MAIN_PAGE, 'radiation', false))
    let undo: ReturnType<typeof result.current.reset> | undefined
    act(() => {
      undo = result.current.reset()
    })
    expect(result.current.isDefault).toBe(true)
    act(() => result.current.restore(undo!.index, undo!.previous))
    expect(result.current.layout.pages[MAIN_PAGE].visible.radiation).toBe(false)
  })

  it('bir sayfadaki bütün bölümler kaldırılıp o sayfanın standart yerleşimiyle geri getirilebilir', () => {
    const { result } = renderHook(() => useDashboardLayout())
    act(() => {
      result.current.hideAll(SPORT_PAGE)
    })
    expect(TOOL_IDS.some((id) => result.current.layout.pages[SPORT_PAGE].visible[id])).toBe(false)
    act(() => {
      result.current.showAll(SPORT_PAGE)
    })
    expect(isStandardPage(result.current.layout.pages[SPORT_PAGE], SPORT_PAGE)).toBe(true)
  })
})

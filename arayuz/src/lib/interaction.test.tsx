import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localBackend, type Backend } from '../data/backend'
import { HealthProvider, useHealth } from '../data/health'
import { LanguageProvider } from '../i18n'
import { useCheckinAutoPrompt } from '../mind/checkinPrompt'
import { activeInteractions, beginInteraction, isTextEntryActive, resetInteractions, useIdle } from './interaction'
import { SettingsProvider } from './settings'

/*
 * Etkileşim koordinasyonu: kişi meşgulken (pencere, form, nefes egzersizi, tur…) otomatik içerik açılmaz;
 * boş an, meşguliyet bittikten ve bir süre sessiz geçtikten sonra gelir.
 */

beforeEach(() => resetInteractions())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('etkileşim koordinasyonu', () => {
  it('etkileşimler başlatılır ve bitirilir; bitirme işlevi tekrar çağrılabilir', () => {
    const endA = beginInteraction('breathing')
    const endB = beginInteraction('dialog')
    expect(activeInteractions().sort()).toEqual(['breathing', 'dialog'])
    endA()
    endA()
    expect(activeInteractions()).toEqual(['dialog'])
    endB()
    expect(activeInteractions()).toEqual([])
  })

  it('yazı alanındaki odağı tanır (düğme ve onay kutusu yazı sayılmaz)', () => {
    document.body.innerHTML = '<textarea id="a"></textarea><input id="b" type="text"><input id="c" type="checkbox"><button id="d">x</button>'
    const focus = (id: string) => (document.getElementById(id) as HTMLElement).focus()
    focus('a')
    expect(isTextEntryActive()).toBe(true)
    focus('b')
    expect(isTextEntryActive()).toBe(true)
    focus('c')
    expect(isTextEntryActive()).toBe(false)
    focus('d')
    expect(isTextEntryActive()).toBe(false)
  })

  it('boş an sessizlik süresinden sonra gelir; meşguliyet onu bitirir ve sayaç baştan başlar', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useIdle(1000))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)

    let end = () => {}
    act(() => {
      end = beginInteraction('breathing')
    })
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)

    act(() => end())
    // Egzersiz biter bitmez bir şey açılmaz
    act(() => vi.advanceTimersByTime(900))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe(true)
  })

  it('yazı alanında odak varken boş an yoktur', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<textarea id="note"></textarea>'
    const { result } = renderHook(() => useIdle(0))
    act(() => vi.advanceTimersByTime(10))
    expect(result.current).toBe(true)
    act(() => {
      document.getElementById('note')!.focus()
      vi.advanceTimersByTime(10)
    })
    expect(result.current).toBe(false)
    act(() => {
      ;(document.activeElement as HTMLElement).blur()
      vi.advanceTimersByTime(10)
    })
    expect(result.current).toBe(true)
  })
})

describe('otomatik check-in sorusu', () => {
  function wrapperFor(backend: Backend) {
    return ({ children }: { children: ReactNode }) => (
      <LanguageProvider>
        <SettingsProvider>
          <HealthProvider backend={backend}>{children}</HealthProvider>
        </SettingsProvider>
      </LanguageProvider>
    )
  }

  it('açık pencerede, boş anda ve yalnızca bir kez önerilir; meşgulken beklenir', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 12, 9))
    const backend = localBackend()
    const { result: hook } = renderHook(() => ({ prompt: useCheckinAutoPrompt(0), health: useHealth() }), { wrapper: wrapperFor(backend) })
    const result = { get current() { return hook.current.prompt } }
    await vi.waitFor(() => expect(result.current?.key).toBe('2026-11-12:morning'))

    // Kişi bir pencere açınca öneri geri çekilir
    let end = () => {}
    act(() => {
      end = beginInteraction('dialog')
    })
    expect(result.current).toBeNull()
    act(() => end())
    await vi.waitFor(() => expect(result.current?.key).toBe('2026-11-12:morning'))

    // Gösterildikten sonra bir daha önerilmez
    await backend.call('markCheckinPrompted', 'yildiz', '2026-11-12:morning')
    act(() => hook.current.health.refresh())
    await vi.waitFor(() => expect(result.current).toBeNull())
  })

  it('hekim görünümünde önerilmez', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 10, 12, 9))
    localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'surgeon', self: 'yildiz', viewing: 'yildiz' }))
    const { result } = renderHook(() => useCheckinAutoPrompt(0), { wrapper: wrapperFor(localBackend()) })
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current).toBeNull()
  })
})

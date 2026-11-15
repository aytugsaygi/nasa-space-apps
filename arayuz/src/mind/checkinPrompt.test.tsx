import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localBackend, type Backend } from '../data/backend'
import { HealthProvider } from '../data/health'
import { LanguageProvider } from '../i18n'
import { beginInteraction, resetInteractions } from '../lib/interaction'
import { SettingsProvider } from '../lib/settings'
import { useEntryCheckin } from './checkinPrompt'

/*
 * Açılışta check-in (docs/wellbeing CI-03): açık ve çözülmemiş pencere bir kez, uygun boş anda kendiliğinden sunulur.
 * Sunum kaydı yeniden yüklemede de korunur; kaydedilmiş ve atlanmış pencere kendiliğinden açılmaz; acil destek sürerken beklenir.
 */

const MORNING = '2026-11-12:morning'

function wrapperFor(backend: Backend) {
  return ({ children }: { children: ReactNode }) => (
    <LanguageProvider>
      <SettingsProvider>
        <HealthProvider backend={backend}>{children}</HealthProvider>
      </SettingsProvider>
    </LanguageProvider>
  )
}

function backendAt(h: number): Backend {
  vi.setSystemTime(Date.UTC(2026, 10, 12, h))
  return localBackend()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetInteractions()
})
afterEach(() => vi.useRealTimers())

describe('açılışta check-in', () => {
  it('açık pencere bir kez sunulur; sunum yeniden yüklemede de korunur', async () => {
    const backend = backendAt(9)
    const first = renderHook(() => useEntryCheckin(true, 0), { wrapper: wrapperFor(backend) })
    await waitFor(() => expect(first.result.current.key).toBe(MORNING))
    expect(await backend.call('checkinWindow', 'yildiz', MORNING)).toMatchObject({ outcome: 'pending', autoPrompt: false })
    expect((await backend.call('checkinWindow', 'yildiz', MORNING))?.promptedAt).not.toBeNull()
    expect((await backend.call('checkinWindow', 'yildiz', MORNING))?.openedAt).not.toBeNull()
    act(() => first.result.current.close())
    expect(first.result.current.key).toBeNull()
    first.unmount()

    // Sayfa yenilendi: aynı kayıttan okuyan yeni bir tarayıcı motoru; form yeniden açılmaz
    const reloaded = renderHook(() => useEntryCheckin(true, 0), { wrapper: wrapperFor(localBackend()) })
    await new Promise((r) => setTimeout(r, 120))
    expect(reloaded.result.current.key).toBeNull()
  })

  it('kapalıyken (açılış sürerken, ?checkin=off) sunulmaz; elle açılabilir', async () => {
    const backend = backendAt(9)
    const { result } = renderHook(() => useEntryCheckin(false, 0), { wrapper: wrapperFor(backend) })
    await new Promise((r) => setTimeout(r, 120))
    expect(result.current.key).toBeNull()
    expect(await backend.call('checkinWindow', 'yildiz', MORNING)).toMatchObject({ promptedAt: null })
    act(() => result.current.open(MORNING))
    await waitFor(() => expect(result.current.key).toBe(MORNING))
  })

  it('kaydedilmiş ya da atlanmış pencere kendiliğinden açılmaz', async () => {
    for (const action of ['submitCheckin', 'skipCheckin'] as const) {
      const backend = backendAt(9)
      if (action === 'submitCheckin') await backend.call('submitCheckin', 'yildiz', MORNING, { mood: 'good' }, '')
      else await backend.call('skipCheckin', 'yildiz', MORNING)
      const { result, unmount } = renderHook(() => useEntryCheckin(true, 0), { wrapper: wrapperFor(backend) })
      await new Promise((r) => setTimeout(r, 120))
      expect(result.current.key).toBeNull()
      unmount()
      localStorage.clear()
    }
  })

  it.each(['emergency', 'form', 'dialog', 'breathing', 'library', 'message'] as const)('%s sürerken beklenir, bitince sunulur', async (reason) => {
    const backend = backendAt(9)
    const end = beginInteraction(reason)
    const { result } = renderHook(() => useEntryCheckin(true, 0), { wrapper: wrapperFor(backend) })
    await new Promise((r) => setTimeout(r, 120))
    expect(result.current.key).toBeNull()
    expect(await backend.call('checkinWindow', 'yildiz', MORNING)).toMatchObject({ promptedAt: null })
    act(() => end())
    await waitFor(() => expect(result.current.key).toBe(MORNING))
  })

  it('hekim görünümünde sunulmaz', async () => {
    localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'surgeon', self: 'yildiz', viewing: 'yildiz' }))
    const { result } = renderHook(() => useEntryCheckin(true, 0), { wrapper: wrapperFor(backendAt(9)) })
    await new Promise((r) => setTimeout(r, 120))
    expect(result.current.key).toBeNull()
  })
})

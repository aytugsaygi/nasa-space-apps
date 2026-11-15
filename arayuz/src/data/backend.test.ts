import { afterEach, describe, expect, it, vi } from 'vitest'
import { localBackend } from './backend'

/*
 * Sunucu yokken tarayıcıda çalışan motor (localStorage: vitalis.db).
 * Kesin check-in kaydı localStorage'a hemen yazılır; yazılamazsa check-in kesinleşmez (docs/wellbeing, CI-12).
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tarayıcı motoru: sayfa kapanırken kayıt', () => {
  it('gecikmeli yazma beklerken sayfa kapanırsa (pagehide) değişiklik hemen kalıcı yazılır', async () => {
    const b = localBackend()
    await b.call('updateProfile', 'yildiz', { weightKg: 70 })
    // Yazma henüz yapılmadı (150 ms gecikme)
    expect(localStorage.getItem('vitalis.db') ?? '').not.toContain('"weightKg":70')
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem('vitalis.db')).toContain('"weightKg":70')
    expect((await localBackend().call('profile', 'yildiz')).weightKg).toBe(70)
  })
})

describe('tarayıcı motoru: check-in kaydı', () => {
  it('kaydedilen check-in sayfa yenilenince korunur', async () => {
    const first = localBackend()
    const { key } = await first.call('currentCheckin', 'yildiz')
    const r = await first.call('submitCheckin', 'yildiz', key, { mood: 'good' }, 'yenilemeden sonra')
    expect(r.ok).toBe(true)
    // Yeni bir tarayıcı motoru (sayfa yenilemesi) aynı localStorage'tan okur
    const reloaded = localBackend()
    expect(await reloaded.call('checkinWindow', 'yildiz', key)).toMatchObject({ outcome: 'saved', record: { note: 'yenilemeden sonra' } })
    expect(await reloaded.call('checkinWindow', 'mori', key)).toMatchObject({ record: null })
  })

  it('localStorage yazılamazsa check-in kesinleşmez ve yeniden denenebilir', async () => {
    const b = localBackend()
    const { key } = await b.call('currentCheckin', 'yildiz')
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('dolu', 'QuotaExceededError')
    })
    expect(await b.call('submitCheckin', 'yildiz', key, { mood: 'low' }, '')).toMatchObject({ ok: false, error: 'storage', view: { record: null } })
    expect(await b.call('checkinWindow', 'yildiz', key)).toMatchObject({ record: null })
    setItem.mockRestore()
    expect((await b.call('submitCheckin', 'yildiz', key, { mood: 'low' }, '')).ok).toBe(true)
    expect(await localBackend().call('checkinWindow', 'yildiz', key)).toMatchObject({ outcome: 'saved' })
  })
})

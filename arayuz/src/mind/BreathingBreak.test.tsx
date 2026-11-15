import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BreathingSessionDoc } from '../core/breathingLog'
import { localBackend, type Backend } from '../data/backend'
import { dictFor, renderWithProviders } from '../test/render'
import { BreathingBreak } from './BreathingBreak'

/*
 * Nefes egzersizi (docs/wellbeing BR-01…BR-07): sorular tek tek (süre → ses → hangi ses → geçiş tıkı → hazır), seçince
 * kendiliğinden ilerleme, açılışta sessizlik, hareketi azaltma tercihi, prototip tempo uyarısı, oynatıcı ve ses. Ses
 * modülü taklit edilir: ortam sesinin ve tıkın ne zaman çaldığı ölçülür.
 */

type Ambience = 'waves' | 'birds' | 'fire' | 'rain'
const stopAmbience = vi.fn()
const startAmbience = vi.fn<(kind: Ambience) => (() => void) | null>(() => stopAmbience)
const playBreathTick = vi.fn<(phase: 'inhale' | 'exhale') => void>()
vi.mock('../lib/audio', () => ({
  startAmbience: (k: Ambience) => startAmbience(k),
  playBreathTick: (p: 'inhale' | 'exhale') => playBreathTick(p),
}))

function setReducedMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes('reduce'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(() => {
  for (const m of [startAmbience, stopAmbience, playBreathTick]) m.mockClear()
  startAmbience.mockImplementation(() => stopAmbience)
  setReducedMotion(false)
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

type B = ReturnType<typeof dictFor>['mindPage']['breath']
type User = ReturnType<typeof userEvent.setup>
const group = (name: string) => screen.findByRole('group', { name })
const option = async (g: string, name: string | RegExp) => within(await group(g)).getByRole('radio', { name })

/** Sorular tek tek: süre → ses (→ hangi ses) → geçiş tıkı → hazır → Başlat */
async function begin(user: User, b: B, o: { min?: number; audio?: Ambience | 'silent'; click?: boolean } = {}) {
  await user.click(await option(b.askDuration, b.minutes(o.min ?? 3)))
  const audio = o.audio ?? 'silent'
  await user.click(await option(b.askSound, audio === 'silent' ? b.soundNo : b.soundYes))
  if (audio !== 'silent') await user.click(await option(b.askSoundPick, new RegExp(`^${b.audioModes[audio]}`)))
  await user.click(await option(b.askClick, o.click ? b.clickYes : b.clickNo))
  await user.click(await screen.findByRole('button', { name: b.start }))
  await screen.findByRole('timer')
}

describe.each(['tr', 'en'] as const)('nefes egzersizi (%s)', (lang) => {
  const b = dictFor(lang).mindPage.breath

  it('sorular tek tek gelir; hiçbiri önceden seçili değil; seçince kendiliğinden ilerler; hiçbir şey kendiliğinden başlamaz', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    const duration = await group(b.askDuration)
    expect(within(duration).getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([1, 3, 5].map(b.minutes).map((m, i) => `${i + 1}${m}`))
    for (const r of within(duration).getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(screen.getByText(b.questionOf(1, 3))).toBeInTheDocument()
    expect(document.querySelectorAll('[data-question]')).toHaveLength(1)
    await user.click(within(duration).getByRole('radio', { name: b.minutes(1) }))
    const sound = await group(b.askSound)
    for (const r of within(sound).getAllByRole('radio')) expect(r).not.toBeChecked()
    // Geri: önceki soru, seçim korunur
    await user.click(screen.getByRole('button', { name: b.back }))
    expect(await option(b.askDuration, b.minutes(1))).toBeChecked()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(startAmbience).not.toHaveBeenCalled()
  })

  it('ses istenirse dört ses sunulur; seçerken hiçbir ses çalmaz; istenmezse ses sorusu atlanır', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    await user.click(await option(b.askDuration, b.minutes(3)))
    await user.click(await option(b.askSound, b.soundYes))
    const pick = await group(b.askSoundPick)
    expect(within(pick).getAllByRole('radio')).toHaveLength(4)
    for (const a of ['waves', 'birds', 'fire', 'rain'] as const) expect(within(pick).getByRole('radio', { name: new RegExp(`^${b.audioModes[a]}`) })).toBeInTheDocument()
    await user.click(within(pick).getByRole('radio', { name: new RegExp(`^${b.audioModes.rain}`) }))
    await group(b.askClick)
    await user.click(await option(b.askClick, b.clickYes))
    await screen.findByRole('heading', { name: b.readyTitle })
    expect(startAmbience).not.toHaveBeenCalled()
    expect(playBreathTick).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: b.back }))
    await group(b.askClick)
    // Geri dönüp "hayır" deyince hangi ses sorusu atlanır
    await user.click(screen.getByRole('button', { name: b.back }))
    await group(b.askSoundPick)
    await user.click(screen.getByRole('button', { name: b.back }))
    await user.click(await option(b.askSound, b.soundNo))
    expect(await group(b.askClick)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: b.askSoundPick })).toBeNull()
  })

  it('hazır ekranı seçimleri özetler; bir satıra basınca o soruya gidilir ve cevaptan sonra özete dönülür', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    await user.click(await option(b.askDuration, b.minutes(5)))
    await user.click(await option(b.askSound, b.soundYes))
    await user.click(await option(b.askSoundPick, new RegExp(`^${b.audioModes.waves}`)))
    await user.click(await option(b.askClick, b.clickYes))
    await screen.findByRole('heading', { name: b.readyTitle })
    expect(document.querySelector('[data-summary="duration"]')).toHaveTextContent(b.minutes(5))
    expect(document.querySelector('[data-summary="sound"]')).toHaveTextContent(b.audioModes.waves)
    expect(document.querySelector('[data-summary="click"]')).toHaveTextContent(b.on)
    await user.click(document.querySelector<HTMLElement>('[data-summary="duration"]')!)
    expect(screen.getByRole('button', { name: b.toSummary })).toBeInTheDocument()
    await user.click(await option(b.askDuration, b.minutes(1)))
    await screen.findByRole('heading', { name: b.readyTitle })
    expect(document.querySelector('[data-summary="duration"]')).toHaveTextContent(b.minutes(1))
  })

  it('klavye: rakam seçer ve ilerler, ← geri döner', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    await group(b.askDuration)
    await user.keyboard('1')
    await group(b.askSound)
    await user.keyboard('{ArrowLeft}')
    expect(await option(b.askDuration, b.minutes(1))).toBeChecked()
  })

  it('tempo nefes tutmasızdır ve incelenmemiş prototip olduğu hazır ekranında görünür', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: b.next }))
    await screen.findByRole('heading', { name: b.readyTitle })
    expect(screen.getByText(b.pacing(5, 5))).toBeInTheDocument()
    expect(screen.getByText(b.pacingUnreviewed)).toBeInTheDocument()
    expect(document.querySelector('[data-pacing]')).toHaveAttribute('data-reviewed', 'false')
    // Cevaplanmayan sorular için varsayılanlar: 3 dakika, sessiz, tık kapalı
    expect(document.querySelector('[data-summary="duration"]')).toHaveTextContent(b.minutes(3))
    expect(document.querySelector('[data-summary="sound"]')).toHaveTextContent(b.audioModes.silent)
    expect(document.querySelector('[data-summary="click"]')).toHaveTextContent(b.off)
  })

  it('sessiz oturum ses çalmaz; süre üstte, yönerge ortada, tek duraklatma altta; süre dolunca tamamlama ekranı', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { min: 1 })
    expect(startAmbience).not.toHaveBeenCalled()
    expect(playBreathTick).not.toHaveBeenCalled()
    expect(screen.getByRole('timer', { name: b.timerLabel })).toHaveTextContent('01:00')
    expect(document.querySelector('[data-phase]')).toHaveTextContent(b.phase.inhale)
    expect(screen.getAllByRole('button').map((x) => x.textContent)).toEqual([b.pause])
    act(() => vi.advanceTimersByTime(5_400))
    expect(document.querySelector('[data-phase]')).toHaveTextContent(b.phase.exhale)
    act(() => vi.advanceTimersByTime(60_000))
    expect(await screen.findByRole('status')).toHaveTextContent(b.complete)
    expect(screen.getByRole('button', { name: b.skip })).toBeInTheDocument()
    for (const f of ['moreComfortable', 'aboutSame', 'moreUncomfortable', 'notSure'] as const) expect(screen.getByRole('button', { name: b.feedback[f] })).toBeInTheDocument()
  })

  it('geçiş tıkı açıksa her nefes al / ver değişiminde tık çalar (alırken ince, verirken kalın)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { min: 1, click: true })
    playBreathTick.mockClear()
    act(() => vi.advanceTimersByTime(5_300))
    expect(playBreathTick).toHaveBeenLastCalledWith('exhale')
    act(() => vi.advanceTimersByTime(5_000))
    expect(playBreathTick).toHaveBeenLastCalledWith('inhale')
    expect(playBreathTick).toHaveBeenCalledTimes(2)
  })

  it('tek zaman kaynağı: süre, evre ve küre aynı etkin süreden; duraklatma kalan süreyi ve evreyi birebir korur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { min: 1 })
    act(() => vi.advanceTimersByTime(7_000))
    await user.click(screen.getByRole('button', { name: b.pause }))
    const remaining = screen.getByRole('timer').getAttribute('data-remaining')
    const scale = (document.querySelector('[data-circle]') as HTMLElement).style.transform
    expect(document.querySelector('[data-phase]')).toHaveAttribute('data-phase', 'exhale')
    expect(document.querySelector('[data-phase]')).toHaveTextContent(b.paused)
    // Duraklatılan süre sayılmaz
    act(() => vi.advanceTimersByTime(120_000))
    expect(screen.getByRole('timer').getAttribute('data-remaining')).toBe(remaining)
    expect((document.querySelector('[data-circle]') as HTMLElement).style.transform).toBe(scale)
    await user.click(screen.getByRole('button', { name: b.resume }))
    expect(document.querySelector('[data-phase]')).toHaveAttribute('data-phase', 'exhale')
    expect(Number(screen.getByRole('timer').getAttribute('data-remaining'))).toBeGreaterThanOrEqual(Number(remaining) - 1)
  })

  it('sayfa gizlenince oturum duraklar, ses durur, gizli süre sayılmaz; dönünce kendiliğinden sürmez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { audio: 'waves' })
    act(() => vi.advanceTimersByTime(3_000))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(stopAmbience).toHaveBeenCalledTimes(1)
    expect(screen.getByText(b.pausedHidden)).toBeInTheDocument()
    const remaining = screen.getByRole('timer').getAttribute('data-remaining')
    act(() => vi.advanceTimersByTime(90_000))
    visibility.mockReturnValue('visible')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(screen.getByRole('timer').getAttribute('data-remaining')).toBe(remaining)
    expect(screen.getByRole('button', { name: b.resume })).toBeInTheDocument()
    expect(startAmbience).toHaveBeenCalledTimes(1)
    visibility.mockRestore()
  })

  it('ortam sesi yalnızca çalışırken çalar; duraklatma, erken bitirme ve kapatma sesi durdurur', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { audio: 'fire' })
    expect(startAmbience).toHaveBeenCalledTimes(1)
    expect(startAmbience).toHaveBeenLastCalledWith('fire')
    await user.click(screen.getByRole('button', { name: b.pause }))
    expect(stopAmbience).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: b.resume }))
    expect(startAmbience).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: b.pause }))
    await user.click(screen.getByRole('button', { name: b.finish }))
    expect(screen.getByRole('status')).toHaveTextContent(b.earlyEnd)
    expect(stopAmbience).toHaveBeenCalledTimes(2)
    // Ayarlara dönünce hazır ekranından başlanır
    await user.click(screen.getByRole('button', { name: b.settings }))
    await screen.findByRole('heading', { name: b.readyTitle })
    await user.click(screen.getByRole('button', { name: b.start }))
    expect(startAmbience).toHaveBeenCalledTimes(3)
    view.unmount()
    expect(stopAmbience).toHaveBeenCalledTimes(3)
  })

  it('tarayıcı ses çalamıyorsa söylenir ve mola sessiz sürer', async () => {
    startAmbience.mockImplementation(() => null)
    const user = userEvent.setup()
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b, { audio: 'birds' })
    expect(screen.getByText(b.audioUnavailable)).toBeInTheDocument()
    expect(document.querySelector('[data-phase]')).toHaveTextContent(b.phase.inhale)
  })

  it('hareketi azaltma tercihinde yalnızca sabit odak noktası var; hiçbir şey ölçeklenmez', async () => {
    setReducedMotion(true)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b)
    expect(document.querySelector('[data-visual]')).toHaveAttribute('data-visual', 'still')
    expect(document.querySelector('[data-circle]')).toBeNull()
    const point = document.querySelector('[data-focus-point]') as HTMLElement
    act(() => vi.advanceTimersByTime(5_600))
    expect(document.querySelector('[data-phase]')).toHaveTextContent(b.phase.exhale)
    expect(document.querySelector('[data-focus-point]')).toBe(point)
    expect(point.getAttribute('style')).toBeNull()
  })

  it('hareketi azaltma tercihi oturum sürerken açılırsa yeniden başlatmadan sabit görünüme geçer', async () => {
    const listeners = new Set<() => void>()
    let reduce = false
    window.matchMedia = ((query: string) => ({
      get matches() {
        return reduce && query.includes('reduce')
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    })) as unknown as typeof window.matchMedia
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />, { lang })
    await begin(user, b)
    act(() => vi.advanceTimersByTime(3_000))
    expect(document.querySelector('[data-visual]')).toHaveAttribute('data-visual', 'animated')
    const remaining = screen.getByRole('timer').getAttribute('data-remaining')
    reduce = true
    act(() => listeners.forEach((fn) => fn()))
    expect(document.querySelector('[data-visual]')).toHaveAttribute('data-visual', 'still')
    expect(screen.getByRole('timer').getAttribute('data-remaining')).toBe(remaining)
    expect(screen.getByRole('button', { name: b.pause })).toBeInTheDocument()
  })
})

describe('nefes egzersizi: kayıt ve geri bildirim', () => {
  const b = dictFor('tr').mindPage.breath
  const sessions = async (backend: Backend) => (await backend.call('breathingSessions', 'yildiz')) as BreathingSessionDoc[]

  it('tamamlanan oturum puansız üst bilgiyle (ses ve tık dahil) saklanır; geri bildirim eklenir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const backend = localBackend()
    renderWithProviders(<BreathingBreak />, { backend })
    await begin(user, b, { min: 1, audio: 'rain', click: true })
    act(() => vi.advanceTimersByTime(61_000))
    await waitFor(async () => expect(await sessions(backend)).toHaveLength(1))
    const [s] = await sessions(backend)
    expect(s).toMatchObject({ outcome: 'completed', plannedMs: 60_000, durationMin: 1, visual: 'animated', audio: 'rain', click: true, feedback: null })
    expect(s.activeMs).toBeLessThanOrEqual(60_000)
    expect(Object.keys(s)).not.toContain('score')
    await user.click(await screen.findByRole('button', { name: b.feedback.aboutSame }))
    expect(screen.getByText(b.thanks)).toBeInTheDocument()
    await waitFor(async () => expect((await sessions(backend))[0].feedback).toBe('aboutSame'))
  })

  it('erken bitirilen oturum yalnızca etkin süreyle saklanır; atla geri bildirim yazmaz', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const backend = localBackend()
    renderWithProviders(<BreathingBreak />, { backend })
    await begin(user, b)
    act(() => vi.advanceTimersByTime(10_000))
    await user.click(screen.getByRole('button', { name: b.pause }))
    act(() => vi.advanceTimersByTime(300_000))
    await user.click(screen.getByRole('button', { name: b.finish }))
    await waitFor(async () => expect(await sessions(backend)).toHaveLength(1))
    const [s] = await sessions(backend)
    expect(s.outcome).toBe('endedEarly')
    expect(s.activeMs).toBeLessThan(15_000)
    expect(s.feedback).toBeNull()
  })

  it('"daha rahatsız" yanıtı isteğe bağlı olarak bir insana ulaşma yollarını gösterir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onClose = vi.fn()
    renderWithProviders(<BreathingBreak onClose={onClose} />)
    await begin(user, b, { min: 1 })
    act(() => vi.advanceTimersByTime(61_000))
    await user.click(await screen.findByRole('button', { name: b.feedback.moreUncomfortable }))
    expect(screen.getByText(b.support)).toBeInTheDocument()
    expect(document.querySelector('[data-support]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: b.close }))
    expect(onClose).toHaveBeenCalled()
  })

  it('atla: geri bildirim istenmeden kapanır', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<BreathingBreak />)
    await begin(user, b, { min: 1 })
    act(() => vi.advanceTimersByTime(61_000))
    await user.click(await screen.findByRole('button', { name: b.skip }))
    expect(screen.queryByRole('button', { name: b.feedback.notSure })).toBeNull()
    expect(screen.queryByText(b.thanks)).toBeNull()
  })
})

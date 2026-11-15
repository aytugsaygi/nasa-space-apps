import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dictFor, renderWithProviders } from '../test/render'
import { CupolaDialog, CupolaLook } from './CupolaLook'
import { CUPOLA_SESSIONS } from './wellbeing'

/*
 * Destek kütüphanesindeki Cupola (docs/wellbeing CUP-01…CUP-04): dört manzara, her biri yerel bir video (sessiz, döngü);
 * durağan görüntü; video yüklenemezse durağan görüntüye düşme; ses yalnızca seçilince; aynı sayfada tam ekran (Esc önce
 * tam ekrandan çıkar). Ses modülü taklit edilir.
 */

const stopNoise = vi.fn()
const startNoise = vi.fn<() => (() => void) | null>(() => stopNoise)
vi.mock('../lib/audio', () => ({ startWhiteNoise: () => startNoise() }))

beforeEach(() => {
  startNoise.mockClear()
  stopNoise.mockClear()
  startNoise.mockImplementation(() => stopNoise)
  // jsdom video oynatamaz: play bir söz döndürür, hata vermez
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
})

describe.each(['tr', 'en'] as const)('Cupola (%s)', (lang) => {
  const c = dictFor(lang).mindPage.cupola
  const title = (id: string) => CUPOLA_SESSIONS.find((s) => s.id === id)!.title[lang]
  const video = () => document.querySelector<HTMLVideoElement>('video[data-video]')

  it('açılışta Sahra ve Nil videosu sessiz ve döngüde; ses kapalı; "yapay zekâ, canlı değil" yazılı', () => {
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    const v = video()!
    expect(v).toHaveAttribute('data-video', 'sahara')
    expect(v.getAttribute('src')).toMatch(/videos\/cupola\/sahara\.mp4$/)
    expect(v.getAttribute('poster')).toMatch(/videos\/cupola\/sahara\.jpg$/)
    expect(v.muted).toBe(true)
    expect(v.loop).toBe(true)
    expect(v).toHaveAttribute('aria-label', c.videoLabel(title('sahara')))
    expect(screen.getByRole('radio', { name: c.audioModes.silent })).toBeChecked()
    expect(screen.getByRole('radio', { name: c.modes.video })).toBeChecked()
    expect(document.querySelector('[data-credit]')).toHaveTextContent(c.credit)
    expect(startNoise).not.toHaveBeenCalled()
  })

  it('dört manzara var; seçim videoyu değiştirir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    const scenes = screen.getByRole('group', { name: c.scene })
    expect(within(scenes).getAllByRole('radio')).toHaveLength(4)
    for (const id of ['sunrise', 'ocean', 'cityLights', 'sahara'] as const) {
      await user.click(within(scenes).getByRole('radio', { name: title(id) }))
      expect(document.querySelector(`video[data-video="${id}"]`)).not.toBeNull()
    }
  })

  it('durağan görüntü tek karedir: video kalkar, filigranlı kare gelir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    await user.click(screen.getByRole('radio', { name: c.modes.still }))
    const img = await screen.findByRole('img', { name: c.stillAlt(title('sahara')) })
    expect(img.getAttribute('src')).toMatch(/videos\/cupola\/sahara\.jpg$/)
    expect(document.querySelector('video')).toBeNull()
  })

  it('hareketi azaltma tercihinde durağan görüntü ve açıklama gelir; istenirse videoya geçilir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CupolaLook reducedMotion />, { lang })
    expect(screen.getByRole('status')).toHaveTextContent(c.fallback.reduced)
    expect(document.querySelector('video')).toBeNull()
    await user.click(screen.getByRole('radio', { name: c.modes.video }))
    expect(video()).not.toBeNull()
  })

  it('video yüklenemezse boş ekran yerine durağan görüntü ve açıklama; video seçeneği kapanır', () => {
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    fireEvent.error(video()!)
    expect(screen.getByRole('status')).toHaveTextContent(c.fallback.videoError)
    expect(screen.getByRole('img', { name: c.stillAlt(title('sahara')) })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: c.modes.video })).toBeDisabled()
  })

  it('durağan görüntü de yüklenemezse açıklama gösterilir', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    await user.click(screen.getByRole('radio', { name: c.modes.still }))
    fireEvent.error(await screen.findByRole('img', { name: c.stillAlt(title('sahara')) }))
    expect(screen.getByRole('alert')).toHaveTextContent(c.stillFailed)
  })

  it('tam ekran düğmesi pencereyi aynı sayfada büyütür; Esc önce tam ekrandan çıkar, sonra pencereyi kapatır', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    function Harness() {
      return <CupolaDialog open onClose={onClose} />
    }
    renderWithProviders(<Harness />, { lang })
    const dialog = await screen.findByRole('dialog', { name: dictFor(lang).mindPage.library.cupola.title })
    expect(dialog).toHaveClass('md:w-[min(1080px,calc(100vw-3rem))]')
    expect(document.querySelector('[data-expanded]')).toHaveAttribute('data-expanded', 'false')
    await user.click(within(dialog).getByRole('button', { name: c.fullscreen }))
    expect(document.querySelector('[data-expanded]')).toHaveAttribute('data-expanded', 'true')
    expect(dialog).toHaveClass('md:w-[calc(100vw-1.5rem)]')
    expect(within(dialog).getByRole('button', { name: c.exitFullscreen })).toHaveAttribute('aria-pressed', 'true')
    // Esc: önce tam ekrandan çıkılır, pencere açık kalır
    await user.keyboard('{Escape}')
    expect(document.querySelector('[data-expanded]')).toHaveAttribute('data-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()
    // Yine Esc: pencere kapanır
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('başlıktaki alt satır seçilen manzarayı yazar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CupolaDialog open onClose={() => {}} />, { lang })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(title('sahara'), { selector: 'p' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: title('ocean') }))
    expect(within(dialog).getByText(title('ocean'), { selector: 'p' })).toBeInTheDocument()
  })

  it('beyaz gürültü yalnızca seçilince çalar; sessize alınca ve çıkışta durur', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    await user.click(screen.getByRole('radio', { name: c.audioModes.whiteNoise }))
    expect(startNoise).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('radio', { name: c.audioModes.silent }))
    expect(stopNoise).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('radio', { name: c.audioModes.whiteNoise }))
    view.unmount()
    expect(stopNoise).toHaveBeenCalledTimes(2)
  })

  it('ses çalınamıyorsa söylenir; Cupola sessiz sürer', async () => {
    startNoise.mockImplementation(() => null)
    const user = userEvent.setup()
    renderWithProviders(<CupolaLook reducedMotion={false} />, { lang })
    await user.click(screen.getByRole('radio', { name: c.audioModes.whiteNoise }))
    expect(screen.getByText(c.audioUnavailable)).toBeInTheDocument()
    expect(video()).not.toBeNull()
  })
})

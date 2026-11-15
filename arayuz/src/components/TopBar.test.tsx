import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SCENARIOS } from '../core/scenarios'
import { dictFor, renderWithProviders } from '../test/render'
import { TopBar } from './TopBar'

function setup(lang: 'tr' | 'en' = 'tr', unread = 0) {
  const props = {
    alerts: [],
    unread,
    buzzKey: 0,
    onOpenAlerts: vi.fn(),
    onScenario: vi.fn(),
    onResetDemo: vi.fn(),
    onStartTour: vi.fn(),
    onOpenSources: vi.fn(),
    onOpenAlert: vi.fn(),
    onOpenAssistant: vi.fn(),
    menuOpen: false,
    onOpenMenu: vi.fn(),
    showMenu: true,
  }
  renderWithProviders(<TopBar {...props} />, { lang })
  return props
}

describe('TopBar', () => {
  it('dil düğmeleri arayüz dilini değiştirir ve seçimi kaydeder', async () => {
    setup('tr')
    const group = screen.getByRole('group', { name: dictFor('tr').lang.label })
    expect(within(group).getByRole('button', { name: 'Türkçe' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(group).getByRole('button', { name: 'English' }))
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('vitalis.lang')).toBe('en')
    expect(screen.getByRole('button', { name: dictFor('en').topbar.startTour })).toBeInTheDocument()
  })

  it('ses ve titreşim anahtarları durumunu gösterir ve ayarlara kaydeder', async () => {
    const t = dictFor('tr')
    setup('tr')
    const sound = screen.getByRole('button', { name: t.topbar.soundLabel })
    expect(sound).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(sound)
    expect(sound).toHaveAttribute('aria-pressed', 'false')
    expect(JSON.parse(localStorage.getItem('vitalis.settings')!).sound).toBe(false)

    const vibration = screen.getByRole('button', { name: t.topbar.vibrationLabel })
    await userEvent.click(vibration)
    expect(vibration).toHaveAttribute('aria-pressed', 'false')
  })

  it('üst bar düğmeleri ilgili eylemi çağırır', async () => {
    const t = dictFor('tr')
    const props = setup('tr')
    await userEvent.click(screen.getByRole('button', { name: t.layout.openMenu }))
    await userEvent.click(screen.getByRole('button', { name: t.topbar.startTour }))
    await userEvent.click(screen.getByRole('button', { name: t.topbar.sources }))
    // Düğmede dar ekran için ikinci bir gizli yazı var; jsdom CSS uygulamadığı için ad ikisini birden içerir
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.topbar.assistant}`) }))
    expect(props.onOpenMenu).toHaveBeenCalledOnce()
    expect(props.onStartTour).toHaveBeenCalledOnce()
    expect(props.onOpenSources).toHaveBeenCalledOnce()
    expect(props.onOpenAssistant).toHaveBeenCalledOnce()
  })

  it('demo menüsü bütün senaryoları listeler; seçilen senaryo ve sıfırlama bildirilir', async () => {
    const t = dictFor('tr')
    const props = setup('tr')
    await userEvent.click(screen.getByRole('button', { name: t.demo.title }))
    const panel = document.getElementById('demo-panel')!
    expect(panel.querySelectorAll('[data-scenario]')).toHaveLength(SCENARIOS.length)
    // Profil yüklenince astronot görünümünde düğmeler etkinleşir
    const bpLow = SCENARIOS.find((s) => s.id === 'bpLow')!
    const button = within(panel).getByRole('button', { name: bpLow.label.tr })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)
    expect(props.onScenario).toHaveBeenLastCalledWith('bpLow')

    await userEvent.click(screen.getByRole('button', { name: t.demo.title }))
    await userEvent.click(screen.getByRole('button', { name: t.demo.reset }))
    expect(props.onResetDemo).toHaveBeenCalledOnce()
  })

  it('okunmamış bildirim sayısı düğmenin adında söylenir', () => {
    setup('en', 3)
    expect(screen.getByRole('button', { name: dictFor('en').topbar.notificationsUnread(3) })).toBeInTheDocument()
  })
})

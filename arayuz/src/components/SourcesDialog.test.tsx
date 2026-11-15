import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nasaCounts, NASA_DATASETS } from '../core/nasaMap'
import { dictFor, renderWithProviders } from '../test/render'
import { SourcesDialog } from './SourcesDialog'

/* Kaynaklar penceresi: dört sekme (Kaynaklar, NASA verisi, Fizibilite, Yol haritası), klavye ve iki dil */
describe.each(['tr', 'en'] as const)('Kaynaklar penceresi (%s)', (lang) => {
  const t = dictFor(lang)
  beforeEach(() => sessionStorage.clear())

  it('başlık "Kaynaklar" kalır; dört sekme var, ilk açılışta Kaynaklar seçili', async () => {
    renderWithProviders(<SourcesDialog open onClose={() => {}} onReplayIntro={() => {}} />, { lang })
    expect(await screen.findByRole('dialog', { name: t.sources.title })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual([t.about.tabs.sources, t.about.tabs.nasa, t.about.tabs.feasibility, t.about.tabs.roadmap])
    expect(screen.getByRole('tab', { name: t.about.tabs.sources })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent(t.sources.fictional)
  })

  it('←/→ ile sekmeler arasında gezilir; seçim oturumda hatırlanır', async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<SourcesDialog open onClose={() => {}} onReplayIntro={() => {}} />, { lang })
    const first = await screen.findByRole('tab', { name: t.about.tabs.sources })
    first.focus()
    await user.keyboard('{ArrowRight}')
    const nasa = screen.getByRole('tab', { name: t.about.tabs.nasa })
    expect(nasa).toHaveAttribute('aria-selected', 'true')
    expect(nasa).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: t.about.tabs.roadmap })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: t.about.tabs.sources })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}')
    unmount()
    renderWithProviders(<SourcesDialog open onClose={() => {}} onReplayIntro={() => {}} />, { lang })
    expect(await screen.findByRole('tab', { name: t.about.tabs.roadmap })).toHaveAttribute('aria-selected', 'true')
  })

  it('NASA verisi sekmesi: sayılar koddan, eşik satırları ve kararlar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourcesDialog open onClose={() => {}} onReplayIntro={() => {}} />, { lang })
    await user.click(await screen.findByRole('tab', { name: t.about.tabs.nasa }))
    const c = nasaCounts()
    const panel = screen.getByRole('tabpanel')
    expect(panel).toHaveTextContent(t.about.nasa.title)
    expect(panel).toHaveTextContent(t.about.nasa.summary(c.sources, c.nasaSources, c.nasaIndicators, c.indicators, NASA_DATASETS.length))
    expect(panel.querySelectorAll('[data-threshold-row]')).toHaveLength(c.indicators)
    expect(panel.querySelector('[data-decision="sep"]')).not.toBeNull()
  })

  it('Fizibilite sekmesi: tablo başlıkları ve dürüstlük notu; yol haritasında üç adım', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SourcesDialog open onClose={() => {}} onReplayIntro={() => {}} />, { lang })
    await user.click(await screen.findByRole('tab', { name: t.about.tabs.feasibility }))
    const table = within(screen.getByRole('tabpanel')).getByRole('table')
    for (const h of Object.values(t.about.feasibility.cols)) expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(t.about.feasibility.rows.length + 1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent(t.about.feasibility.honesty)
    await user.click(screen.getByRole('tab', { name: t.about.tabs.roadmap }))
    expect(within(screen.getByRole('tabpanel')).getAllByRole('listitem')).toHaveLength(3)
  })

  it('içe aktarılan veri setleri bölümündeki düğme pencereyi kapatıp içe aktarmayı açar', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<SourcesDialog open onClose={onClose} onReplayIntro={() => {}} />, { lang })
    await user.click(await screen.findByRole('button', { name: t.importer.open }))
    expect(onClose).toHaveBeenCalled()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { localBackend } from '../data/backend'
import { dictFor, renderWithProviders } from '../test/render'
import { HistoryCard } from './HistoryCard'

/*
 * Şikayet ve uyarı geçmişi kartı: tepki testi düğmesi yoktur (testin yeri Zihinsel sağlık sayfası); şikayet yokken nasıl
 * bildirileceği anlatılır ve rahatsızlık bildirme açılabilir; şikayet varken son şikayetler kompakt satırlarda görünür ve
 * şikayetten doğan uyarılar "şu anki uyarılar" listesinde tekrar edilmez.
 */
describe.each(['tr', 'en'] as const)('HistoryCard (%s)', (lang) => {
  const t = dictFor(lang)
  const h = t.doctor.history

  it('tepki testi düğmesi yok; şikayet yokken boş durum ve Rahatsızlık bildir', async () => {
    const onReport = vi.fn()
    renderWithProviders(<HistoryCard onOpenHistory={() => {}} onReport={onReport} />, { lang, backend: localBackend() })
    const card = screen.getByRole('region', { name: t.doctor.historyTitle })
    expect(within(card).queryByRole('button', { name: t.reaction.title })).toBeNull()
    expect(await within(card).findByText(h.emptyTitle)).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: t.hologram.complaint }))
    expect(onReport).toHaveBeenCalled()
  })

  it('şikayet varken son şikayetler satır olarak görünür, sayılar yazılır, şikayet uyarıları tekrarlanmaz', async () => {
    const backend = localBackend()
    await backend.call('addComplaint', 'yildiz', { region: 'bacaklar', side: 'both', muscles: [], symptom: 'tight', severity: 9, note: '', origin: 'hologram' })
    renderWithProviders(<HistoryCard onOpenHistory={() => {}} />, { lang, backend })
    const card = screen.getByRole('region', { name: t.doctor.historyTitle })
    await waitFor(() => expect(card.querySelectorAll('[data-complaint]')).toHaveLength(1))
    expect(within(card).queryByText(h.emptyTitle)).toBeNull()
    expect(within(card).getByText(h.statOngoing).nextElementSibling).toHaveTextContent('1')
    // Şikayetten doğan uyarı başlığı (ör. "Bacak: gerginlik bildirildi") uyarılar listesinde yer almaz
    const alerts = within(card).getByText(t.doctor.currentAlerts).nextElementSibling as HTMLElement
    expect(alerts.querySelectorAll('li')).not.toHaveLength(0)
    expect(alerts).not.toHaveTextContent(t.hologram.symptoms.tight.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en'))
  })
})

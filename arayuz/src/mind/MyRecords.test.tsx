import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localBackend, type Backend } from '../data/backend'
import { clearDrafts } from '../lib/drafts'
import { resetInteractions } from '../lib/interaction'
import { dictFor, renderWithProviders } from '../test/render'
import { MyRecords } from './MyRecords'

/*
 * Kayıtlarım (docs/wellbeing CI-10…CI-12): sıralama, filtreler, ayrıntılar, kısmi ve geç kayıtlar, atlanan ve yanıtsız
 * kapanan pencere, boş durum, günlük yazma, mürettebat ayrımı. Saat sabittir (yalnızca Date sahte).
 */

const utc = (d: number, h: number, mi = 0) => Date.UTC(2026, 10, d, h, mi)
const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ')

function backendAt(t: number): Backend {
  vi.setSystemTime(t)
  return localBackend()
}

async function renderRecords(lang: 'tr' | 'en', backend: Backend) {
  renderWithProviders(<MyRecords open onClose={() => {}} />, { lang, backend })
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(within(dialog).queryByLabelText(dictFor(lang).mindPage.loading)).toBeNull())
  return dialog
}

const records = (dialog: HTMLElement) => [...dialog.querySelectorAll<HTMLElement>('article[data-record]')]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetInteractions()
  clearDrafts()
})
afterEach(() => vi.useRealTimers())

describe.each(['tr', 'en'] as const)('Kayıtlarım (%s)', (lang) => {
  const t = dictFor(lang)
  const r = t.mindPage.recordsSheet
  const f = t.mindPage.form

  it('en yeni önce; tür, görev tarihi, kayıt anı ve pencere görünür; kısmi cevap ve "Yanıtlanmadı" ayrıntıda', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(12, 9, 17))
    await backend.call('submitCheckin', 'yildiz', '2026-11-12:morning', { mood: 'low', energy: 'notSure' }, 'baş ağrım var')
    vi.setSystemTime(utc(12, 14))
    await backend.call('addJournal', 'yildiz', 'Bugün Dünya çok güzeldi')
    const dialog = await renderRecords(lang, backend)

    const [first, second] = records(dialog)
    expect(first).toHaveAttribute('data-record', 'journal')
    expect(first).toHaveTextContent(r.typeJournal)
    expect(first).toHaveTextContent('Bugün Dünya çok güzeldi')
    expect(second).toHaveAttribute('data-record', 'checkin')
    expect(second).toHaveTextContent(`${r.typeCheckin} · ${t.mindPage.windowName('morning')}`)
    expect(second).toHaveTextContent('08:00–13:00')
    expect(second).toHaveTextContent('09:17')
    expect(second).toHaveTextContent(r.partial(2, 6))

    await user.click(within(second).getByRole('button', { name: r.details }))
    const answer = (q: string) => second.querySelector(`[data-question="${q}"] dd`)!
    expect(answer('mood')).toHaveTextContent(f.questions.mood.options.low)
    expect(answer('energy')).toHaveTextContent(f.questions.energy.options.notSure)
    expect(answer('physical')).toHaveTextContent(f.omitted)
    expect(answer('pressure')).toHaveTextContent(f.omitted)
    expect(second).toHaveTextContent('baş ağrım var')
    expect(within(second).getByRole('button', { name: r.hideDetails })).toHaveAttribute('aria-expanded', 'true')
  })

  it('geç gönderim açıkça yazılır; atlanan ve yanıtsız kapanan pencere ayrı gösterilir', async () => {
    const backend = backendAt(utc(12, 12, 58))
    await backend.call('openCheckin', 'yildiz', '2026-11-12:morning')
    vi.setSystemTime(utc(12, 13, 10))
    await backend.call('submitCheckin', 'yildiz', '2026-11-12:morning', { mood: 'okay', physical: 'comfortable', pressure: 'calm', energy: 'tired', team: 'good', vision: 'noChange' }, '')
    await backend.call('skipCheckin', 'yildiz', '2026-11-12:midday')
    vi.setSystemTime(utc(13, 9))
    const dialog = await renderRecords(lang, backend)
    const find = (w: string, d = '') => records(dialog).find((a) => a.dataset.window === w && (!d || a.textContent!.includes(d)))!
    const morning = records(dialog).find((a) => a.dataset.window === 'morning' && a.dataset.outcome === 'saved')!
    expect(morning).toHaveTextContent(r.late)
    expect(morning).toHaveTextContent(r.complete(6))
    const skipped = records(dialog).find((a) => a.dataset.outcome === 'skipped')!
    expect(skipped).toHaveTextContent(t.mindPage.outcome.skipped)
    const expired = records(dialog).find((a) => a.dataset.outcome === 'expired')!
    expect(expired).toHaveTextContent(t.mindPage.outcome.expired)
    expect(expired).not.toHaveTextContent(t.mindPage.outcome.skipped)
    expect(find('midday')).toBeTruthy()
  })

  it('filtreler: Günlük yalnızca günlük notlarını, Check-in\'ler yalnızca check-in kayıtlarını gösterir; boş durum', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(12, 9))
    await backend.call('submitCheckin', 'yildiz', '2026-11-12:morning', { mood: 'good' }, '')
    const dialog = await renderRecords(lang, backend)
    const group = within(dialog).getByRole('group', { name: r.filterLabel })
    expect(within(group).getByRole('button', { name: r.filters.all })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(group).getByRole('button', { name: r.filters.journal }))
    expect(records(dialog)).toHaveLength(0)
    expect(within(dialog).getByText(r.empties.journal)).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: r.filters.checkins }))
    expect(records(dialog).length).toBeGreaterThan(0)
    expect(records(dialog).every((a) => a.dataset.record === 'checkin')).toBe(true)
    // Check-in filtresinde günlük düzenleyicisi gösterilmez
    expect(within(dialog).queryByRole('heading', { name: r.newJournal })).toBeNull()
  })

  it('günlük yazma alanı burada yoktur (günlük başlıktaki Günlük yaz penceresinde); yazılan günlük notları listede görünür', async () => {
    const backend = backendAt(utc(12, 9))
    await backend.call('addJournal', 'yildiz', words(150))
    const dialog = await renderRecords(lang, backend)
    expect(within(dialog).queryByLabelText(t.journal.placeholder)).toBeNull()
    expect(within(dialog).queryByRole('button', { name: t.journal.save })).toBeNull()
    await waitFor(() => expect(records(dialog)[0]).toHaveAttribute('data-record', 'journal'))
    expect(records(dialog)[0]).toHaveTextContent(words(150))
    expect(await backend.call('checkinWindow', 'yildiz', '2026-11-12:morning')).toMatchObject({ record: null })
  })

  it('her astronotun kayıtları ayrıdır', async () => {
    const backend = backendAt(utc(12, 9))
    await backend.call('submitCheckin', 'mori', '2026-11-12:morning', { mood: 'veryLow' }, 'Mori\'nin notu')
    await backend.call('addJournal', 'mori', 'Mori\'nin günlüğü')
    const dialog = await renderRecords(lang, backend)
    expect(dialog).not.toHaveTextContent('Mori')
    expect(records(dialog).some((a) => a.dataset.outcome === 'saved')).toBe(false)
  })

  it('hekim görünümünde kayıtlar gösterilmez; şifreleme iddiası yoktur', async () => {
    const backend = backendAt(utc(12, 9))
    await backend.call('addJournal', 'yildiz', 'özel not')
    localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'surgeon', self: 'yildiz', viewing: 'yildiz' }))
    renderWithProviders(<MyRecords open onClose={() => {}} />, { lang, backend })
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(r.surgeon)).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('özel not')
    expect(r.storage).toMatch(lang === 'tr' ? /şifrelenmeden/ : /unencrypted/)
  })
})

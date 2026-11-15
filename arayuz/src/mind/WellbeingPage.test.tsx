import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localBackend, type Backend } from '../data/backend'
import { clearDrafts } from '../lib/drafts'
import { resetInteractions } from '../lib/interaction'
import { dictFor, renderWithProviders } from '../test/render'
import { closeDoctorContact } from '../lib/emergencyFlow'
import { CheckinsCard } from './CheckinsCard'
import { DoctorContactSheet } from './DoctorContact'
import { Sheet } from '../components/Sheet'
import { useI18n } from '../i18n'
import { EmergencyPaths } from './EmergencySupport'
import { MindActionsCard } from './MindActionsCard'
import { SupportLibraryCard } from './SupportLibraryCard'

/*
 * Zihinsel sağlık (Wellbeing) sayfasının yapısı: başlık ve üç check-in penceresi, günlük ve testler (dört kutu), destek
 * kütüphanesi (Başlat tam ekran açar). Acil destek sayfada değil, üst çubukta; penceresi burada ayrıca denenir.
 * Saat sabittir (yalnızca Date sahtedir, zamanlayıcılar gerçek); görev saat dilimi UTC.
 */

const utc = (h: number, mi = 0) => Date.UTC(2026, 10, 12, h, mi)
const MORNING = '2026-11-12:morning'
const MIDDAY = '2026-11-12:midday'

/** Saati ayarlar ve (Date.now sahteyken) yeni bir tarayıcı motoru kurar */
function backendAt(t: number): Backend {
  vi.setSystemTime(t)
  return localBackend()
}

function renderPage(lang: 'tr' | 'en', backend: Backend, onOpenMessages = vi.fn(), onOpenCheckin = vi.fn()) {
  renderWithProviders(
    <>
      <CheckinsCard onOpenCheckin={onOpenCheckin} />
      <MindActionsCard />
      <DoctorContactSheet onOpenMessages={onOpenMessages} />
      <SupportLibraryCard reducedMotion />
    </>,
    { lang, backend },
  )
  return { onOpenMessages, onOpenCheckin }
}

/** Acil destek yolları (nefes molasında gösterilir) bir pencerede: açık başlar, kapatılabilir */
function EmergencySheetHost() {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={t.mindPage.emergency.title} closeLabel="x" id="emergency-paths">
      <EmergencyPaths onLeave={() => setOpen(false)} />
    </Sheet>
  )
}

const card = (window: string) => document.querySelector<HTMLElement>(`article[data-window="${window}"]`)!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetInteractions()
  clearDrafts()
  closeDoctorContact()
})
afterEach(() => {
  vi.useRealTimers()
})

describe.each(['tr', 'en'] as const)('Wellbeing sayfası (%s)', (lang) => {
  const t = dictFor(lang)
  const m = t.mindPage

  it('başlık ve Kayıtlarım, üç pencere, dört kutulu Kendini tanı, günlüklü dört öğeli kütüphane; sayfada acil destek bölümü yok', async () => {
    renderPage(lang, backendAt(utc(9)))
    expect(screen.getByRole('heading', { level: 2, name: m.title })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: m.records })).toBeInTheDocument()
    const windows = screen.getByRole('list', { name: m.windowsLabel })
    await waitFor(() => expect(within(windows).getAllByRole('article')).toHaveLength(3))
    expect(within(windows).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['morning', 'midday', 'evening'].map(m.windowName))
    // Sağ üst: günlük yaz, Kayıtlarım, tepki testi ve henüz olmayan tutarlılık testi
    const actions = screen.getByRole('region', { name: m.actions.title })
    expect(within(actions).getAllByRole('listitem')).toHaveLength(4)
    // Kendini tanı: zihin egzersizleri ve tepki testi Başlat ile açılır; görüş ve tutarlılık testleri henüz yok (Yakında)
    expect(within(actions).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([m.library.mindGames.title, m.actions.vision, t.reaction.title, m.actions.consistency])
    expect(within(actions).getByRole('button', { name: m.library.open(m.library.mindGames.title) })).toBeEnabled()
    expect(within(actions).getByRole('button', { name: m.library.open(t.reaction.title) })).toBeEnabled()
    expect(within(actions).getAllByText(m.actions.soon)).toHaveLength(2)
    expect(within(actions).getAllByRole('button')).toHaveLength(2)
    // Acil destek üst çubukta; sayfada ayrı bölümü yok
    expect(screen.queryByRole('heading', { level: 2, name: m.emergency.title })).toBeNull()
    const library = screen.getByRole('list', { name: m.library.title })
    expect(within(library).getAllByRole('listitem')).toHaveLength(4)
    expect(within(library).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([m.library.cupola.title, m.library.breathing.title, m.library.gallery.title, m.library.journal.title])
    // Her öğenin Başlat düğmesi; görünen yazı erişilebilir adın içinde
    for (const id of ['cupola', 'breathing', 'gallery', 'journal'] as const)
      expect(within(library).getByRole('button', { name: m.library.open(m.library[id].title) })).toHaveTextContent(m.library.openShort)
    // Tahmini süre ve isteğe bağlılık
    expect(screen.getByText(m.estimate(1))).toBeInTheDocument()
  })

  it('pencere aralıkları görev saatine göre ve durumlar yazıyla gösterilir', async () => {
    const backend = backendAt(utc(9, 17))
    await backend.call('submitCheckin', 'yildiz', MORNING, { mood: 'good' }, '')
    vi.setSystemTime(utc(14))
    await backend.call('deferCheckin', 'yildiz', MIDDAY)
    renderPage(lang, backend)
    await waitFor(() => expect(card('morning')).toHaveAttribute('data-outcome', 'saved'))
    expect(card('morning')).toHaveTextContent('08:00–13:00')
    expect(card('morning')).toHaveTextContent(m.outcome.saved)
    expect(card('morning')).toHaveTextContent(m.detail.saved('09:17'))
    expect(card('morning')).toHaveTextContent(m.answered(1, 6))
    expect(card('midday')).toHaveAttribute('data-outcome', 'deferred')
    expect(card('midday')).toHaveTextContent(m.outcome.deferred)
    expect(card('midday')).toHaveTextContent(m.detail.deferred('20:00'))
    expect(card('midday')).toHaveAttribute('aria-current', 'time')
    expect(card('evening')).toHaveAttribute('data-outcome', 'upcoming')
    expect(card('evening')).toHaveTextContent('20:00–08:00')
    expect(card('evening')).toHaveTextContent(m.detail.upcoming('20:00'))
  })

  it('atlanan ve yanıtsız kapanan pencere ayrı gösterilir; yanıtsız kapanma atlama sayılmaz', async () => {
    const backend = backendAt(utc(9))
    await backend.call('skipCheckin', 'yildiz', MORNING)
    vi.setSystemTime(utc(21))
    renderPage(lang, backend)
    await waitFor(() => expect(card('morning')).toHaveAttribute('data-outcome', 'skipped'))
    expect(card('morning')).toHaveTextContent(m.outcome.skipped)
    expect(card('midday')).toHaveAttribute('data-outcome', 'expired')
    expect(card('midday')).toHaveTextContent(m.outcome.expired)
    expect(card('midday')).not.toHaveTextContent(m.outcome.skipped)
    expect(card('evening')).toHaveAttribute('data-outcome', 'pending')
    expect(card('evening')).toHaveTextContent(m.detail.pending('08:00'))
  })

  it('ertelenmiş pencere süresi dolana kadar yapılabilir; gelecekteki ve kapanmış pencere form olarak açılmaz', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(14))
    await backend.call('deferCheckin', 'yildiz', MIDDAY)
    const { onOpenCheckin } = renderPage(lang, backend)
    await waitFor(() => expect(card('midday')).toHaveAttribute('data-outcome', 'deferred'))
    await user.click(within(card('midday')).getByRole('button', { name: `${m.start}: ${m.windowName('midday')}` }))
    expect(onOpenCheckin).toHaveBeenCalledWith(MIDDAY)
    expect(within(card('evening')).queryByRole('button')).toBeNull()
    expect(within(card('morning')).queryByRole('button')).toBeNull()
    // Kart kendiliğinden kayıt yapmaz
    expect(await backend.call('checkinWindow', 'yildiz', MIDDAY)).toMatchObject({ record: null })
  })

  it('Kayıtlarım klavyeyle açılır, Esc ile kapanır ve odak defter düğmesine döner', async () => {
    const user = userEvent.setup()
    renderPage(lang, backendAt(utc(9)))
    const notebook = screen.getByRole('button', { name: m.records })
    // Kayıtlarım check-in bölümünün başlığında; ipucu imleç gelince görünür
    await user.hover(notebook)
    expect(screen.getByRole('tooltip')).toHaveTextContent(m.recordsTip)
    notebook.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: m.records })
    expect(within(dialog).getByRole('group', { name: m.recordsSheet.filterLabel })).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: m.recordsSheet.close })).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(notebook).toHaveFocus()
  })


  it('acil destek penceresi (üst çubuktan açılır): iki ana seçenek var, hekim yolu mesaj oluşturucuyu açar', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <EmergencySheetHost />
        <DoctorContactSheet onOpenMessages={vi.fn()} />
      </>,
      { lang, backend: backendAt(utc(9)) },
    )
    const dialog = await screen.findByRole('dialog', { name: m.emergency.title })
    const crew = within(dialog).getByRole('button', { name: new RegExp(m.emergency.crew) })
    expect(crew).toBeEnabled()
    expect(crew).toHaveAccessibleDescription(m.emergency.crewDesc)
    expect(within(dialog).getByRole('button', { name: new RegExp(m.emergency.doctor) })).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: new RegExp(m.emergency.doctor) }))
    // Acil destek penceresi kapanır, yerine oluşturucu açılır (iç içe pencere yok)
    expect(await screen.findByRole('dialog', { name: m.contact.title })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: m.emergency.title })).not.toBeInTheDocument())
  })

  it('nefes egzersizi Başlat ile ortadaki cam pencerede açılır, Esc ile kapanır ve odak açan düğmeye döner', async () => {
    const user = userEvent.setup()
    renderPage(lang, backendAt(utc(9)))
    const open = screen.getByRole('button', { name: m.library.open(m.library.breathing.title) })
    open.focus()
    await user.keyboard('{Enter}')
    const sheet = await screen.findByRole('dialog', { name: m.library.breathing.title })
    // Kapat düğmesi odaklanır
    await waitFor(() => expect(within(sheet).getByRole('button', { name: m.library.close })).toHaveFocus())
    // Açmak oturumu ya da sesi başlatmaz: ilk soru (süre) görünür, hiçbir şey seçili değil
    const duration = within(sheet).getByRole('group', { name: m.breath.askDuration })
    for (const r of within(duration).getAllByRole('radio')) expect(r).not.toBeChecked()
    expect(sheet.querySelector('[data-phase]')).toBeNull()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(open).toHaveFocus()
  })

  it('hekim görünümünde check-in\'ler gösterilmez; günlük ve tepki testi kapalı, acil destek gönderilemez', async () => {
    localStorage.setItem('vitalis.profile', JSON.stringify({ role: 'surgeon', self: 'yildiz', viewing: 'yildiz' }))
    renderPage(lang, backendAt(utc(9)))
    expect(screen.getByText(m.surgeon)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: m.windowsLabel })).toBeNull()
    expect(screen.getByRole('button', { name: m.library.open(m.library.journal.title) })).toBeDisabled()
    expect(screen.getByRole('button', { name: m.library.open(t.reaction.title) })).toBeDisabled()
    expect(screen.getByRole('button', { name: m.records })).toBeEnabled()
    renderWithProviders(<EmergencySheetHost />, { lang, backend: backendAt(utc(9)) })
    expect(await screen.findByRole('button', { name: new RegExp(m.emergency.doctor) })).toBeDisabled()
  })
})

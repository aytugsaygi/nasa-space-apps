import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOUR } from '../core/crew'
import type { MedicalContact } from '../core/doctorContact'
import type { MessageDoc } from '../core/model'
import { localBackend, type Backend } from '../data/backend'
import { clearDrafts } from '../lib/drafts'
import { closeDoctorContact, openDoctorContact } from '../lib/emergencyFlow'
import { resetInteractions } from '../lib/interaction'
import { dictFor, renderWithProviders } from '../test/render'
import { fullTime } from './checkinFormat'
import { DoctorContactSheet } from './DoctorContact'

/*
 * Acil destek → hekimle iletişim (docs/wellbeing EM-02, EM-04): alıcı, belirtiler, ekler, gözden geçirme, gönderim.
 * Saat sabittir (yalnızca Date sahte); görev saat dilimi UTC.
 */

const REF = Date.UTC(2026, 10, 12, 9, 0)

function backendAt(t = REF): Backend {
  vi.setSystemTime(t)
  return localBackend()
}

async function renderContact(lang: 'tr' | 'en', backend: Backend, contacts?: readonly MedicalContact[]) {
  const onOpenMessages = vi.fn()
  openDoctorContact()
  renderWithProviders(<DoctorContactSheet onOpenMessages={onOpenMessages} contacts={contacts} />, { lang, backend })
  const dialog = await screen.findByRole('dialog', { name: dictFor(lang).mindPage.contact.title })
  await waitFor(() => expect(within(dialog).getByRole('button', { name: dictFor(lang).mindPage.contact.close })).toHaveFocus())
  return { dialog, onOpenMessages }
}

const sentRequests = async (backend: Backend) => ((await backend.call('messages', 'yildiz')) as MessageDoc[]).filter((m) => m.requestId)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  resetInteractions()
  clearDrafts()
  closeDoctorContact()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe.each(['tr', 'en'] as const)('hekimle iletişim (%s)', (lang) => {
  const t = dictFor(lang)
  const c = t.mindPage.contact

  it('yapılandırılmış alıcı yoksa nedeni açıklanır ve gönderim yapılamaz', async () => {
    const { dialog } = await renderContact(lang, backendAt(), [])
    expect(within(dialog).getByRole('status')).toHaveTextContent(c.noRecipient)
    expect(within(dialog).queryByRole('button', { name: c.review })).toBeNull()
  })

  it('yapılandırılmış alıcı gösterilir; belirti seçmeden "başka bir konu" ile gönderilebilir; ek varsayılan olarak yoktur', async () => {
    const user = userEvent.setup()
    const backend = backendAt()
    const { dialog } = await renderContact(lang, backend)
    const recipient = within(dialog).getByRole('group', { name: c.recipient })
    expect(within(recipient).getByRole('radio')).toBeChecked()
    expect(recipient).toHaveTextContent(`Dr. S. Demir · ${lang === 'tr' ? 'Uçuş hekimi' : 'Flight surgeon'}`)
    const attach = within(dialog).getByRole('group', { name: c.attach })
    for (const box of within(attach).getAllByRole('checkbox')) expect(box).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: c.review })).toBeDisabled()
    expect(within(dialog).getByText(c.empty)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('checkbox', { name: c.other }))
    await user.click(within(dialog).getByRole('button', { name: c.review }))
    expect(within(dialog).getByRole('heading', { name: c.reviewTitle })).toBeInTheDocument()
    expect(dialog.querySelector('[data-review="message"]')).toHaveTextContent(c.textOther)
    expect(dialog.querySelector('[data-review="attachment"]')).toHaveTextContent(c.noAttachment)
    expect(await sentRequests(backend)).toHaveLength(0)
  })

  it('hazır aralık referans andan geriye tam zaman damgasıyla gösterilir; gerçek kayıt sayısı ve kaynağı görünür', async () => {
    const user = userEvent.setup()
    const backend = backendAt()
    const { dialog } = await renderContact(lang, backend)
    await user.click(within(dialog).getByRole('checkbox', { name: lang === 'tr' ? 'Nabız' : 'Heart rate' }))
    expect(within(dialog).getByText(c.reference(fullTime(REF, lang === 'tr' ? 'tr-TR' : 'en-US')))).toBeInTheDocument()
    const loc = lang === 'tr' ? 'tr-TR' : 'en-US'
    expect(dialog.querySelector('[data-range="exact"]')).toHaveTextContent(c.exact(fullTime(REF - 24 * HOUR, loc), fullTime(REF, loc)))
    const expected = await backend.call('attachmentPreview', 'yildiz', ['hr'], REF - 24 * HOUR, REF, REF)
    const count = expected.ok ? expected.snapshot.categories[0].count : -1
    await waitFor(() => expect(dialog.querySelector('[data-category="hr"]')).toHaveTextContent(c.count(count)))
    expect(dialog.querySelector('[data-category="hr"]')).toHaveTextContent(c.sources.sim)
  })

  it('kayıt olmayan aralıkta "kayıt yok" yazılır ve boş ek gönderilmez; boş aralık reddedilir', async () => {
    const user = userEvent.setup()
    const { dialog } = await renderContact(lang, backendAt())
    await user.click(within(dialog).getByRole('checkbox', { name: c.other }))
    await user.click(within(dialog).getByRole('checkbox', { name: lang === 'tr' ? 'Kan şekeri' : 'Blood sugar' }))
    await user.click(within(dialog).getByRole('button', { name: c.presets.custom }))
    const [from, to] = within(dialog).getAllByDisplayValue(/T/) as HTMLInputElement[]
    // Aynı başlangıç ve bitiş: boş aralık
    fireEvent.change(from, { target: { value: '2026-11-12T02:00' } })
    fireEvent.change(to, { target: { value: '2026-11-12T02:00' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(c.rangeErrors.empty)
    expect(within(dialog).getByRole('button', { name: c.review })).toBeDisabled()
    // Kan şekeri 07:15'te ölçülür: 02:00-03:00 arasında kayıt yok
    fireEvent.change(to, { target: { value: '2026-11-12T03:00' } })
    await waitFor(() => expect(dialog.querySelector('[data-category="glucose"]')).toHaveTextContent(c.noRecords))
    await user.click(within(dialog).getByRole('button', { name: c.review }))
    expect(dialog.querySelector('[data-review="attachment"]')).toHaveTextContent(c.noAttachment)
  })

  it('gözden geçirilen içerik gönderilir; çift tıklama tek mesaj açar; teslim ya da okundu onayı iddia edilmez', async () => {
    const user = userEvent.setup()
    const backend = backendAt()
    const { dialog } = await renderContact(lang, backend)
    await user.click(within(dialog).getByRole('checkbox', { name: c.symptom.headache }))
    await user.type(within(dialog).getByRole('textbox', { name: c.explanation }), 'Sabahtan beri')
    await user.click(within(dialog).getByRole('checkbox', { name: lang === 'tr' ? 'Nabız' : 'Heart rate' }))
    await waitFor(() => expect(dialog.querySelector('[data-category="hr"]')).toBeTruthy())
    await user.click(within(dialog).getByRole('button', { name: c.review }))
    const message = dialog.querySelector('[data-review="message"]')!
    expect(message).toHaveTextContent(c.symptom.headache)
    expect(message).toHaveTextContent('Sabahtan beri')
    const reviewedCount = within(dialog.querySelector('[data-review="attachment"]') as HTMLElement).getByText(/\d+/, { selector: '.tabular:not(p)' }).textContent

    // İnceleme sırasında kaynak veri değişir: gönderilen ek değişmez
    await backend.call('addMeasurement', 'yildiz', 'hr', 140)
    const send = within(dialog).getByRole('button', { name: c.send })
    await user.dblClick(send)
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(c.sentTitle))
    expect(dialog).toHaveTextContent(c.whereLocal)
    expect(dialog).toHaveTextContent(c.noAck)
    const sent = await sentRequests(backend)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'surgeon', symptoms: ['headache'], other: false })
    expect(c.count(sent[0].attachment!.categories[0].count)).toBe(reviewedCount)
    expect(sent[0].attachment!.categories[0].sources.manual).toBeUndefined()
  })

  it('gönderim başarısız olursa yazılanlar korunur; yeniden deneme aynı isteği bir kez gönderir', async () => {
    const user = userEvent.setup()
    const backend = backendAt()
    const real = backend.call.bind(backend)
    let fail = true
    vi.spyOn(backend, 'call').mockImplementation(((name: string, ...args: unknown[]) =>
      name === 'sendDoctorRequest' && fail ? Promise.reject(new Error('ağ')) : (real as (n: string, ...a: unknown[]) => Promise<unknown>)(name, ...args)) as typeof backend.call)
    const { dialog } = await renderContact(lang, backend)
    await user.click(within(dialog).getByRole('checkbox', { name: c.symptom.sleep }))
    await user.click(within(dialog).getByRole('button', { name: c.review }))
    await user.click(within(dialog).getByRole('button', { name: c.send }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(c.failed)
    // Düzenlemeye dönülürse seçimler yerinde
    await user.click(within(dialog).getByRole('button', { name: c.edit }))
    expect(within(dialog).getByRole('checkbox', { name: c.symptom.sleep })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: c.review }))
    await user.click(within(dialog).getByRole('button', { name: c.send }))
    expect(await within(dialog).findByRole('button', { name: c.retry })).toBeInTheDocument()
    fail = false
    await user.click(within(dialog).getByRole('button', { name: c.retry }))
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(c.sentTitle))
    expect(await sentRequests(backend)).toHaveLength(1)
  })

  it('kapatınca yazılanlar saklanır; yeniden açınca yerinde', async () => {
    const user = userEvent.setup()
    const backend = backendAt()
    const { dialog } = await renderContact(lang, backend)
    await user.click(within(dialog).getByRole('checkbox', { name: c.symptom.nausea }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    openDoctorContact()
    const again = await screen.findByRole('dialog', { name: c.title })
    expect(within(again).getByRole('checkbox', { name: c.symptom.nausea })).toBeChecked()
  })
})

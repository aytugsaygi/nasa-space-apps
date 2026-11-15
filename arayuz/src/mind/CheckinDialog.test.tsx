import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckinWindowView } from '../core/checkins'
import { localBackend, type Backend } from '../data/backend'
import { clearDrafts } from '../lib/drafts'
import { resetInteractions } from '../lib/interaction'
import { dictFor, renderWithProviders } from '../test/render'
import { closeDoctorContact } from '../lib/emergencyFlow'
import { CheckinDialog } from './CheckinDialog'
import { DoctorContactSheet } from './DoctorContact'

/*
 * Check-in akışı (docs/wellbeing CI-01…CI-10, WB-T-06): sorular tek tek gelir, seçince kendiliğinden ilerler; Geri/İleri,
 * rakam ve ok tuşları; not ve özet (özetten soruya dönüp değiştirme); X ile "sonra", atla, kaydet (bitiş animasyonu);
 * kısmi ve boş form; not sınırı; kayıt hatası; açıkken pencerenin kapanması. Saat sabittir (yalnızca Date sahte); görev
 * saat dilimi UTC.
 */

const utc = (h: number, mi = 0) => Date.UTC(2026, 10, 12, h, mi)
const MORNING = '2026-11-12:morning'
const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(' ')

function backendAt(t: number): Backend {
  vi.setSystemTime(t)
  return localBackend()
}

/** App gibi: form açılmadan önce pencere "açıldı" olarak kaydedilir (geç gönderim için) */
async function renderDialog(lang: 'tr' | 'en', backend: Backend, onOpenMessages = vi.fn()) {
  await backend.call('openCheckin', 'yildiz', MORNING)
  function Harness() {
    const [key, setKey] = useState<string | null>(MORNING)
    return (
      <>
        <CheckinDialog windowKey={key} onClose={() => setKey(null)} />
        <DoctorContactSheet onOpenMessages={onOpenMessages} />
      </>
    )
  }
  renderWithProviders(<Harness />, { lang, backend })
  const dialog = await screen.findByRole('dialog')
  const f = dictFor(lang).mindPage.form
  // İlk adım: ilk soru (kayıtlı check-in düzenlenirken özet)
  await waitFor(() => expect(dialog.querySelector('[data-question], [data-summary]')).not.toBeNull())
  // Panel açılınca odak kapat düğmesine geçer; etkileşim ondan sonra başlar
  await waitFor(() => expect(within(dialog).getByRole('button', { name: f.close })).toHaveFocus())
  return { dialog, onOpenMessages }
}

const window = (backend: Backend) => backend.call('checkinWindow', 'yildiz', MORNING) as Promise<CheckinWindowView>

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

/** Ekrandaki adım: soru kimliği, 'note' ya da 'summary' */
const stepOf = (dialog: HTMLElement) =>
  dialog.querySelector('[data-question]')?.getAttribute('data-question') ?? (dialog.querySelector('textarea') ? 'note' : dialog.querySelector('[data-summary]') ? 'summary' : null)

/** Kaydedince bitiş animasyonu oynar, ardından pencere kapanır */
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 4000 })

type User = ReturnType<typeof userEvent.setup>

describe.each(['tr', 'en'] as const)('check-in akışı (%s)', (lang) => {
  const t = dictFor(lang)
  const f = t.mindPage.form
  const ids = ['physical', 'mood', 'pressure', 'energy', 'team', 'vision']

  /** İleri ile hedef adıma kadar gider (sorular isteğe bağlı: cevapsız da geçilir) */
  async function goTo(user: User, dialog: HTMLElement, target: string) {
    for (let i = 0; i < 10 && stepOf(dialog) !== target; i++) {
      const before = stepOf(dialog)
      await user.click(within(dialog).getByRole('button', { name: f.next }))
      await waitFor(() => expect(stepOf(dialog)).not.toBe(before))
    }
    expect(stepOf(dialog)).toBe(target)
  }

  /** Bir soruya gidip cevaplar ve otomatik geçişi bekler */
  async function answer(user: User, dialog: HTMLElement, id: string, option: string) {
    await goTo(user, dialog, id)
    await user.click(within(dialog).getByRole('radio', { name: f.questions[id].options[option] }))
    await waitFor(() => expect(stepOf(dialog)).not.toBe(id))
  }

  it('sorular tek tek gelir; hiçbiri önceden seçili değil; sonra not ve özet', async () => {
    const user = userEvent.setup()
    const { dialog } = await renderDialog(lang, backendAt(utc(9)))
    expect(dialog).toHaveAccessibleName(f.title(t.mindPage.windowName('morning')))
    for (const [i, id] of ids.entries()) {
      await goTo(user, dialog, id)
      // Ekranda yalnızca bu soru var
      expect(dialog.querySelectorAll('[data-question]')).toHaveLength(1)
      expect(within(dialog).getByText(f.questionOf(i + 1, ids.length))).toBeInTheDocument()
      const group = within(dialog).getByRole('group', { name: f.questions[id].label })
      const radios = within(group).getAllByRole('radio')
      radios.forEach((r, j) => expect(r).toHaveAccessibleName(Object.values(f.questions[id].options)[j]))
      for (const r of radios) expect(r).not.toBeChecked()
    }
    await goTo(user, dialog, 'note')
    expect(within(dialog).getByRole('textbox', { name: new RegExp(f.noteLabel.replace('?', '\\?')) })).toHaveValue('')
    expect(within(dialog).getByText(f.wordCount(0, 100))).toBeInTheDocument()
    await goTo(user, dialog, 'summary')
    expect(within(dialog).getByRole('heading', { name: f.summaryTitle })).toBeInTheDocument()
    for (const id of ids) expect(dialog.querySelector(`[data-summary="${id}"]`)).toHaveTextContent(f.omitted)
    expect(dialog.querySelector('[data-summary="note"]')).toHaveTextContent(f.noNote)
  })

  it('seçince kendiliğinden sonraki soruya geçer; Geri ile dönülünce seçim yerinde durur', async () => {
    const user = userEvent.setup()
    const { dialog } = await renderDialog(lang, backendAt(utc(9)))
    expect(within(dialog).queryByRole('button', { name: f.back })).toBeNull()
    await user.click(within(dialog).getByRole('radio', { name: f.questions.physical.options.comfortable }))
    expect(await within(dialog).findByRole('group', { name: f.questions.mood.label })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: f.back }))
    expect(await within(dialog).findByRole('radio', { name: f.questions.physical.options.comfortable })).toBeChecked()
    // Seçili seçeneğe yeniden basmak da ilerletir
    await user.click(within(dialog).getByRole('radio', { name: f.questions.physical.options.comfortable }))
    expect(await within(dialog).findByRole('group', { name: f.questions.mood.label })).toBeInTheDocument()
  })

  it('klavye: rakam seçer ve ilerler, ← geri döner, → cevapsız geçer', async () => {
    const user = userEvent.setup()
    const { dialog } = await renderDialog(lang, backendAt(utc(9)))
    await user.keyboard('2')
    expect(await within(dialog).findByRole('group', { name: f.questions.mood.label })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(await within(dialog).findByRole('radio', { name: f.questions.physical.options.mildDiscomfort })).toBeChecked()
    await user.keyboard('{ArrowRight}')
    await within(dialog).findByRole('group', { name: f.questions.mood.label })
    await user.keyboard('{ArrowRight}')
    expect(await within(dialog).findByRole('group', { name: f.questions.pressure.label })).toBeInTheDocument()
  })

  it('özette bir satıra basınca o soruya gidilir; cevap değişince özete dönülür', async () => {
    const user = userEvent.setup()
    const { dialog } = await renderDialog(lang, backendAt(utc(9)))
    await answer(user, dialog, 'mood', 'low')
    await goTo(user, dialog, 'summary')
    expect(dialog.querySelector('[data-summary="mood"]')).toHaveTextContent(f.questions.mood.options.low)
    await user.click(dialog.querySelector<HTMLElement>('[data-summary="mood"]')!)
    expect(await within(dialog).findByRole('group', { name: f.questions.mood.label })).toBeInTheDocument()
    // Düzenlerken ileri düğmesi özete götürür
    expect(within(dialog).getByRole('button', { name: f.toSummary })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: f.questions.mood.options.good }))
    await waitFor(() => expect(stepOf(dialog)).toBe('summary'))
    expect(dialog.querySelector('[data-summary="mood"]')).toHaveTextContent(f.questions.mood.options.good)
    // Not satırı nota götürür
    await user.click(dialog.querySelector<HTMLElement>('[data-summary="note"]')!)
    await waitFor(() => expect(stepOf(dialog)).toBe('note'))
  })

  it('X "sonra yaparım" demektir: atlanmaz, taslak korunur ve pencere ertelenir', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9))
    const { dialog } = await renderDialog(lang, backend)
    await answer(user, dialog, 'mood', 'low')
    await goTo(user, dialog, 'note')
    await user.click(within(dialog).getByRole('textbox'))
    await user.paste('yarın devam')
    await user.click(within(dialog).getByRole('button', { name: f.close }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(async () => expect(await window(backend)).toMatchObject({ outcome: 'deferred', record: null, draft: { answers: { mood: 'low' }, note: 'yarın devam' } }))
  })

  it('yarım bırakılan check-in yeniden açılınca hiçbir seçenek seçili gelmez', async () => {
    const backend = backendAt(utc(9))
    await backend.call('openCheckin', 'yildiz', MORNING)
    await backend.call('saveCheckinDraft', 'yildiz', MORNING, { physical: 'comfortable', mood: 'good', pressure: null, energy: null, team: null, vision: null }, 'taslak')
    const { dialog } = await renderDialog(lang, backend)
    expect(stepOf(dialog)).toBe('physical')
    for (const r of within(dialog).getAllByRole('radio')) expect(r).not.toBeChecked()
  })

  it('"Bu check-in\'i atla" pencereyi atlanmış olarak kesinleştirir', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9))
    const { dialog } = await renderDialog(lang, backend)
    await goTo(user, dialog, 'summary')
    await user.click(within(dialog).getByRole('button', { name: f.skip }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await window(backend)).toMatchObject({ outcome: 'skipped', record: { outcome: 'skipped' } })
  })

  it('kısmi cevap kaydedilir; bitiş animasyonu ayrı bir bildirim olmadan gösterilir ve akış kapanır', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9, 20))
    const { dialog } = await renderDialog(lang, backend)
    await answer(user, dialog, 'physical', 'notSure')
    // Bir cevap temizlenebilir
    await user.click(within(dialog).getByRole('radio', { name: f.questions.mood.options.good }))
    await waitFor(() => expect(stepOf(dialog)).toBe('pressure'))
    await user.click(within(dialog).getByRole('button', { name: f.back }))
    await user.click(await within(dialog).findByRole('button', { name: f.clearLabel(f.questions.mood.label) }))
    expect(within(dialog).getByRole('radio', { name: f.questions.mood.options.good })).not.toBeChecked()
    await answer(user, dialog, 'energy', 'tired')
    await goTo(user, dialog, 'summary')
    await user.click(within(dialog).getByRole('button', { name: f.save }))
    expect(await within(dialog).findByText(f.doneTitle)).toBeInTheDocument()
    expect(dialog.querySelector('[data-checkin-done]')).not.toBeNull()
    await closed()
    expect((await window(backend)).record).toMatchObject({
      outcome: 'saved',
      answers: { physical: 'notSure', mood: null, pressure: null, energy: 'tired' },
      omitted: ['mood', 'pressure', 'team', 'vision'],
      answered: 2,
      late: false,
    })
  })

  it('belirgin görme değişikliğinde hekime bildirme önerisi görünür ve akış durur (SANS); özette de yazar', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9, 20))
    const { dialog } = await renderDialog(lang, backend)
    await goTo(user, dialog, 'vision')
    await user.click(within(dialog).getByRole('radio', { name: f.questions.vision.options.clearChange }))
    expect(await within(dialog).findByRole('note')).toHaveTextContent(f.questions.vision.advice!)
    // Öneri okunsun diye kendiliğinden geçilmez
    await new Promise((r) => setTimeout(r, 800))
    expect(stepOf(dialog)).toBe('vision')
    await goTo(user, dialog, 'summary')
    expect(within(dialog).getByRole('note')).toHaveTextContent(f.questions.vision.advice!)
    // Taslak sonraki teste kalmasın
    await user.click(dialog.querySelector<HTMLElement>('[data-summary="vision"]')!)
    await user.click(await within(dialog).findByRole('button', { name: f.clearLabel(f.questions.vision.label) }))
    await waitFor(() => expect(within(dialog).queryByRole('note')).not.toBeInTheDocument())
  })

  it('tamamen boş form kaydedilmez; boşluktan oluşan not da boş sayılır ve atlama önerilir', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9))
    const { dialog } = await renderDialog(lang, backend)
    await goTo(user, dialog, 'note')
    await user.click(within(dialog).getByRole('textbox'))
    await user.paste('   ')
    await goTo(user, dialog, 'summary')
    expect(within(dialog).getByRole('button', { name: f.save })).toBeDisabled()
    expect(within(dialog).getByText(f.emptyHint)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: f.skip })).toBeEnabled()
    expect((await window(backend)).record).toBeNull()
  })

  it('not 100 kelimeyi geçerse açıklanır, kaydedilmez ve yazılan metin korunur', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9))
    const { dialog } = await renderDialog(lang, backend)
    await goTo(user, dialog, 'note')
    await user.click(within(dialog).getByRole('textbox'))
    await user.paste(words(101))
    expect(within(dialog).getByText(f.wordCount(101, 100))).toBeInTheDocument()
    expect(within(dialog).getByRole('alert')).toHaveTextContent(f.noteTooLong(101, 100))
    expect(within(dialog).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    await goTo(user, dialog, 'summary')
    expect(within(dialog).getByRole('button', { name: f.save })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: f.back }))
    await waitFor(() => expect(stepOf(dialog)).toBe('note'))
    expect(within(dialog).getByRole('textbox')).toHaveValue(words(101))
    // Bir kelime silinince kaydedilebilir; metin kısaltılmadan kaydedilir
    await user.clear(within(dialog).getByRole('textbox'))
    await user.paste(words(100))
    expect(within(dialog).queryByRole('alert')).toBeNull()
    await goTo(user, dialog, 'summary')
    await user.click(within(dialog).getByRole('button', { name: f.save }))
    await closed()
    expect((await window(backend)).record?.note).toBe(words(100))
  })

  it('kaydetme başarısız olursa akış kapanmaz, yazılanlar ve taslak korunur; yeniden denenebilir', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(9))
    const real = backend.call.bind(backend)
    const call = vi.spyOn(backend, 'call').mockImplementation(((name: string, ...args: unknown[]) =>
      name === 'submitCheckin' ? Promise.reject(new Error('ağ hatası')) : (real as (n: string, ...a: unknown[]) => Promise<unknown>)(name, ...args)) as typeof backend.call)
    const { dialog } = await renderDialog(lang, backend)
    await answer(user, dialog, 'pressure', 'somePressure')
    await goTo(user, dialog, 'note')
    await user.click(within(dialog).getByRole('textbox'))
    await user.paste('denemem')
    await goTo(user, dialog, 'summary')
    await user.click(within(dialog).getByRole('button', { name: f.save }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(f.failed)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(dialog.querySelector('[data-summary="pressure"]')).toHaveTextContent(f.questions.pressure.options.somePressure)
    expect(dialog.querySelector('[data-summary="note"]')).toHaveTextContent('denemem')
    await waitFor(async () => expect(await real('checkinWindow', 'yildiz', MORNING)).toMatchObject({ record: null, draft: { answers: { pressure: 'somePressure' }, note: 'denemem' } }))
    call.mockRestore()
    await user.click(within(dialog).getByRole('button', { name: f.save }))
    await closed()
    expect((await window(backend)).record).toMatchObject({ outcome: 'saved', note: 'denemem' })
  })

  it('kayıtlı check-in yeniden açılınca özetten başlar ve Güncelle ile kaydedilir', async () => {
    const backend = backendAt(utc(9))
    await backend.call('openCheckin', 'yildiz', MORNING)
    await backend.call('submitCheckin', 'yildiz', MORNING, { physical: 'comfortable', mood: null, pressure: null, energy: null, team: null, vision: null }, '')
    const { dialog } = await renderDialog(lang, backend)
    expect(stepOf(dialog)).toBe('summary')
    expect(dialog.querySelector('[data-summary="physical"]')).toHaveTextContent(f.questions.physical.options.comfortable)
    expect(within(dialog).getByRole('button', { name: f.update })).toBeEnabled()
    expect(within(dialog).queryByRole('button', { name: f.skip })).toBeNull()
  })

  it('akış açıkken pencere kapanırsa form değişmez ve aynı pencereye geç gönderim olarak kaydedilir', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(12, 58))
    await backend.call('openCheckin', 'yildiz', MORNING)
    vi.setSystemTime(utc(13, 10))
    const { dialog } = await renderDialog(lang, backend)
    expect(dialog).toHaveAccessibleName(f.title(t.mindPage.windowName('morning')))
    expect(within(dialog).getByRole('status')).toHaveTextContent(f.closedNotice('15:00'))
    await answer(user, dialog, 'mood', 'okay')
    await goTo(user, dialog, 'summary')
    await user.click(within(dialog).getByRole('button', { name: f.save }))
    expect(await within(dialog).findByText(new RegExp(f.doneLate))).toBeInTheDocument()
    await closed()
    expect((await window(backend)).record).toMatchObject({ window: 'morning', date: '2026-11-12', late: true, answers: { mood: 'okay' } })
  })

  it('geç gönderim süresi dolduysa kaydedilemez ama yazılanlar yerinde kalır', async () => {
    const user = userEvent.setup()
    const backend = backendAt(utc(12, 58))
    await backend.call('openCheckin', 'yildiz', MORNING)
    vi.setSystemTime(utc(15, 1))
    const { dialog } = await renderDialog(lang, backend)
    expect(within(dialog).getByRole('status')).toHaveTextContent(f.expiredNotice)
    await answer(user, dialog, 'mood', 'okay')
    await goTo(user, dialog, 'summary')
    expect(within(dialog).getByRole('button', { name: f.save })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: f.skip })).toBeDisabled()
    expect(dialog.querySelector('[data-summary="mood"]')).toHaveTextContent(f.questions.mood.options.okay)
  })

  it('akışta acil destek düğmesi yoktur; acil destek üst çubuktaki Acil durum düğmesindedir', async () => {
    const backend = backendAt(utc(9))
    const { dialog } = await renderDialog(lang, backend)
    expect(within(dialog).queryByRole('button', { name: f.emergency })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: new RegExp(t.mindPage.emergency.doctor) })).toBeNull()
  })
})


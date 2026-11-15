import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localBackend } from '../data/backend'
import { closeImport, openImport } from '../lib/importDialog'
import { dictFor, renderWithProviders } from '../test/render'
import { ImportDialog } from './ImportDialog'

/* Veri içe aktarma penceresi: sütun tahmini, birim çevirisi önizlemesi, geçersiz satırlar, içe aktarma, iki dil */

const file = (name: string, text: string, type = 'text/csv') => new File([text], name, { type })
const CSV = ['timestamp,bpm', '2026-11-10T08:00:00Z,62', '2026-11-10T08:10:00Z,70', 'not-a-date,71', '2026-11-10T08:30:00Z,', '2026-11-10T08:40:00Z,68'].join('\n')

describe.each(['tr', 'en'] as const)('içe aktarma penceresi (%s)', (lang) => {
  const t = dictFor(lang)
  const im = t.importer
  beforeEach(() => {
    closeImport()
    openImport()
  })

  it('CSV: sütunlar ve gösterge başlıktan tahmin edilir; önizlemede geçersiz satırlar nedeniyle sayılır; içe aktarılır', async () => {
    const user = userEvent.setup()
    const backend = localBackend()
    const onDone = vi.fn()
    renderWithProviders(<ImportDialog onDone={onDone} />, { lang, backend })
    const input = (await screen.findByLabelText(im.choose, { selector: 'input' })) as HTMLInputElement
    await user.upload(input, file('kalp.csv', CSV))
    expect(await screen.findByLabelText(im.indicator)).toHaveValue('hr')
    expect(screen.getByLabelText(im.timeColumn)).toHaveValue('timestamp')
    expect(screen.getByLabelText(im.valueColumn)).toHaveValue('bpm')
    expect(screen.getByLabelText(new RegExp(im.dataset))).toHaveValue('kalp')
    await user.click(screen.getByRole('button', { name: im.next }))
    expect(await screen.findByText(im.valid(3))).toBeInTheDocument()
    expect(screen.getByText(im.invalid(2), { exact: false })).toBeInTheDocument()
    expect(screen.getByText(`${im.row(4)}: ${im.reasons.time}`)).toBeInTheDocument()
    expect(screen.getByText(`${im.row(5)}: ${im.reasons.value}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: im.submit }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ indicator: 'hr', from: Date.parse('2026-11-10T08:00:00Z'), to: Date.parse('2026-11-10T08:40:00Z') })))
    const imports = await backend.call('imports')
    expect(imports[0]).toEqual(expect.objectContaining({ dataset: 'kalp', count: 3, indicator: 'hr', by: 'astronaut' }))
  })

  it('JSON mmol/L: kan şekeri ve birim tahmin edilir, önizleme mg/dL\'ye çevirir (1 mmol/L = 18 mg/dL)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ImportDialog onDone={() => {}} />, { lang })
    const rows = [
      { date: '2026-11-04T07:30:00Z', glucose_mmol: 5 },
      { date: '2026-11-05T07:30:00Z', glucose_mmol: 5.5 },
    ]
    const input = (await screen.findByLabelText(im.choose, { selector: 'input' })) as HTMLInputElement
    await user.upload(input, file('seker.json', JSON.stringify(rows), 'application/json'))
    expect(await screen.findByLabelText(im.indicator)).toHaveValue('glucose')
    expect(screen.getByLabelText(im.unit)).toHaveValue('mmol/L')
    await user.click(screen.getByRole('button', { name: im.next }))
    const table = await screen.findByRole('table')
    expect(table).toHaveTextContent('90')
    expect(table).toHaveTextContent('99')
  })

  it('desteklenmeyen dosya ve bozuk içerik anlaşılır hata verir', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderWithProviders(<ImportDialog onDone={() => {}} />, { lang })
    const input = (await screen.findByLabelText(im.choose, { selector: 'input' })) as HTMLInputElement
    await user.upload(input, file('resim.png', 'x', 'image/png'))
    expect(await screen.findByRole('alert')).toHaveTextContent(im.badType)
    await user.upload(input, file('bozuk.json', '{bozuk', 'application/json'))
    expect(await screen.findByRole('alert')).toHaveTextContent(im.parseError)
  })
})

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { INDICATORS, type IndicatorId } from '../core/catalog'
import type { IndicatorState, Snapshot } from '../core/model'
import { tx } from '../core/tx'
import type { Status } from '../data/types'
import { dictFor, renderWithProviders } from '../test/render'
import { formatValue, VitalCard, VitalInfo } from './VitalCard'

const state = (id: IndicatorId, status: Status, value: number, value2?: number): IndicatorState => ({
  id,
  value,
  value2,
  t: Date.now(),
  status,
  label: tx('', ''),
  basis: 'vitalis',
  source: 'sensor',
})

describe('formatValue', () => {
  it('tansiyonu "büyük/küçük" yazar, ondalığı dile göre biçimler', () => {
    expect(formatValue('bp', { value: 118, value2: 76 }, 'tr')).toBe('118/76')
    expect(formatValue('temp', { value: 36.8 }, 'tr')).toBe('36,8')
    expect(formatValue('temp', { value: 36.8 }, 'en')).toBe('36.8')
    expect(formatValue('hr', { value: null }, 'en')).toBe('—')
  })
})

describe.each(['tr', 'en'] as const)('VitalCard (%s)', (lang) => {
  const t = dictFor(lang)
  const name = INDICATORS.hr.name[lang]

  it('ad, değer, birim, durum yazısı ve referans aralığını gösterir', () => {
    renderWithProviders(<VitalCard id="hr" state={state('hr', 'dikkat', 112)} snapshot={null} onOpen={() => {}} />, { lang })
    expect(screen.getByText(name)).toBeInTheDocument()
    expect(screen.getByText('112')).toBeInTheDocument()
    expect(screen.getByText(INDICATORS.hr.unit[lang])).toBeInTheDocument()
    // Durum renkle birlikte yazıyla da söylenir
    expect(screen.getByText(t.status.dikkat)).toBeInTheDocument()
    expect(screen.getByText(INDICATORS.hr.range[lang])).toBeInTheDocument()
  })

  it('durum normal değilse kartın çevresinde durum halkası olur', () => {
    const { container, unmount } = renderWithProviders(<VitalCard id="hr" state={state('hr', 'kritik', 150)} snapshot={null} onOpen={() => {}} />, { lang })
    expect(container.querySelector('[data-vital-card]')).toHaveClass('ring-1')
    unmount()
    const normal = renderWithProviders(<VitalCard id="hr" state={state('hr', 'normal', 72)} snapshot={null} onOpen={() => {}} />, { lang })
    expect(normal.container.querySelector('[data-vital-card]')).not.toHaveClass('ring-1')
  })

  it('karta basınca göstergenin ayrıntısı açılır', async () => {
    const onOpen = vi.fn()
    renderWithProviders(<VitalCard id="hr" state={state('hr', 'normal', 72)} snapshot={null} onOpen={onOpen} />, { lang })
    await userEvent.click(screen.getByRole('button', { name: new RegExp(t.vital.open(name)) }))
    expect(onOpen).toHaveBeenCalledWith('hr')
  })

  it('kartın üzerinde beklemek açıklama açmaz; açıklama (aralık ve uzaydaki anlamı) ⓘ içeriği olarak VitalInfo ile gelir', async () => {
    renderWithProviders(<VitalCard id="hr" state={state('hr', 'normal', 72)} snapshot={null} onOpen={() => {}} />, { lang })
    await userEvent.hover(screen.getByText('72'))
    expect(screen.queryByRole('tooltip')).toBeNull()
    const info = renderWithProviders(<VitalInfo id="hr" />, { lang })
    expect(info.container).toHaveTextContent(INDICATORS.hr.range[lang])
    expect(info.container).toHaveTextContent(INDICATORS.hr.space[lang])
  })

  it('mini grafiğe basınca ayrıntılı grafiğe gidilir; kart ayrıntısı açılmaz', async () => {
    const onOpen = vi.fn()
    const onChart = vi.fn()
    renderWithProviders(<VitalCard id="hr" state={state('hr', 'normal', 72)} snapshot={null} onOpen={onOpen} onChart={onChart} />, { lang })
    const chart = screen.getByRole('button', { name: new RegExp(t.trendChart.more) })
    expect(chart).toHaveAccessibleName(`${t.trendChart.title(name, true)}. ${t.trendChart.more}`)
    await userEvent.hover(chart)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(t.trendChart.title(name, true))
    await userEvent.click(chart)
    expect(onChart).toHaveBeenCalledWith('hr')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('radyasyon kartında kariyer sınırına oran yazılır', () => {
    const snapshot = { dose: { totalMsv: 61, percent: 10.2, todayMsv: 0.43 } } as Snapshot
    renderWithProviders(<VitalCard id="radiation" state={state('radiation', 'normal', 0.43)} snapshot={snapshot} onOpen={() => {}} />, { lang })
    expect(screen.getByText(`${t.vital.career('10')} · 61/600 mSv`)).toBeInTheDocument()
  })

  it('veri gelmeden yükleniyor gösterilir', () => {
    renderWithProviders(<VitalCard id="spo2" state={undefined} snapshot={null} onOpen={() => {}} />, { lang })
    expect(screen.getByText(t.vital.loading)).toBeInTheDocument()
  })
})

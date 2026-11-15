import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComplaintDoc, Finding } from '../core/model'
import { tx } from '../core/tx'
import { muscleNameTr } from '../data/muscleNames'
import { BASE_STATUS, regionsFor } from '../data/regions'
import { dictFor, renderWithProviders } from '../test/render'
import { RegionPanel } from './RegionPanel'

const NAMES = readFileSync(resolve(process.cwd(), 'public/models/anatomy-names.json'), 'utf8')

function setup(over: Partial<Parameters<typeof RegionPanel>[0]> = {}, lang: 'tr' | 'en' = 'tr') {
  const props = {
    selected: null,
    statuses: BASE_STATUS,
    findings: [] as Finding[],
    complaints: [] as ComplaintDoc[],
    snapshot: null,
    onOpenIndicator: vi.fn(),
    buzzKey: 0,
    vibration: true,
    exploded: false,
    selectedStructure: null,
    onSelect: vi.fn(),
    onStructureClose: vi.fn(),
    onFocusLayer: vi.fn(),
    onAsk: vi.fn(),
    ...over,
  }
  renderWithProviders(<RegionPanel {...props} />, { lang })
  return props
}

const finding: Finding = {
  key: 'impact:eller',
  level: 'kritik',
  region: 'eller',
  title: tx('Sağ elde darbe', 'Impact on right hand'),
  reason: tx('Eldiven sensörü ani basınç düşüşü bildirdi.', 'The glove sensor reported a sudden pressure drop.'),
  action: tx('Elini kontrol et.', 'Check your hand.'),
  sources: ['vitalis'],
  ts: Date.now(),
  notifyDoctor: true,
  page: 0,
}

const complaint: ComplaintDoc = {
  id: 'c1',
  astronaut: 'yildiz',
  ts: Date.now(),
  region: 'sirt',
  side: 'both',
  muscles: [],
  symptom: 'pain',
  severity: 4,
  note: '',
  status: 'active',
  updates: [],
  origin: 'hologram',
}

beforeEach(() => {
  // Yapı adları dosyası uygulamada /models/ altından indirilir
  vi.stubGlobal('fetch', vi.fn(async () => new Response(NAMES, { headers: { 'Content-Type': 'application/json' } })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RegionPanel', () => {
  it('başlangıçta bütün bölgeler normal görünür', () => {
    const t = dictFor('tr')
    setup()
    expect(Object.values(BASE_STATUS).every((s) => s === 'normal')).toBe(true)
    expect(screen.getByText(t.panel.normalCount(8, 8))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: t.panel.allGood })).toBeInTheDocument()
  })

  it('genel bakışta işaretli bölge nedeniyle listelenir ve bölgeye geçilir', async () => {
    const t = dictFor('tr')
    const regions = regionsFor('tr')
    const props = setup({ statuses: { ...BASE_STATUS, sirt: 'dikkat' }, complaints: [complaint] })
    expect(screen.getByText(t.panel.normalCount(7, 8))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`${t.hologram.symptoms.pain}.*4/10`))).toBeInTheDocument()
    await userEvent.click(screen.getByText(regions.sirt.name))
    expect(props.onSelect).toHaveBeenCalledWith('sirt')
  })

  it('bölge kartında ad, durum, öneri ve kaynak görünür; asistana bölge sorusu gider', async () => {
    const t = dictFor('tr')
    const region = regionsFor('tr').gogus
    const props = setup({ selected: 'gogus' })
    expect(await screen.findByRole('heading', { name: region.name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: region.source.label })).toHaveAttribute('href', region.source.url)

    await userEvent.click(screen.getByRole('button', { name: t.panel.ask }))
    expect(props.onAsk).toHaveBeenCalledWith(t.panel.askQuestion(region.name))

    await userEvent.click(screen.getByRole('button', { name: t.panel.close }))
    expect(props.onSelect).toHaveBeenCalledWith(null)
  })

  it('bölgedeki analiz bulgusu nedeni ve yapılacakla birlikte uyarı kutusunda görünür', async () => {
    setup({ selected: 'eller', findings: [finding], statuses: { ...BASE_STATUS, eller: 'kritik' } }, 'en')
    const box = await screen.findByRole('alert')
    expect(box).toHaveTextContent(finding.title.en)
    expect(box).toHaveTextContent(finding.reason.en)
    expect(box).toHaveTextContent(finding.action.en)
  })

  it('bölgede açık şikayet şiddeti ile listelenir', async () => {
    setup({ selected: 'sirt', complaints: [complaint], statuses: { ...BASE_STATUS, sirt: 'dikkat' } })
    expect(await screen.findByText(/4\/10/)).toBeInTheDocument()
  })

  it('katmanlara ayrılınca katman listesi çıkar; seçilen katman tek başına açılır', async () => {
    const t = dictFor('en')
    const props = setup({ exploded: true }, 'en')
    expect(screen.getByRole('heading', { name: t.panel.layersHeading })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Muscular system/ }))
    expect(props.onFocusLayer).toHaveBeenCalledWith('muscles')
  })

  it('seçilen kasın Türkçe adı ve Latince adı görünür; asistana yapı bağlamıyla sorulur', async () => {
    const t = dictFor('tr')
    const [label, latin] = (JSON.parse(NAMES) as Record<string, [string, string, number][]>).muscles[0]
    const name = muscleNameTr(label)!
    const props = setup({ exploded: true, selectedStructure: { layer: 'muscles', id: 1 } })

    expect(await screen.findByRole('heading', { name }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText(latin)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: t.panel.ask }))
    expect(props.onAsk).toHaveBeenCalledWith(t.panel.askStructure(name), expect.objectContaining({ name, layer: 'muscles', symptom: null }))
  })
})

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURATED_EXTRA, isValidCurated, type EpicSnapshot } from '../core/gallery'
import { localBackend, type Backend } from '../data/backend'
import { memoryPhotoStore } from '../lib/photoStore'
import { dictFor, renderWithProviders } from '../test/render'
import { EarthGallery } from './EarthGallery'

/*
 * Dünya galerisi (docs/wellbeing GAL-01…GAL-04): kategoriler, görüntüleyici, kaynak bilgisi, favoriler, kişisel fotoğraf
 * yükleme (doğrulama, kota), silme onayı. Fotoğraf kaydı bellekte; görüntü çözme taklit edilir.
 */

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]
const jpeg = (name: string) => new File([new Uint8Array(JPEG)], name, { type: 'image/jpeg' })
const decode = async () => ({ width: 40, height: 30 })

const snapshot: EpicSnapshot = {
  retrieved: '2026-11-08T19:32:50.604Z',
  images: ['1', '2', '3'].map((n, i) => ({
    image: `epic_1b_${n}`,
    date: `2026-11-06 0${i}:00:00`,
    lat: 0,
    lon: 10 * i,
    url: `https://epic.gsfc.nasa.gov/archive/natural/2026/11/06/jpg/epic_1b_${n}.jpg`,
    local: `/data/nasa/epic/epic_1b_${n}.jpg`,
    localThumb: `/data/nasa/epic/thumbs/epic_1b_${n}.jpg`,
  })),
}
const loadEpic = () => Promise.resolve(snapshot)

beforeAll(() => {
  URL.createObjectURL ??= () => 'blob:x'
  URL.revokeObjectURL ??= () => {}
})
let backend: Backend
beforeEach(() => {
  localStorage.clear()
  backend = localBackend()
})

describe.each(['tr', 'en'] as const)('Dünya galerisi (%s)', (lang) => {
  const g = dictFor(lang).mindPage.gallery
  const render = (store = memoryPhotoStore()) => {
    renderWithProviders(<EarthGallery photoStore={store} loadEpic={loadEpic} decode={decode} />, { lang, backend })
    return store
  }
  const category = async (c: keyof typeof g.categories) => userEvent.setup().click(screen.getByRole('radio', { name: g.categories[c] }))
  const grid = () => screen.getByRole('list', { name: new RegExp(g.categories.orbit) })

  it('dört kategori; açılışta Doğa; doğa ve şehirlerde 8\'er doğrulanmış fotoğraf; yörüngeden Dünya EPIC görüntüleri', async () => {
    render()
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([g.categories.nature, g.categories.places, g.categories.orbit, g.categories.mine])
    expect(screen.getByRole('radio', { name: g.categories.nature })).toBeChecked()
    const nature = within(screen.getByRole('list', { name: new RegExp(g.categories.nature) })).getAllByRole('button')
    expect(nature).toHaveLength(8)
    // Erişilebilir ad: yer adı ve fotoğrafçı
    const first = CURATED_EXTRA.find((c) => c.category === 'nature')!
    expect(nature[0]).toHaveAccessibleName(g.open(g.photoAlt(first.title![lang], first.source.credit)))
    await category('places')
    expect(within(screen.getByRole('list', { name: new RegExp(g.categories.places) })).getAllByRole('button')).toHaveLength(8)
    await category('orbit')
    expect(await within(await screen.findByRole('list')).findAllByRole('button')).toHaveLength(3)
    expect(screen.getByText(g.snapshot(new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(Date.parse(snapshot.retrieved))))).toBeInTheDocument()
  })

  it('doğa ve şehir fotoğraflarının kaynağı eksiksizdir: yazar, serbest lisans ve lisans adresi, Commons sayfası, yer adı', () => {
    expect(CURATED_EXTRA).toHaveLength(16)
    for (const c of CURATED_EXTRA) {
      expect(isValidCurated(c), c.id).toBe(true)
      expect(c.source.name).toBe('Wikimedia Commons')
      expect(c.source.url, c.id).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(c.source.terms, c.id).toMatch(/^(CC0|CC BY(-SA)? [0-9.]+)/)
      expect(c.source.termsUrl, c.id).toMatch(/creativecommons\.org/)
      expect(c.title?.tr && c.title.en, c.id).toBeTruthy()
    }
  })

  it('küçük resim yüklenemezse karo boş kalmaz: uyarı ve yeniden dene; yeniden deneyince uyarı kalkar', async () => {
    const user = userEvent.setup()
    render()
    expect(screen.queryByRole('alert')).toBeNull()
    const list = screen.getByRole('list', { name: new RegExp(g.categories.nature) })
    fireEvent.error(list.querySelectorAll('img')[2])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(g.loadFailed)
    expect(document.querySelector('[data-empty]')).toBeNull()
    await user.click(within(alert).getByRole('button', { name: g.retry }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fotoğrafın görüntüleyicisinde yer adı, tarih (saat yok), yazar, lisans ve Commons bağlantısı', async () => {
    const user = userEvent.setup()
    render()
    await user.click(within(screen.getByRole('list', { name: new RegExp(g.categories.nature) })).getAllByRole('button')[0])
    const viewer = screen.getByRole('region', { name: g.viewer.label })
    const img = CURATED_EXTRA.find((c) => c.category === 'nature')!
    expect(viewer).toHaveTextContent(img.title![lang])
    const source = within(viewer).getByRole('region', { name: g.source.title })
    expect(source).toHaveTextContent(g.source.credit(img.source.credit))
    expect(within(source).getByRole('link', { name: g.source.terms(img.source.terms) })).toHaveAttribute('href', img.source.termsUrl)
    expect(within(source).getByRole('link', { name: g.source.originalCommons })).toHaveAttribute('href', img.source.url)
    expect(source).toHaveTextContent(g.source.date(new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(Date.parse(img.takenAt))))
  })

  it('uygulamanın görselleri yüklenemezse boş kategori gibi gösterilmez; açık hata ve yeniden deneme', async () => {
    let fail = true
    const load = () => (fail ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(snapshot))
    renderWithProviders(<EarthGallery photoStore={memoryPhotoStore()} loadEpic={load} decode={decode} />, { lang, backend })
    await category('orbit')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(g.loadFailed)
    expect(document.querySelector('[data-empty]')).toBeNull()
    fail = false
    await userEvent.setup().click(within(alert).getByRole('button', { name: g.retry }))
    expect(await within(await screen.findByRole('list')).findAllByRole('button')).toHaveLength(3)
  })

  it('görüntüleyici: Geri, Önceki, Sonraki ve ok tuşları; kaynak bilgisi görünür; otomatik geçiş yok', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render()
    await user.click(screen.getByRole('radio', { name: g.categories.orbit }))
    const thumbs = await within(await screen.findByRole('list')).findAllByRole('button')
    await user.click(thumbs[1])
    const viewer = screen.getByRole('region', { name: g.viewer.label })
    expect(viewer).toHaveAttribute('data-viewer', 'epic:epic_1b_2')
    expect(within(viewer).getByText(g.viewer.position(2, 3))).toBeInTheDocument()
    expect(within(viewer).getByRole('img').getAttribute('alt')).toMatch(/EPIC/)
    const source = within(viewer).getByRole('region', { name: g.source.title })
    expect(source).toHaveTextContent(g.source.credit('NASA EPIC Team'))
    expect(source).toHaveTextContent(g.offline)
    expect(within(source).getByRole('link', { name: g.source.original })).toHaveAttribute('href', snapshot.images[1].url)
    act(() => vi.advanceTimersByTime(60_000))
    expect(viewer).toHaveAttribute('data-viewer', 'epic:epic_1b_2')
    await user.click(within(viewer).getByRole('button', { name: g.viewer.next }))
    expect(within(viewer).getByRole('button', { name: g.viewer.next })).toBeDisabled()
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' })
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' })
    expect(viewer).toHaveAttribute('data-viewer', 'epic:epic_1b_1')
    expect(within(viewer).getByRole('button', { name: g.viewer.previous })).toBeDisabled()
    await user.click(within(viewer).getByRole('button', { name: g.viewer.back }))
    await waitFor(() => expect(document.activeElement).toBe(within(grid()).getAllByRole('button')[1]))
    vi.useRealTimers()
  })

  it('favori mürettebat üyesine göre kalıcıdır (yeniden açınca durur)', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<EarthGallery photoStore={memoryPhotoStore()} loadEpic={loadEpic} decode={decode} />, { lang, backend })
    await user.click(screen.getByRole('radio', { name: g.categories.orbit }))
    await user.click((await within(await screen.findByRole('list')).findAllByRole('button'))[0])
    await user.click(screen.getByRole('button', { name: g.favorite }))
    await waitFor(() => expect(screen.getByRole('button', { name: g.unfavorite })).toHaveAttribute('aria-pressed', 'true'))
    expect(await backend.call('galleryFavorites', 'yildiz')).toEqual(['epic:epic_1b_1'])
    view.unmount()
    renderWithProviders(<EarthGallery photoStore={memoryPhotoStore()} loadEpic={loadEpic} decode={decode} />, { lang, backend })
    await user.click(screen.getByRole('radio', { name: g.categories.orbit }))
    await waitFor(() => expect(document.querySelectorAll('[data-favorite]')).toHaveLength(1))
  })

  it('fotoğraflarım: paylaşılmadığı ve sınırlar yazılıdır; geçerli dosya eklenir, geçersizler nedeniyle reddedilir', async () => {
    const store = render()
    await category('mine')
    expect(document.querySelector('[data-mine-intro]')).toHaveTextContent(g.mine.intro)
    expect(document.querySelector('[data-limits]')).toHaveTextContent(g.mine.limits('JPEG, PNG, WEBP', 8, 40))
    expect(screen.getByText(g.mine.empty)).toBeInTheDocument()
    const input = document.querySelector<HTMLInputElement>('[data-photo-input]')!
    const gif = new File([new TextEncoder().encode('GIF89a')], 'anim.gif', { type: 'image/gif' })
    const empty = new File([], 'bos.jpg', { type: 'image/jpeg' })
    await userEvent.setup({ applyAccept: false }).upload(input, [jpeg('aile.jpg'), gif, empty])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(g.mine.added(1))
    expect(alert).toHaveTextContent(g.mine.errors.type('anim.gif'))
    expect(alert).toHaveTextContent(g.mine.errors.empty('bos.jpg'))
    expect([...store.records.values()].map((r) => [r.name, r.astronaut, r.blob instanceof Blob])).toEqual([['aile.jpg', 'yildiz', true]])
    expect(localStorage.getItem('vitalis.db') ?? '').not.toContain('aile.jpg')
    expect(await screen.findByRole('button', { name: new RegExp(g.mine.alt('aile.jpg', '').slice(0, 10)) })).toBeInTheDocument()
  })

  it('kota dolunca açık hata; mevcut fotoğraflar kalır', async () => {
    const store = memoryPhotoStore({ quotaBytes: JPEG.length * 1.5 })
    render(store)
    await category('mine')
    const input = document.querySelector<HTMLInputElement>('[data-photo-input]')!
    await userEvent.setup().upload(input, [jpeg('bir.jpg')])
    await screen.findByRole('status')
    await userEvent.setup().upload(input, [jpeg('iki.jpg')])
    expect(await screen.findByRole('alert')).toHaveTextContent(g.mine.errors.quota('iki.jpg'))
    expect([...store.records.values()].map((r) => r.name)).toEqual(['bir.jpg'])
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(1)
  })

  it('silme onay ister; vazgeçince kalır, onaylayınca silinir', async () => {
    const user = userEvent.setup()
    const store = render()
    await category('mine')
    await user.upload(document.querySelector<HTMLInputElement>('[data-photo-input]')!, [jpeg('ev.jpg')])
    await user.click(await within(await screen.findByRole('list')).findByRole('button'))
    await user.click(screen.getByRole('button', { name: g.mine.delete }))
    const confirm = screen.getByRole('alertdialog', { name: g.mine.delete })
    expect(confirm).toHaveTextContent(g.mine.confirmDelete)
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: g.mine.confirm }))
    await user.click(within(confirm).getByRole('button', { name: g.mine.cancel }))
    expect(store.records.size).toBe(1)
    await user.click(screen.getByRole('button', { name: g.mine.delete }))
    await user.click(screen.getByRole('button', { name: g.mine.confirm }))
    expect(await screen.findByRole('status')).toHaveTextContent(g.mine.deleted)
    expect(store.records.size).toBe(0)
    expect(screen.getByText(g.mine.empty)).toBeInTheDocument()
  })

  it('kişisel fotoğraf favorisi yalnızca bu tarayıcıda, fotoğrafla birlikte saklanır (sunucuya gitmez)', async () => {
    const user = userEvent.setup()
    const store = render()
    await category('mine')
    await user.upload(document.querySelector<HTMLInputElement>('[data-photo-input]')!, [jpeg('ev.jpg')])
    await user.click(await within(await screen.findByRole('list')).findByRole('button'))
    await user.click(screen.getByRole('button', { name: g.favorite }))
    await waitFor(() => expect([...store.records.values()][0].favorite).toBe(true))
    expect(await backend.call('galleryFavorites', 'yildiz')).toEqual([])
  })
})

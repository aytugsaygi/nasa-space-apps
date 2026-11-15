import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import { epicImages, isValidCurated, type CuratedImage } from './gallery'
import { MemoryStore } from './store'

const snapshot = {
  retrieved: '2026-11-08T19:32:50.604Z',
  images: [
    { image: 'epic_1b_1', date: '2026-11-06 00:22:24', lat: -8.2, lon: 159.9, url: 'https://epic.gsfc.nasa.gov/archive/natural/2026/11/06/jpg/epic_1b_1.jpg', local: '/data/nasa/epic/epic_1b_1.jpg', localThumb: '/data/nasa/epic/thumbs/epic_1b_1.jpg' },
    // Uygulamayla gelmeyen (yalnızca uzak) görüntü alınmaz
    { image: 'epic_1b_2', date: '2026-11-06 02:10:26', lat: -8.2, lon: 132.8, url: 'https://epic.gsfc.nasa.gov/x.jpg' },
  ],
}

describe('galeri içeriği', () => {
  it('EPIC anlık görüntüsünden yalnızca uygulamayla gelen dosyalar alınır; kaynak ve atıf eksiksizdir', () => {
    const list = epicImages(snapshot)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: 'epic:epic_1b_1', category: 'orbit', src: '/data/nasa/epic/epic_1b_1.jpg', takenAt: '2026-11-06T00:22:24Z' })
    expect(list[0].source).toMatchObject({ name: 'NASA EPIC', instrument: 'DSCOVR', credit: 'NASA EPIC Team', url: snapshot.images[0].url })
    expect(epicImages(null)).toEqual([])
  })

  it('kaynağı, atfı ya da kullanım koşulu eksik seçilmiş görsel geçersizdir', () => {
    const ok = epicImages(snapshot)[0]
    expect(isValidCurated(ok)).toBe(true)
    const bad = (patch: Partial<CuratedImage> | { source: Partial<CuratedImage['source']> }) => isValidCurated({ ...ok, ...patch } as CuratedImage)
    expect(bad({ source: { ...ok.source, credit: '' } })).toBe(false)
    expect(bad({ source: { ...ok.source, terms: '' } })).toBe(false)
    expect(bad({ source: { ...ok.source, url: '#' } })).toBe(false)
    expect(bad({ src: 'https://example.com/a.jpg' })).toBe(false)
  })
})

describe('galeri favorileri (motor)', () => {
  it('mürettebat üyesine göre saklanır; aynı işlem ikinci kez kayıt açmaz; geçersiz kimlik reddedilir', () => {
    const e = new Engine(new MemoryStore(), () => Date.UTC(2026, 10, 12))
    expect(e.setGalleryFavorite('yildiz', 'epic:epic_1b_1', true)).toEqual({ ok: true })
    expect(e.setGalleryFavorite('yildiz', 'epic:epic_1b_1', true)).toEqual({ ok: true })
    expect(e.galleryFavorites('yildiz')).toEqual(['epic:epic_1b_1'])
    expect(e.galleryFavorites('mori')).toEqual([])
    expect(e.setGalleryFavorite('yildiz', 'photo:ph_1', true)).toEqual({ ok: false, error: 'invalid' })
    expect(e.setGalleryFavorite('yildiz', 'epic:epic_1b_1', false)).toEqual({ ok: true })
    expect(e.galleryFavorites('yildiz')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { PHOTO_LIMITS } from '../core/gallery'
import { memoryPhotoStore, PhotoStoreFailure, sniffType, validatePhoto } from './photoStore'

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]
const file = (bytes: number[], name = 'a.jpg', type = 'image/jpeg', pad = 0) => new File([new Uint8Array([...bytes, ...new Array(pad).fill(0)])], name, { type })
const ok = async () => ({ width: 40, height: 30 })
const broken = async () => Promise.reject(new Error('decode'))

describe('kişisel fotoğraf doğrulaması', () => {
  it('tür dosyanın imzasından bulunur (uzantıya güvenilmez)', () => {
    expect(sniffType(new Uint8Array(JPEG))).toBe('image/jpeg')
    expect(sniffType(new Uint8Array(PNG))).toBe('image/png')
    expect(sniffType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffType(new TextEncoder().encode('GIF89a......'))).toBeNull()
  })

  it('geçerli JPEG kabul edilir; boyutları okunur', async () => {
    expect(await validatePhoto(file(JPEG), { count: 0, decode: ok })).toEqual({ ok: true, type: 'image/jpeg', width: 40, height: 30 })
  })

  it.each([
    ['desteklenmeyen tür (GIF, adı .jpg olsa da)', file([...new TextEncoder().encode('GIF89a')], 'x.jpg'), 0, ok, 'type'],
    ['boş dosya', new File([], 'e.png'), 0, ok, 'empty'],
    ['sınırdan büyük', file(JPEG, 'big.jpg', 'image/jpeg', PHOTO_LIMITS.maxBytes), 0, ok, 'size'],
    ['sayı sınırı dolu', file(JPEG), PHOTO_LIMITS.maxCount, ok, 'count'],
    ['bozuk (imza doğru, çözülemiyor)', file(JPEG), 0, broken, 'corrupt'],
  ] as const)('%s reddedilir', async (_, f, count, decode, error) => {
    expect(await validatePhoto(f, { count, decode })).toEqual({ ok: false, error })
  })
})

describe('fotoğraf kaydı', () => {
  const rec = (id: string, astronaut = 'yildiz', size = 10) => ({ id, astronaut, name: id, type: 'image/jpeg', size, addedAt: 1, width: 1, height: 1, favorite: false, blob: new Blob(['x']) })

  it('kota dolarsa yeni fotoğraf yazılmaz, eskiler kalır', async () => {
    const s = memoryPhotoStore({ quotaBytes: 15 })
    await s.add(rec('a'))
    await expect(s.add(rec('b'))).rejects.toMatchObject({ reason: 'quota' })
    expect((await s.list('yildiz')).map((r) => r.id)).toEqual(['a'])
  })

  it('başka astronotun fotoğrafı silinemez ve görünmez', async () => {
    const s = memoryPhotoStore()
    await s.add(rec('a', 'mori'))
    expect(await s.list('yildiz')).toEqual([])
    await expect(s.remove('yildiz', 'a')).rejects.toBeInstanceOf(PhotoStoreFailure)
  })
})

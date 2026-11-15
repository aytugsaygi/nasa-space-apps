import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { LanguageProvider, LOCALE, resolve, tx, useI18n } from '.'
import { en } from './en'
import { tr } from './tr'

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>

/** Sözlüğün bütün yaprak yollarını ve değer türlerini listeler (ör. "hologram.zoomIn: string") */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'function') return [`${path}: function(${value.length})`]
  if (Array.isArray(value)) return [`${path}: array(${value.length})`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k))
  return [`${path}: ${typeof value}`]
}

/** Sözlükteki bütün metinler (fonksiyonlar örnek değerle çağrılır) */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value('X', 'Y'))]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}

describe('sözlükler', () => {
  it('İngilizce sözlük Türkçeyle aynı anahtarlara, dizi uzunluklarına ve fonksiyon imzalarına sahip', () => {
    expect(shape(en)).toEqual(shape(tr))
  })

  it('hiçbir metin boş değil', () => {
    for (const s of [...texts(tr), ...texts(en)]) expect(s.trim()).not.toBe('')
  })

  it('İngilizce metinlerde Türkçe karakter kalmamış', () => {
    // Dil seçicisindeki "Türkçe" adı bilerek Türkçedir
    const leaks = texts({ ...en, lang: { ...en.lang, names: {} } }).filter((s) => /[çğışöüÇĞİŞÖÜ]/.test(s))
    expect(leaks).toEqual([])
  })
})

describe('tx ve resolve', () => {
  it('iç içe veri yapısındaki çiftleri seçilen dile çevirir, diğer değerleri korur', () => {
    const data = { name: tx('Göğüs', 'Chest'), value: 42, list: [tx('bir', 'one'), 'sabit'], nested: { label: tx('Nabız', 'Heart rate') } }
    expect(resolve(data, 'tr')).toEqual({ name: 'Göğüs', value: 42, list: ['bir', 'sabit'], nested: { label: 'Nabız' } })
    expect(resolve(data, 'en')).toEqual({ name: 'Chest', value: 42, list: ['one', 'sabit'], nested: { label: 'Heart rate' } })
  })
})

describe('useI18n', () => {
  it('kayıtlı dili açar; belge dilini ve başlığını ayarlar', () => {
    localStorage.setItem('vitalis.lang', 'en')
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe('en')
    expect(result.current.locale).toBe(LOCALE.en)
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe(en.meta.title)
  })

  it('dil değişince sözlük, belge dili ve kayıt güncellenir', () => {
    localStorage.setItem('vitalis.lang', 'en')
    const { result } = renderHook(() => useI18n(), { wrapper })
    act(() => result.current.setLang('tr'))
    expect(result.current.t.hologram.zoomIn).toBe(tr.hologram.zoomIn)
    expect(document.documentElement.lang).toBe('tr')
    expect(document.title).toBe(tr.meta.title)
    expect(localStorage.getItem('vitalis.lang')).toBe('tr')
  })

  it('kayıt yoksa tarayıcı diline göre açılır', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })
    expect(result.current.lang).toBe(navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en')
  })
})

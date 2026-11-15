import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en } from './en'
import { tr, type Dict } from './tr'

/*
 * Arayüz dili (TR / EN).
 * - Arayüz metinleri: tr.ts ve en.ts. en.ts, tr.ts'nin tipine uymak zorundadır;
 *   bir metnin İngilizcesi eksikse derleme hata verir.
 * - Veri metinleri (bölgeler, uyarılar, tur, asistan): tx(tr, en) çiftleriyle yazılır, resolve() ile seçilir.
 */

export type Lang = 'tr' | 'en'
export const LANGS: Lang[] = ['tr', 'en']

const DICTS: Record<Lang, Dict> = { tr, en }
const KEY = 'vitalis.lang'

/** Tarih, saat ve sayı biçimleri için yerel ayar */
export const LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' }

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'tr' || saved === 'en') return saved
  } catch {
    /* localStorage kapalı olabilir */
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(KEY, l)
    } catch {
      /* yoksay */
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = DICTS[lang].meta.title
  }, [lang])

  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>
}

export function useI18n() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n, LanguageProvider içinde kullanılmalı')
  const { lang, setLang } = v
  return useMemo(() => ({ lang, setLang, t: DICTS[lang], locale: LOCALE[lang] }), [lang, setLang])
}

/* ---------- İki dilli veri ---------- */

export interface Tx<T = string> {
  tr: T
  en: T
}

/** Bir metnin Türkçe ve İngilizce hâli */
export const tx = <T,>(trValue: T, enValue: T): Tx<T> => ({ tr: trValue, en: enValue })

export type Resolved<T> = T extends Tx<infer U>
  ? U
  : T extends (infer E)[]
    ? Resolved<E>[]
    : T extends (...args: never[]) => unknown
      ? T
      : T extends object
        ? { [K in keyof T]: Resolved<T[K]> }
        : T

function isTx(v: unknown): v is Tx<unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const keys = Object.keys(v)
  return keys.length === 2 && 'tr' in v && 'en' in v
}

/** İç içe bir veri yapısındaki tüm tx() çiftlerini seçilen dile çevirir */
export function resolve<T>(value: T, lang: Lang): Resolved<T> {
  if (isTx(value)) return (value as Tx<unknown>)[lang] as Resolved<T>
  if (Array.isArray(value)) return value.map((v) => resolve(v, lang)) as Resolved<T>
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, lang)
    return out as Resolved<T>
  }
  return value as Resolved<T>
}

/*
 * Çekirdek (src/core) hem tarayıcıda hem sunucuda çalışır; React'e bağlı değildir.
 * İki dilli metinler arayüzdeki tx() ile aynı yapıdadır, arayüz bunları resolve() ile çözer.
 */

export type Lang = 'tr' | 'en'

export interface Tx<T = string> {
  tr: T
  en: T
}

export const tx = <T,>(trValue: T, enValue: T): Tx<T> => ({ tr: trValue, en: enValue })

/** Sayıyı dile göre biçimler (TR'de ondalık virgül) */
export function num(value: number, lang: Lang, digits = 0): string {
  return value.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

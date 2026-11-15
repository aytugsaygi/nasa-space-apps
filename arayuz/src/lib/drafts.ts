import { useCallback, useSyncExternalStore } from 'react'

/*
 * Yazılmış ama henüz kaydedilmemiş metinler (ör. günlük notu). Bir pencere kapanıp yeniden açılınca ya da kişi başka
 * bir görünüme geçip geri dönünce yazdığı kaybolmasın diye oturum boyunca bellekte tutulur. Sağlık verisi olduğu için
 * tarayıcı deposuna yazılmaz; sayfa yenilenince silinir.
 */

const drafts = new Map<string, string>()
const listeners = new Set<() => void>()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function setDraft(key: string, value: string) {
  if (value) drafts.set(key, value)
  else drafts.delete(key)
  listeners.forEach((fn) => fn())
}

/** useState gibi çalışır; değer bileşen kapanıp açılsa da korunur */
export function useDraft(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => drafts.get(key) ?? '',
    () => '',
  )
  const set = useCallback((v: string) => setDraft(key, v), [key])
  return [value, set]
}

/** Testler için */
export function clearDrafts() {
  drafts.clear()
  listeners.forEach((fn) => fn())
}

import { useEffect, useState, useSyncExternalStore } from 'react'

/*
 * Etkileşim koordinasyonu: kişi bir şeyle meşgulken (acil destek, açık bir form ya da mesaj, nefes egzersizi, Cupola,
 * açık bir pencere, rehber tur, açılış) otomatik check-in sorusu gibi kendiliğinden açılan şeyler beklemeye alınır.
 * Bölümler meşgul olduklarını bildirir (useInteraction); otomatik içerik yalnızca kimse meşgul değilken, yazı alanında
 * odak yokken ve bir süre sessiz geçtikten sonra gösterilir (useIdle). Hiçbir şey kişinin elindeki işi kesmez.
 * R3F ve portallar ayrı ağaçlarda çalıştığı için durum bağlam (context) yerine modül düzeyinde tutulur.
 */

export type InteractionReason = 'dialog' | 'emergency' | 'form' | 'message' | 'breathing' | 'library' | 'assistant' | 'tour' | 'intro' | 'menu'

const active = new Map<symbol, InteractionReason>()
/** Son meşguliyet değişikliğinin anı (bitiş de sayılır: iş biter bitmez bir şey açılmasın) */
let lastChange = 0
/** Her değişiklikte artar: boş an sayacı her değişiklikte baştan başlar */
let version = 0
const listeners = new Set<() => void>()

function emit() {
  lastChange = Date.now()
  version++
  listeners.forEach((fn) => fn())
}

/** Bir etkileşimi başlatır; dönen işlev onu bitirir (birden çok kez çağrılabilir) */
export function beginInteraction(reason: InteractionReason): () => void {
  const token = Symbol(reason)
  active.set(token, reason)
  emit()
  return () => {
    if (active.delete(token)) emit()
  }
}

/** Şu an süren etkileşimlerin nedenleri */
export function activeInteractions(): InteractionReason[] {
  return [...active.values()]
}

/** Yazı alanında (input, textarea, düzenlenebilir alan) odak var mı: kişi bir şey yazıyor */
export function isTextEntryActive(doc: Document = document): boolean {
  const el = doc.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(type)
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Bölüm `on` iken meşguldür (ör. nefes egzersizi sürerken, pencere açıkken) */
export function useInteraction(reason: InteractionReason, on: boolean) {
  useEffect(() => (on ? beginInteraction(reason) : undefined), [reason, on])
}

/** Verilen nedenlerden biriyle süren bir etkileşim var mı */
export function useInteractionActive(reasons: readonly InteractionReason[]): boolean {
  return useSyncExternalStore(
    subscribe,
    () => [...active.values()].some((r) => reasons.includes(r)),
    () => false,
  )
}

/** Meşgul bir etkileşim var mı (yazı alanı odağı hariç) */
export function useBusy(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => active.size > 0,
    () => false,
  )
}

/**
 * Uygun boş an: hiçbir etkileşim sürmüyor, yazı alanında odak yok ve son değişiklikten beri `quietMs` geçti.
 * Odak değişiklikleri de izlenir: kişi yazmaya başlarsa boş an biter.
 */
export function useIdle(quietMs = 3000): boolean {
  const busy = useBusy()
  const changes = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  const [typing, setTyping] = useState(() => typeof document !== 'undefined' && isTextEntryActive())
  /** Sessizliğin dolduğu durumun anahtarı; durum değişince eşleşmez ve sayaç yeniden başlar */
  const [quietKey, setQuietKey] = useState('')
  const key = `${changes}:${typing}`

  useEffect(() => {
    // Odak çıkışında etkin öğe henüz değişmemiş olabilir: bir sonraki turda okunur
    const update = () => setTimeout(() => setTyping(isTextEntryActive()), 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  useEffect(() => {
    if (busy || typing) return
    const timer = setTimeout(() => setQuietKey(key), Math.max(0, lastChange + quietMs - Date.now()))
    return () => clearTimeout(timer)
  }, [busy, typing, key, quietMs])

  return !busy && !typing && quietKey === key
}

/** Testler için: bütün etkileşimleri temizler */
export function resetInteractions() {
  active.clear()
  lastChange = 0
  version++
  listeners.forEach((fn) => fn())
}

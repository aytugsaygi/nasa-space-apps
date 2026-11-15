import { useSyncExternalStore } from 'react'
import type { CrewId } from '../core/crew'

/**
 * Açılması istenen mesaj: rapor kartı Mesajlar sekmesine geçer, mesajı vurgular ve (cevap isteniyorsa) yazı alanına odaklanır.
 * Mesaj bildiriminden ya da rapor gönderildikten sonra kullanılır. Rol değişip kart yeniden kurulsa da istek kaybolmaz.
 */
export interface MessageFocus {
  /** Mesajın ait olduğu astronot (konuşma astronot ile hekim arasındadır) */
  astronaut: CrewId
  id: string
  /** Yazı alanına odaklanılsın mı (gelen mesaja cevap) */
  reply: boolean
  /** Aynı mesaj yeniden istendiğinde de çalışsın diye her istekte değişir */
  nonce: number
}

let current: MessageFocus | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function focusMessage(f: Omit<MessageFocus, 'nonce'>) {
  current = { ...f, nonce: Date.now() + Math.random() }
  emit()
}

/** İstek işlendikten sonra temizlenir (yalnızca hâlâ aynı istekse) */
export function clearMessageFocus(nonce: number) {
  if (current?.nonce !== nonce) return
  current = null
  emit()
}

export function useMessageFocus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => null,
  )
}

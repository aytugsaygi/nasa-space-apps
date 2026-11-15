import { useSyncExternalStore } from 'react'
import type { IndicatorId } from '../core/catalog'

/**
 * Gösterge gezgininde açılması istenen grafik. Ana sayfadaki mini grafiğe basınca kullanılır:
 * sağlık kayıtları sayfasındaki gezgin bu göstergeye ve aralığa geçer.
 */
export interface ExplorerFocus {
  id: IndicatorId
  period: 'day' | 'week' | 'custom'
  /** period 'custom' ise gösterilecek aralık (içe aktarılan verinin kapsadığı zaman) */
  range?: [number, number]
  /** Aynı gösterge yeniden istendiğinde de çalışsın diye her istekte değişir */
  nonce: number
}

let current: ExplorerFocus | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function focusExplorer(f: Omit<ExplorerFocus, 'nonce'>) {
  current = { ...f, nonce: Date.now() + Math.random() }
  emit()
}

/** İstek işlendikten sonra temizlenir (yalnızca hâlâ aynı istekse) */
export function clearExplorerFocus(nonce: number) {
  if (current?.nonce !== nonce) return
  current = null
  emit()
}

export function useExplorerFocus() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
    () => null,
  )
}

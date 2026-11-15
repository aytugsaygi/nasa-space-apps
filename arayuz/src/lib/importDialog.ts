import { useSyncExternalStore } from 'react'

/**
 * "Veri içe aktar" penceresi: uygulama düzeyinde tek yerde çizilir (App); gösterge gezgini ve Kaynaklar penceresindeki
 * "İçe aktarılan veri setleri" bölümü buradan açar.
 */
let open = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openImport() {
  open = true
  emit()
}

export function closeImport() {
  open = false
  emit()
}

export function useImportDialog() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => open,
    () => open,
  )
}

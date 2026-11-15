import { useSyncExternalStore } from 'react'
import type { HazardId } from '../core/hazards'

/**
 * "Uzay uçuşunun 5 tehlikesi" penceresi: uygulama düzeyinde tek yerde çizilir; gösterge penceresi ve ortam kartı
 * buradan açar. focus verilirse o tehlike öne çıkar.
 */
let state: { open: boolean; focus: HazardId | null } = { open: false, focus: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export function openHazards(focus: HazardId | null = null) {
  state = { open: true, focus }
  emit()
}

export function closeHazards() {
  state = { ...state, open: false }
  emit()
}

export function useHazardsDialog() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
    () => state,
  )
}
